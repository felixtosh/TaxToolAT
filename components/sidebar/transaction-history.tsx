"use client";

import { useState, useEffect } from "react";
import { History, RotateCcw, Bot, User, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { TransactionHistoryEntry } from "@/types/transaction-history";
import { getTransactionHistory, rollbackTransaction } from "@/lib/operations/transaction-history-ops";
import { db } from "@/lib/firebase/config";

interface TransactionHistoryProps {
  transactionId: string;
  onRollback?: () => void;
  expandedByDefault?: boolean;
}

const MOCK_USER_ID = "dev-user-123";

export function TransactionHistory({ transactionId, onRollback, expandedByDefault = false }: TransactionHistoryProps) {
  const [history, setHistory] = useState<TransactionHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(expandedByDefault);
  const [error, setError] = useState<string | null>(null);

  // Load history when component opens
  useEffect(() => {
    async function loadHistory() {
      if (!isOpen || !transactionId) return;

      setIsLoading(true);
      setError(null);
      try {
        const ctx = { db, userId: MOCK_USER_ID };
        const entries = await getTransactionHistory(ctx, transactionId);
        setHistory(entries);
      } catch (err) {
        console.error("Failed to load history:", err);
        setError("Failed to load history");
      } finally {
        setIsLoading(false);
      }
    }

    loadHistory();
  }, [isOpen, transactionId]);

  const handleRollback = async (historyId: string) => {
    setIsRollingBack(historyId);
    try {
      const ctx = { db, userId: MOCK_USER_ID };
      await rollbackTransaction(ctx, transactionId, historyId, {
        type: "user",
        userId: MOCK_USER_ID,
      });

      // Reload history after rollback
      const entries = await getTransactionHistory(ctx, transactionId);
      setHistory(entries);

      // Notify parent to refresh transaction data
      onRollback?.();
    } catch (err) {
      console.error("Failed to rollback:", err);
      setError("Failed to rollback transaction");
    } finally {
      setIsRollingBack(null);
    }
  };

  const getAuthorIcon = (author: TransactionHistoryEntry["changedBy"]) => {
    switch (author.type) {
      case "ai_chat":
        return <Bot className="h-4 w-4 text-purple-500" />;
      case "import":
        return <Upload className="h-4 w-4 text-blue-500" />;
      default:
        return <User className="h-4 w-4 text-gray-500" />;
    }
  };

  const getAuthorLabel = (author: TransactionHistoryEntry["changedBy"]) => {
    switch (author.type) {
      case "ai_chat":
        return "AI Assistant";
      case "import":
        return "Import";
      default:
        return "User";
    }
  };

  const formatFieldName = (field: string) => {
    return field
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  };

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return "—";
    if (Array.isArray(value)) return `${value.length} items`;
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value);
  };

  // Content to render (shared between both modes)
  const historyContent = (
    <div className={cn(!expandedByDefault && "rounded-lg border bg-muted/30 p-3")}>
      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          <span className="text-sm text-muted-foreground">Loading history...</span>
        </div>
      ) : error ? (
        <div className="text-sm text-destructive py-2">{error}</div>
      ) : history.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          No edit history yet
        </p>
      ) : (
        <div className="space-y-3">
          {history.map((entry, index) => (
            <div
              key={entry.id}
              className={cn(
                "relative pl-4 pb-3",
                index !== history.length - 1 && "border-l border-muted-foreground/20"
              )}
            >
              {/* Timeline dot */}
              <div className="absolute -left-1.5 top-0 h-3 w-3 rounded-full border-2 border-background bg-muted-foreground/20" />

              <div className="ml-2">
                {/* Header with author and time */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {getAuthorIcon(entry.changedBy)}
                    <span className="text-xs font-medium">
                      {getAuthorLabel(entry.changedBy)}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {entry.createdAt?.toDate?.()?.toLocaleDateString("de-DE", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    }) ?? "Unknown"}
                  </span>
                </div>

                {/* Changed fields */}
                <div className="mt-1.5 space-y-1">
                  {entry.changedFields.map((field) => (
                    <div key={field} className="text-xs">
                      <span className="text-muted-foreground">
                        {formatFieldName(field)}:
                      </span>{" "}
                      <span className="font-mono">
                        {formatValue(entry.previousState[field as keyof typeof entry.previousState])}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Reason if provided */}
                {entry.changeReason && (
                  <p className="mt-1 text-xs text-muted-foreground italic">
                    {entry.changeReason}
                  </p>
                )}

                {/* Rollback button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-6 text-xs"
                  onClick={() => handleRollback(entry.id)}
                  disabled={isRollingBack === entry.id}
                >
                  {isRollingBack === entry.id ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      Rolling back...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Rollback to this
                    </>
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // When expanded by default, render content directly without collapsible
  if (expandedByDefault) {
    return historyContent;
  }

  // Normal collapsible mode
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
        >
          <History className="h-4 w-4" />
          <span>Edit History</span>
          {history.length > 0 && (
            <span className="ml-auto text-xs bg-muted px-2 py-0.5 rounded">
              {history.length}
            </span>
          )}
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-2">
        <ScrollArea className="max-h-[300px]">
          {historyContent}
        </ScrollArea>
      </CollapsibleContent>
    </Collapsible>
  );
}
