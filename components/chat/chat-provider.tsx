"use client";

import { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useChat as useVercelChat } from "@ai-sdk/react";
import { ChatContextValue, UIControlActions, ToolCall } from "@/types/chat";
import { requiresConfirmation, getConfirmationDetails } from "@/lib/chat/confirmation-config";

const ChatContext = createContext<ChatContextValue | null>(null);

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}

interface ChatProviderProps {
  children: React.ReactNode;
}

export function ChatProvider({ children }: ChatProviderProps) {
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [pendingConfirmations, setPendingConfirmations] = useState<ToolCall[]>([]);

  // Use Vercel AI SDK's useChat hook
  const chatHook = useVercelChat({
    api: "/api/chat",
    onToolCall: ({ toolCall }) => {
      // Check if this tool requires confirmation
      if (requiresConfirmation(toolCall.toolName)) {
        setPendingConfirmations((prev) => [
          ...prev,
          {
            id: toolCall.toolCallId,
            name: toolCall.toolName,
            args: toolCall.args as Record<string, unknown>,
            status: "pending",
            requiresConfirmation: true,
          },
        ]);
      }
    },
    onFinish: (message) => {
      // Handle UI actions from tool results
      if (message.toolInvocations) {
        for (const invocation of message.toolInvocations) {
          if (invocation.state === "result" && invocation.result) {
            const result = invocation.result as { action?: string; [key: string]: unknown };
            if (result.action) {
              handleUIAction(result);
            }
          }
        }
      }
    },
  });

  const { messages, status, setMessages, sendMessage: sdkSendMessage, error } = chatHook;
  const isLoading = status === "streaming" || status === "submitted";

  // Debug logging
  console.log("[Chat] status:", status);
  console.log("[Chat] error:", error);
  console.log("[Chat] messages:", messages);
  console.log("[Chat] raw messages:", JSON.stringify(messages, null, 2));

  // UI Control Actions
  const uiActions: UIControlActions = useMemo(
    () => ({
      navigateTo: (path: string) => {
        router.push(path);
      },

      openTransactionSheet: (transactionId: string) => {
        window.dispatchEvent(
          new CustomEvent("chat:openTransaction", {
            detail: { transactionId },
          })
        );
      },

      closeTransactionSheet: () => {
        window.dispatchEvent(new CustomEvent("chat:closeTransaction"));
      },

      scrollToTransaction: (transactionId: string) => {
        window.dispatchEvent(
          new CustomEvent("chat:scrollToTransaction", {
            detail: { transactionId },
          })
        );
      },

      highlightTransaction: (transactionId: string) => {
        window.dispatchEvent(
          new CustomEvent("chat:highlightTransaction", {
            detail: { transactionId },
          })
        );
      },

      showNotification: (message: string, type: "success" | "error" | "info") => {
        window.dispatchEvent(
          new CustomEvent("chat:notification", {
            detail: { message, type },
          })
        );
      },
    }),
    [router]
  );

  // Handle UI actions from tool results
  const handleUIAction = useCallback(
    (result: { action: string; [key: string]: unknown }) => {
      switch (result.action) {
        case "navigate":
          uiActions.navigateTo(result.path as string);
          break;
        case "openSheet":
          uiActions.openTransactionSheet(result.transactionId as string);
          break;
        case "scrollTo":
          uiActions.scrollToTransaction(result.transactionId as string);
          break;
      }
    },
    [uiActions]
  );

  // Send message using the SDK's sendMessage
  const sendMessage = useCallback(
    async (content: string) => {
      await sdkSendMessage({ role: "user", content });
    },
    [sdkSendMessage]
  );

  // Approve tool call (for confirmation flow)
  const approveToolCall = useCallback(async (toolCallId: string) => {
    setPendingConfirmations((prev) =>
      prev.map((tc) => (tc.id === toolCallId ? { ...tc, status: "approved" } : tc))
    );

    // The tool will be executed by the AI SDK
    // Remove from pending after a short delay
    setTimeout(() => {
      setPendingConfirmations((prev) => prev.filter((tc) => tc.id !== toolCallId));
    }, 1000);
  }, []);

  // Reject tool call
  const rejectToolCall = useCallback((toolCallId: string) => {
    setPendingConfirmations((prev) =>
      prev.map((tc) => (tc.id === toolCallId ? { ...tc, status: "rejected" } : tc))
    );

    // Remove from pending
    setTimeout(() => {
      setPendingConfirmations((prev) => prev.filter((tc) => tc.id !== toolCallId));
    }, 500);
  }, []);

  // Start new session (clear messages)
  const startNewSession = useCallback(async () => {
    setMessages([]);
    setPendingConfirmations([]);
  }, [setMessages]);

  // Load session (placeholder - will implement with Firestore)
  const loadSession = useCallback(async (sessionId: string) => {
    // TODO: Load from Firestore
    console.log("Loading session:", sessionId);
  }, []);

  // Toggle sidebar
  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => !prev);
  }, []);

  // Load sidebar state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("chatSidebarOpen");
    if (saved !== null) {
      setIsSidebarOpen(JSON.parse(saved));
    }
  }, []);

  // Save sidebar state to localStorage
  useEffect(() => {
    localStorage.setItem("chatSidebarOpen", JSON.stringify(isSidebarOpen));
  }, [isSidebarOpen]);

  const value: ChatContextValue = useMemo(
    () => ({
      messages: messages.map((m) => {
        // AI SDK v6 uses 'parts' array instead of 'content' string
        const textContent = m.parts
          ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join("") || (m as unknown as { content?: string }).content || "";

        return {
          id: m.id,
          role: m.role as "user" | "assistant" | "system",
          content: textContent,
          createdAt: new Date(),
          toolCalls: m.parts
            ?.filter((p): p is { type: "tool-invocation"; toolInvocation: { toolCallId: string; toolName: string; args: Record<string, unknown>; state: string } } =>
              p.type === "tool-invocation"
            )
            .map((p) => ({
              id: p.toolInvocation.toolCallId,
              name: p.toolInvocation.toolName,
              args: p.toolInvocation.args,
              status:
                p.toolInvocation.state === "result"
                  ? "executed"
                  : pendingConfirmations.find((pc) => pc.id === p.toolInvocation.toolCallId)?.status || "pending",
              requiresConfirmation: requiresConfirmation(p.toolInvocation.toolName),
            })),
        };
      }) as ChatContextValue["messages"],
      isLoading,
      isStreaming: isLoading,
      currentSession: null,
      sessions: [],
      pendingConfirmations,
      sendMessage,
      approveToolCall,
      rejectToolCall,
      startNewSession,
      loadSession,
      uiActions,
      isSidebarOpen,
      toggleSidebar,
    }),
    [
      messages,
      isLoading,
      pendingConfirmations,
      sendMessage,
      approveToolCall,
      rejectToolCall,
      startNewSession,
      loadSession,
      uiActions,
      isSidebarOpen,
      toggleSidebar,
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
