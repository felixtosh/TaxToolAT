"use client";

import { useRef, useEffect } from "react";
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

export function ChatSidebar() {
  const {
    messages,
    isLoading,
    pendingConfirmations,
    sendMessage,
    startNewSession,
    isSidebarOpen,
    toggleSidebar,
    activeTab,
    setActiveTab,
    notifications,
    unreadNotificationCount,
    markAllNotificationsRead,
    startConversationFromNotification,
  } = useChat();

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

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
        className={cn(
          "fixed left-0 top-0 z-40 h-full w-80 transform border-r bg-background transition-transform duration-300 ease-in-out",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
        onClick={handleSidebarClick}
      >
        <div className="flex h-full flex-col">
          {/* Header with Tabs */}
          <ChatTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            unreadCount={unreadNotificationCount}
            onNewChat={startNewSession}
            onClose={toggleSidebar}
          />

          {/* Content based on active tab */}
          {activeTab === "notifications" ? (
            <NotificationsList
              notifications={notifications}
              onStartConversation={startConversationFromNotification}
              onStartNewConversation={() => {
                setActiveTab("chat");
                startNewSession();
              }}
              onMarkAllRead={markAllNotificationsRead}
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
      </div>

      {/* Overlay for mobile */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/20 md:hidden"
          onClick={toggleSidebar}
        />
      )}
    </>
  );
}
