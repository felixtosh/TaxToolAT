"use client";

import { User, Wrench, CheckCircle, XCircle, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { ChatMessage, MessagePart, ToolCall } from "@/types/chat";
import { Badge } from "@/components/ui/badge";
import { useChat } from "./chat-provider";

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  // User messages: bubble with icon
  if (isUser) {
    return (
      <div className="flex gap-3 flex-row-reverse">
        {/* Avatar */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <User className="h-4 w-4" />
        </div>

        {/* Content */}
        <div className="flex max-w-[85%] flex-col gap-2 items-end">
          <div className="rounded-lg px-3 py-2 text-sm bg-primary text-primary-foreground">
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>
        </div>
      </div>
    );
  }

  // Assistant messages: render parts in order, no icon, no bubble
  return (
    <div className="flex flex-col gap-2 max-w-[95%]">
      {message.parts && message.parts.length > 0 ? (
        // Render parts in chronological order
        message.parts.map((part, index) => (
          <MessagePartRenderer key={index} part={part} />
        ))
      ) : (
        // Fallback to content string
        message.content && (
          <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 text-sm">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )
      )}
    </div>
  );
}

interface MessagePartRendererProps {
  part: MessagePart;
}

function MessagePartRenderer({ part }: MessagePartRendererProps) {
  if (part.type === "text") {
    return (
      <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 text-sm">
        <ReactMarkdown>{part.text}</ReactMarkdown>
      </div>
    );
  }

  if (part.type === "tool") {
    return <ToolCallBadge toolCall={part.toolCall} />;
  }

  return null;
}

interface ToolCallBadgeProps {
  toolCall: ToolCall;
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

  // Check if result is a transaction list
  const isTransactionList = toolCall.name === "listTransactions" &&
    Array.isArray(toolCall.result) &&
    toolCall.result.length > 0;

  return (
    <div className="flex flex-col gap-2">
      <Badge
        variant="outline"
        className={cn(
          "flex items-center gap-1 text-xs w-fit",
          statusColors[toolCall.status]
        )}
      >
        <Wrench className="h-3 w-3" />
        {formatToolName(toolCall.name)}
        {statusIcons[toolCall.status]}
      </Badge>

      {/* Mini-table for transaction results */}
      {isTransactionList && (
        <TransactionMiniTable transactions={toolCall.result as TransactionResult[]} />
      )}
    </div>
  );
}

interface TransactionResult {
  id: string;
  date: string;
  dateFormatted?: string;
  amount: number;
  amountFormatted: string;
  name: string;
  description: string | null;
  partner: string;
  isComplete: boolean;
  hasReceipts: boolean;
}

function TransactionMiniTable({ transactions }: { transactions: TransactionResult[] }) {
  const { uiActions } = useChat();

  const formatDate = (t: TransactionResult) => {
    // Use pre-formatted date if available
    if (t.dateFormatted) return t.dateFormatted;
    const date = new Date(t.date);
    return date.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  };

  const formatAmount = (amount: number) => {
    const euros = amount / 100;
    return euros.toLocaleString("de-DE", {
      style: "currency",
      currency: "EUR"
    });
  };

  const handleRowClick = (transactionId: string) => {
    uiActions.scrollToTransaction(transactionId);
    uiActions.openTransactionSheet(transactionId);
  };

  // Show max 5 transactions in mini-table
  const displayTransactions = transactions.slice(0, 5);
  const hasMore = transactions.length > 5;

  return (
    <div className="rounded-md border text-xs overflow-hidden">
      <table className="w-full">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-2 py-1 font-medium">Date</th>
            <th className="text-left px-2 py-1 font-medium">Name</th>
            <th className="text-right px-2 py-1 font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {displayTransactions.map((t) => (
            <tr
              key={t.id}
              className="border-t border-muted/50 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => handleRowClick(t.id)}
            >
              <td className="px-2 py-1 text-muted-foreground">{formatDate(t)}</td>
              <td className="px-2 py-1 truncate max-w-[100px]">{t.name}</td>
              <td className={cn(
                "px-2 py-1 text-right tabular-nums",
                t.amount < 0 ? "text-red-600" : "text-green-600"
              )}>
                {formatAmount(t.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {hasMore && (
        <div className="px-2 py-1 text-center text-muted-foreground bg-muted/30 border-t">
          +{transactions.length - 5} more
        </div>
      )}
    </div>
  );
}
