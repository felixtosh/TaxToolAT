/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useChat as useVercelChat } from "@ai-sdk/react";
import { ChatContextValue, ChatTab, UIControlActions, ToolCall } from "@/types/chat";
import { AutoActionNotification } from "@/types/notification";
import { requiresConfirmation, getConfirmationDetails } from "@/lib/chat/confirmation-config";
import { useNotifications } from "@/hooks/use-notifications";
import { useChatPersistence } from "@/hooks/use-chat-persistence";

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
  const [activeTab, setActiveTab] = useState<ChatTab>("notifications");

  // Notifications hook
  const {
    notifications,
    unreadCount: unreadNotificationCount,
    markRead: markNotificationRead,
    markAllRead: markAllNotificationsRead,
  } = useNotifications();

  // Chat persistence hook
  const {
    currentSessionId,
    isLoading: isSessionLoading,
    saveMessage,
  } = useChatPersistence();

  // Use Vercel AI SDK's useChat hook
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chatHook = (useVercelChat as any)({
    api: "/api/chat",
    onToolCall: ({ toolCall }: { toolCall: any }) => {
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
    onFinish: (message: any) => {
      // Handle UI actions from tool results
      if (message.toolInvocations) {
        for (const invocation of message.toolInvocations) {
          if (invocation.state === "result" && invocation.result) {
            const result = invocation.result as { action?: string; [key: string]: unknown };
            if (result.action) {
              handleUIAction(result as { action: string; [key: string]: unknown });
            }
          }
        }
      }
    },
  });

  const { messages, status, setMessages, sendMessage: sdkSendMessage } = chatHook;
  const isLoading = status === "streaming" || status === "submitted";

  // Track last saved message count to save new assistant messages
  const lastSavedMessageCount = useRef(0);

  // Save assistant messages when they complete
  useEffect(() => {
    if (isLoading || messages.length <= lastSavedMessageCount.current) return;

    // Save any new assistant messages
    const newMessages = messages.slice(lastSavedMessageCount.current);
    for (const msg of newMessages) {
      if (msg.role === "assistant") {
        // Extract text content from parts or content
        let textContent = "";
        if ((msg as { parts?: Array<{ type: string; text?: string }> }).parts) {
          textContent = (msg as { parts: Array<{ type: string; text?: string }> }).parts
            .filter((p) => p.type === "text" && p.text)
            .map((p) => p.text)
            .join("");
        } else if ((msg as { content?: string }).content) {
          textContent = (msg as { content: string }).content;
        }

        if (textContent) {
          saveMessage({
            role: "assistant",
            content: textContent,
          }).catch((err) => console.error("Failed to save assistant message:", err));
        }
      }
    }

    lastSavedMessageCount.current = messages.length;
  }, [messages, isLoading, saveMessage]);

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
      // Save user message to Firestore
      saveMessage({
        role: "user",
        content,
      }).catch((err) => console.error("Failed to save user message:", err));

      await sdkSendMessage({ role: "user", content });
    },
    [sdkSendMessage, saveMessage]
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

  // Start conversation from a notification
  const startConversationFromNotification = useCallback(
    (notification: AutoActionNotification) => {
      // Switch to chat tab
      setActiveTab("chat");

      // Mark notification as read
      markNotificationRead(notification.id);

      // Generate a context message based on notification type
      let contextMessage = "";
      switch (notification.type) {
        case "import_complete":
          contextMessage = `I just imported ${notification.context.transactionCount || "some"} transactions from ${notification.context.sourceName || "a bank account"}. Can you help me review and categorize them?`;
          break;
        case "partner_matching":
          if (notification.context.autoMatchedCount) {
            contextMessage = `You just matched ${notification.context.autoMatchedCount} transactions automatically. Can you show me what was matched and if there are any suggestions I should review?`;
          } else {
            contextMessage = `You found partner suggestions for ${notification.context.suggestionsCount || "some"} transactions. Can you show me these suggestions?`;
          }
          break;
        case "pattern_learned":
          contextMessage = `You learned new patterns for ${notification.context.partnerName || "a partner"} and matched ${notification.context.transactionsMatched || "some"} transactions. Can you show me what was matched?`;
          break;
        default:
          contextMessage = "Can you help me with my recent transactions?";
      }

      // Clear previous messages and send the context message
      setMessages([]);
      // Use setTimeout to ensure state is cleared before sending
      setTimeout(() => {
        sdkSendMessage({ role: "user", content: contextMessage });
      }, 100);
    },
    [markNotificationRead, setMessages, sdkSendMessage]
  );

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
      messages: messages.map((m: any) => {
        // AI SDK v6 uses 'parts' array - preserve order for chronological rendering
        const orderedParts: Array<{ type: "text"; text: string } | { type: "tool"; toolCall: NonNullable<ChatContextValue["messages"][0]["toolCalls"]>[0] }> = [];
        let fullTextContent = "";

        if (m.parts) {
          for (const p of m.parts) {
            if (p.type === "text" && (p as { text?: string }).text) {
              const text = (p as { text: string }).text;
              fullTextContent += text;
              orderedParts.push({ type: "text", text });
            } else if (typeof p.type === "string" && p.type.startsWith("tool-")) {
              const toolPart = p as { type: string; toolCallId: string; input?: Record<string, unknown>; output?: unknown; state: string };
              const toolName = toolPart.type.replace("tool-", "");
              orderedParts.push({
                type: "tool",
                toolCall: {
                  id: toolPart.toolCallId,
                  name: toolName,
                  args: toolPart.input || {},
                  result: toolPart.output,
                  status:
                    toolPart.state === "output-available"
                      ? "executed"
                      : toolPart.state === "input-available" || toolPart.state === "input-streaming"
                      ? "pending"
                      : pendingConfirmations.find((pc) => pc.id === toolPart.toolCallId)?.status || "pending",
                  requiresConfirmation: requiresConfirmation(toolName),
                },
              });
            }
          }
        }

        // Fallback for legacy content string
        if (!fullTextContent && (m as unknown as { content?: string }).content) {
          fullTextContent = (m as unknown as { content: string }).content;
          orderedParts.push({ type: "text", text: fullTextContent });
        }

        return {
          id: m.id,
          role: m.role as "user" | "assistant" | "system",
          content: fullTextContent,
          createdAt: new Date(),
          parts: orderedParts,
          toolCalls: orderedParts
            .filter((p): p is { type: "tool"; toolCall: NonNullable<ChatContextValue["messages"][0]["toolCalls"]>[0] } => p.type === "tool")
            .map((p) => p.toolCall),
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
      // Tabs & Notifications
      activeTab,
      setActiveTab,
      notifications,
      unreadNotificationCount,
      markNotificationRead,
      markAllNotificationsRead,
      startConversationFromNotification,
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
      activeTab,
      notifications,
      unreadNotificationCount,
      markNotificationRead,
      markAllNotificationsRead,
      startConversationFromNotification,
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
