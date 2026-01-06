"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { MessageSquare, Send, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useChat } from "./chat-provider";
import { MessageBubble } from "./message-bubble";
import { ConfirmationCard } from "./confirmation-card";
import { ChatTabs } from "./chat-tabs";
import { NotificationsList } from "./notifications-list";

const MIN_SIDEBAR_WIDTH = 280;
const MAX_SIDEBAR_WIDTH = 600;

export function ChatSidebar() {
  const {
    messages,
    isLoading,
    pendingConfirmations,
    sendMessage,
    startNewSession,
    isSidebarOpen,
    toggleSidebar,
    sidebarWidth,
    setSidebarWidth,
    activeTab,
    setActiveTab,
    notifications,
  } = useChat();

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const currentWidthRef = useRef(sidebarWidth);
  const [isResizing, setIsResizing] = useState(false);

  // Keep currentWidthRef in sync with sidebarWidth
  useEffect(() => {
    currentWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  // Handle resize start
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeRef.current = { startX: e.clientX, startWidth: sidebarWidth };
  }, [sidebarWidth]);

  // Handle resize drag and end
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current || !panelRef.current) return;
      // For left sidebar: dragging right (positive delta) increases width
      const delta = e.clientX - resizeRef.current.startX;
      const newWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, resizeRef.current.startWidth + delta));
      // Update DOM directly during drag - no React re-render
      panelRef.current.style.width = `${newWidth}px`;
      currentWidthRef.current = newWidth;
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      // Commit to state only on drag end
      setSidebarWidth(currentWidthRef.current);
      resizeRef.current = null;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, setSidebarWidth]);

  // Scroll to bottom helper
  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  // Auto-scroll to bottom when new messages arrive or during streaming
  useEffect(() => {
    scrollToBottom();
  }, [messages, pendingConfirmations, isLoading]);

  // Focus input when clicking on empty chat area (not when selecting text)
  const handleSidebarClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // Don't focus if clicking on interactive elements or text content
    const isInteractive = target.closest("button, input, a, [role='button'], [tabindex]");
    const isTextContent = target.closest("p, span, td, th, div.prose, [class*='prose']");
    const hasSelection = window.getSelection()?.toString();

    // Only focus if clicking truly empty areas and not selecting text
    if (!isInteractive && !isTextContent && !hasSelection && inputRef.current) {
      inputRef.current.focus();
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = inputRef.current;
    if (!input || !input.value.trim() || isLoading) return;

    const message = input.value.trim();
    input.value = "";

    // Scroll immediately when sending and keep focus on input
    setTimeout(() => {
      scrollToBottom();
      inputRef.current?.focus();
    }, 0);

    await sendMessage(message);
  };

  return (
    <>
      {/* Toggle button when sidebar is closed */}
      {!isSidebarOpen && (
        <Button
          variant="outline"
          size="icon"
          onClick={toggleSidebar}
          className="fixed left-4 bottom-4 z-50 h-12 w-12 rounded-full shadow-lg"
          title="Open AI Chat"
        >
          <MessageSquare className="h-5 w-5" />
        </Button>
      )}

      {/* Sidebar */}
      <div
        ref={panelRef}
        className={cn(
          "fixed left-0 top-0 z-40 h-full transform bg-background transition-transform duration-300 ease-in-out flex",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ width: sidebarWidth }}
        onClick={handleSidebarClick}
      >
        <div className="flex h-full flex-col flex-1 border-r">
          {/* Header with Tabs */}
          <ChatTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onNewChat={startNewSession}
            onClose={toggleSidebar}
          />

          {/* Content based on active tab */}
          {activeTab === "notifications" ? (
            <NotificationsList
              notifications={notifications}
              onStartNewConversation={() => {
                setActiveTab("chat");
                startNewSession();
              }}
            />
          ) : (
            <>
              {/* Messages */}
              <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                <div className="space-y-4">
                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                      <MessageSquare className="mb-4 h-12 w-12 opacity-20" />
                      <p className="text-sm">Start a conversation with your AI tax assistant.</p>
                      <p className="mt-2 text-xs">
                        Try: "Show me my recent transactions" or "Categorize all Amazon purchases"
                      </p>
                    </div>
                  ) : (
                    messages.map((message) => (
                      <MessageBubble key={message.id} message={message} />
                    ))
                  )}

                  {/* Pending confirmations */}
                  {pendingConfirmations
                    .filter((tc) => tc.status === "pending")
                    .map((toolCall) => (
                      <ConfirmationCard key={toolCall.id} toolCall={toolCall} />
                    ))}

                  {/* Loading indicator */}
                  {isLoading && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Thinking...</span>
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Input */}
              <div className="border-t p-4">
                <form ref={formRef} onSubmit={handleSubmit} className="flex gap-2">
                  <Input
                    ref={inputRef}
                    placeholder={isLoading ? "Waiting for response..." : "Ask about your transactions..."}
                    className="flex-1"
                  />
                  <Button type="submit" size="icon" disabled={isLoading}>
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </form>
              </div>
            </>
          )}
        </div>
        {/* Resize handle - on right side for left sidebar */}
        <div
          className={cn(
            "w-1 cursor-col-resize bg-border hover:bg-primary/20 active:bg-primary/30 flex-shrink-0",
            isResizing && "bg-primary/30"
          )}
          onMouseDown={handleResizeStart}
        />
      </div>

      {/* Overlay for mobile */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/20 md:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Prevent text selection while resizing */}
      {isResizing && (
        <div className="fixed inset-0 z-50 cursor-col-resize" />
      )}
    </>
  );
}
