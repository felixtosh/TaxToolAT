"use client";

import { Bell, MessageSquare, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ChatTab = "notifications" | "chat";

interface ChatTabsProps {
  activeTab: ChatTab;
  onTabChange: (tab: ChatTab) => void;
  onNewChat: () => void;
  onClose: () => void;
}

export function ChatTabs({
  activeTab,
  onTabChange,
  onNewChat,
  onClose,
}: ChatTabsProps) {
  return (
    <div className="flex items-center justify-between border-b px-2 h-14">
      {/* Tabs */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onTabChange("notifications")}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            activeTab === "notifications"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <Bell className="h-4 w-4" />
          Activity
        </button>
        <button
          onClick={() => onTabChange("chat")}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            activeTab === "chat"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <MessageSquare className="h-4 w-4" />
          Chat
        </button>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {activeTab === "chat" && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onNewChat}
            title="New Chat"
            className="h-8 w-8"
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          title="Close"
          className="h-8 w-8"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
