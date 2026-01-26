"use client";

import Link from "next/link";
import { Receipt, FileCheck, FileX, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { TransactionResult, ToolResultUIActions } from "./types";

interface TransactionListResultProps {
  transactions: TransactionResult[];
  uiActions?: ToolResultUIActions;
  maxItems?: number;
  searchQuery?: string;
  totalCount?: number;
}

/**
 * GenUI preview for listTransactions tool results.
 * Shows a compact mini-table of transactions.
 */
export function TransactionListResult({
  transactions,
  uiActions,
  maxItems = 5,
  searchQuery,
  totalCount,
}: TransactionListResultProps) {
  const displayTransactions = transactions.slice(0, maxItems);
  // Use totalCount if provided (from API), otherwise fall back to array length
  const total = totalCount ?? transactions.length;
  const hasMore = total > maxItems;
  const moreCount = total - maxItems;

  const formatDate = (t: TransactionResult) => {
    if (t.dateFormatted) return t.dateFormatted;
    const date = new Date(t.date);
    return date.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const formatAmount = (amount: number) => {
    const euros = amount / 100;
    return euros.toLocaleString("de-DE", {
      style: "currency",
      currency: "EUR",
    });
  };

  const handleRowClick = (transactionId: string) => {
    uiActions?.scrollToTransaction?.(transactionId);
    uiActions?.openTransactionSheet?.(transactionId);
  };

  if (transactions.length === 0) {
    return (
      <div className="rounded-md border p-3 text-sm text-muted-foreground flex items-center gap-2">
        <Receipt className="h-4 w-4" />
        <span>No transactions found</span>
      </div>
    );
  }

  return (
    <div className="rounded-md border text-xs overflow-hidden">
      {/* Header row */}
      <div className="bg-muted/50 grid grid-cols-[auto_1fr_auto_auto] gap-2 px-2 py-1.5 border-b">
        <span className="font-medium text-muted-foreground w-[70px]">Date</span>
        <span className="font-medium text-muted-foreground">Name</span>
        <span className="font-medium text-muted-foreground text-right w-[80px]">Amount</span>
        <span className="w-5"></span>
      </div>

      {/* Transaction rows */}
      <div className="divide-y divide-muted/50">
        {displayTransactions.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => handleRowClick(t.id)}
            className="w-full grid grid-cols-[auto_1fr_auto_auto] gap-2 px-2 py-2 hover:bg-muted/50 transition-colors text-left items-center"
          >
            {/* Date */}
            <span className="text-muted-foreground w-[70px]">
              {formatDate(t)}
            </span>

            {/* Name with partner */}
            <div className="min-w-0 overflow-hidden">
              <span className="truncate block">{t.name}</span>
              {t.partner && t.partner !== t.name && (
                <span className="text-[10px] text-muted-foreground truncate block">
                  {t.partner}
                </span>
              )}
            </div>

            {/* Amount */}
            <span
              className={cn(
                "text-right tabular-nums w-[80px]",
                t.amount < 0 ? "text-amount-negative" : "text-amount-positive"
              )}
            >
              {formatAmount(t.amount)}
            </span>

            {/* Status indicator */}
            <div className="w-5 flex justify-center">
              {t.hasReceipts ? (
                <FileCheck className="h-3.5 w-3.5 text-green-600" />
              ) : (
                <FileX className="h-3.5 w-3.5 text-muted-foreground/50" />
              )}
            </div>
          </button>
        ))}
      </div>

      {/* More indicator - links to transactions page with search */}
      {hasMore && (
        searchQuery ? (
          <Link
            href={`/transactions?search=${encodeURIComponent(searchQuery)}`}
            className="block px-2 py-1.5 text-center text-muted-foreground bg-muted/30 border-t hover:bg-muted/50 hover:text-foreground transition-colors group"
          >
            <span className="flex items-center justify-center gap-1">
              +{moreCount} more
              <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </span>
          </Link>
        ) : (
          <div className="px-2 py-1 text-center text-muted-foreground bg-muted/30 border-t">
            +{moreCount} more
          </div>
        )
      )}
    </div>
  );
}
