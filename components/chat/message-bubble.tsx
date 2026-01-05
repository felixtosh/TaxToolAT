"use client";

import { User, Bot, Wrench, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatMessage } from "@/types/chat";
import { Badge } from "@/components/ui/badge";

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  return (
    <div
      className={cn(
        "flex gap-3",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      {/* Content */}
      <div
        className={cn(
          "flex max-w-[85%] flex-col gap-2",
          isUser ? "items-end" : "items-start"
        )}
      >
        {/* Message text */}
        {message.content && (
          <div
            className={cn(
              "rounded-lg px-3 py-2 text-sm",
              isUser
                ? "bg-primary text-primary-foreground"
                : "bg-muted"
            )}
          >
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>
        )}

        {/* Tool calls */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {message.toolCalls.map((toolCall) => (
              <ToolCallBadge key={toolCall.id} toolCall={toolCall} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface ToolCallBadgeProps {
  toolCall: NonNullable<ChatMessage["toolCalls"]>[number];
}

function ToolCallBadge({ toolCall }: ToolCallBadgeProps) {
  const statusIcons = {
    pending: <Loader2 className="h-3 w-3 animate-spin" />,
    approved: <CheckCircle className="h-3 w-3 text-green-500" />,
    rejected: <XCircle className="h-3 w-3 text-red-500" />,
    executed: <CheckCircle className="h-3 w-3 text-green-500" />,
  };

  const statusColors = {
    pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
    approved: "bg-green-100 text-green-800 border-green-200",
    rejected: "bg-red-100 text-red-800 border-red-200",
    executed: "bg-blue-100 text-blue-800 border-blue-200",
  };

  // Format tool name for display
  const formatToolName = (name: string) => {
    return name
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  };

  return (
    <Badge
      variant="outline"
      className={cn(
        "flex items-center gap-1 text-xs",
        statusColors[toolCall.status]
      )}
    >
      <Wrench className="h-3 w-3" />
      {formatToolName(toolCall.name)}
      {statusIcons[toolCall.status]}
    </Badge>
  );
}
