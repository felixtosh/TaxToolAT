"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { WorkerMessage } from "@/types/worker";
import { MessageBubble } from "./message-bubble";
import { RuntimeChatMessage } from "@/types/chat";
import { Timestamp } from "firebase/firestore";

interface MiniTranscriptProps {
  messages: WorkerMessage[];
  maxHeight?: number;
}

/**
 * Lightweight transcript renderer for worker activity.
 * Reuses MessageBubble for consistent message rendering.
 */
export function MiniTranscript({ messages, maxHeight = 400 }: MiniTranscriptProps) {
  if (!messages || messages.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic py-2">
        No transcript available
      </div>
    );
  }

  // Convert WorkerMessages to RuntimeChatMessages for MessageBubble
  // Use type assertion since both Timestamp types are compatible at runtime
  const chatMessages: RuntimeChatMessage[] = messages.map((msg) => ({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    parts: msg.parts,
    createdAt: msg.createdAt as unknown as RuntimeChatMessage["createdAt"],
  }));

  return (
    <ScrollArea
      className="w-full border rounded-md bg-muted/20"
      style={{ maxHeight }}
    >
      <div className="p-3 space-y-3">
        {chatMessages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      </div>
    </ScrollArea>
  );
}
