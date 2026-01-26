"use client";

import Link from "next/link";
import { FileText, FileCheck, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { FileResult, ToolResultUIActions } from "./types";

interface FileListResultProps {
  files: FileResult[];
  uiActions?: ToolResultUIActions;
  maxItems?: number;
  searchQuery?: string;
  totalCount?: number;
}

/**
 * GenUI preview for listFiles tool results.
 * Shows a compact mini-table of files with Date | Name | Amount columns.
 */
export function FileListResult({
  files,
  uiActions,
  maxItems = 5,
  searchQuery,
  totalCount,
}: FileListResultProps) {
  const displayFiles = files.slice(0, maxItems);
  // Use totalCount if provided (from API), otherwise fall back to array length
  const total = totalCount ?? files.length;
  const hasMore = total > maxItems;
  const moreCount = total - maxItems;

  const handleRowClick = (fileId: string) => {
    uiActions?.openFile?.(fileId);
  };

  if (files.length === 0) {
    return (
      <div className="rounded-md border p-3 text-sm text-muted-foreground flex items-center gap-2">
        <FileText className="h-4 w-4" />
        <span>No files found</span>
      </div>
    );
  }

  return (
    <div className="rounded-md border text-xs overflow-hidden">
      {/* Header row */}
      <div className="bg-muted/50 grid grid-cols-[70px_1fr_70px_auto] gap-2 px-2 py-1.5 border-b">
        <span className="font-medium text-muted-foreground">Date</span>
        <span className="font-medium text-muted-foreground">Name</span>
        <span className="font-medium text-muted-foreground text-right">Amount</span>
        <span className="w-5"></span>
      </div>

      {/* File rows */}
      <div className="divide-y divide-muted/50">
        {displayFiles.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => handleRowClick(f.id)}
            className="w-full grid grid-cols-[70px_1fr_70px_auto] gap-2 px-2 py-2 hover:bg-muted/50 transition-colors text-left items-center"
          >
            {/* Date */}
            <span className="text-muted-foreground">
              {f.dateFormatted}
            </span>

            {/* Name with partner */}
            <div className="min-w-0 overflow-hidden flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <span className="truncate block">{f.fileName}</span>
                {f.partnerName && (
                  <span className="text-[10px] text-muted-foreground truncate block">
                    {f.partnerName}
                  </span>
                )}
              </div>
            </div>

            {/* Amount */}
            <span
              className={cn(
                "text-right tabular-nums",
                f.amount
                  ? (f.amount < 0 ? "text-amount-negative" : "text-amount-positive")
                  : "text-muted-foreground"
              )}
            >
              {f.amountFormatted || "—"}
            </span>

            {/* Status indicator */}
            <div className="w-5 flex justify-center">
              {f.hasTransaction && (
                <FileCheck className="h-3.5 w-3.5 text-green-600" />
              )}
            </div>
          </button>
        ))}
      </div>

      {/* More indicator - links to files page with search */}
      {hasMore && (
        searchQuery ? (
          <Link
            href={`/files?search=${encodeURIComponent(searchQuery)}`}
            className="block px-2 py-1.5 text-center text-muted-foreground bg-muted/30 border-t hover:bg-muted/50 hover:text-foreground transition-colors group"
          >
            <span className="flex items-center justify-center gap-1">
              +{moreCount} more
              <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </span>
          </Link>
        ) : (
          <Link
            href="/files"
            className="block px-2 py-1.5 text-center text-muted-foreground bg-muted/30 border-t hover:bg-muted/50 hover:text-foreground transition-colors group"
          >
            <span className="flex items-center justify-center gap-1">
              +{moreCount} more
              <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </span>
          </Link>
        )
      )}
    </div>
  );
}
