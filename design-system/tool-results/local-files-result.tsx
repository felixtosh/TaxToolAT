"use client";

import Link from "next/link";
import { FileText, FolderSearch, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LocalFilesSearchResult, LocalFileCandidate, ToolResultUIActions } from "./types";

interface LocalFilesResultProps {
  result: LocalFilesSearchResult;
  uiActions?: ToolResultUIActions;
  maxItems?: number;
}

/**
 * GenUI preview for searchLocalFiles tool results.
 * Shows a compact list of matching local files with scores.
 */
export function LocalFilesResult({
  result,
  uiActions,
  maxItems = 5,
}: LocalFilesResultProps) {
  const { candidates, totalFound, strategy, searchedTransaction } = result;
  const displayCandidates = candidates.slice(0, maxItems);
  const hasMore = totalFound > maxItems;

  const handleRowClick = (candidate: LocalFileCandidate) => {
    if (candidate.fileId && uiActions?.openFile) {
      uiActions.openFile(candidate.fileId);
    }
  };

  const formatAmount = (amount: number) => {
    const euros = amount / 100;
    return euros.toLocaleString("de-DE", {
      style: "currency",
      currency: "EUR",
    });
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/50 dark:text-green-200";
    if (score >= 70) return "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/50 dark:text-yellow-200";
    return "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300";
  };

  const strategyLabels: Record<string, string> = {
    partner_files: "Partner",
    amount_files: "Amount",
    both: "Combined",
  };

  if (candidates.length === 0) {
    return (
      <div className="rounded-md border p-3 text-sm text-muted-foreground flex items-center gap-2">
        <FolderSearch className="h-4 w-4" />
        <span>No matching local files found</span>
      </div>
    );
  }

  return (
    <div className="rounded-md border text-xs overflow-hidden">
      {/* Header */}
      <div className="bg-muted/50 px-3 py-2 flex items-center justify-between border-b">
        <div className="flex items-center gap-2">
          <FolderSearch className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium text-sm">Local Files</span>
          {strategy && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
              {strategyLabels[strategy] || strategy}
            </Badge>
          )}
        </div>
        <span className="text-muted-foreground">
          {totalFound} found
        </span>
      </div>

      {/* Results list - compact single-line rows */}
      <div className="divide-y divide-muted/50">
        {displayCandidates.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            onClick={() => handleRowClick(candidate)}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-muted/50 transition-colors text-left"
          >
            {/* File icon - smaller */}
            <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

            {/* Filename - single line */}
            <span className="text-xs font-medium truncate flex-1 min-w-0">
              {candidate.fileName || "Unnamed file"}
            </span>

            {/* Extracted amount if available */}
            {candidate.extractedAmount && (
              <span className={cn(
                "text-[10px] font-medium shrink-0",
                candidate.extractedAmount < 0 ? "text-red-600" : "text-green-600"
              )}>
                {formatAmount(candidate.extractedAmount)}
              </span>
            )}

            {/* Score badge */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className={cn("text-[10px] py-0 h-4 cursor-help shrink-0", getScoreColor(candidate.score))}
                >
                  {candidate.score}%
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-[240px] text-xs">
                <div className="font-medium mb-1">Match signals</div>
                <div className="space-y-0.5">
                  {candidate.scoreReasons && candidate.scoreReasons.length > 0 ? (
                    candidate.scoreReasons.map((reason, idx) => (
                      <div key={idx} className="text-muted-foreground">{reason}</div>
                    ))
                  ) : (
                    <div className="text-muted-foreground">No specific signals</div>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </button>
        ))}
      </div>

      {/* More indicator - links to files page with unconnected filter */}
      {hasMore && (
        <Link
          href="/files?connected=false"
          className="block px-3 py-1.5 text-center text-muted-foreground bg-muted/30 border-t hover:bg-muted/50 hover:text-foreground transition-colors group"
        >
          <span className="flex items-center justify-center gap-1">
            +{totalFound - maxItems} more files
            <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </span>
        </Link>
      )}
    </div>
  );
}
