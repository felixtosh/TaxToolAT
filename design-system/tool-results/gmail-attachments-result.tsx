"use client";

import { Mail, Paperclip, Check, AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { IntegrationStatusBanner } from "@/components/automations/integration-status-banner";
import { GmailAttachmentsSearchResult, GmailAttachmentCandidate, ToolResultUIActions } from "./types";

interface GmailAttachmentsResultProps {
  result: GmailAttachmentsSearchResult;
  uiActions?: ToolResultUIActions;
  maxItems?: number;
}

/**
 * GenUI preview for searchGmailAttachments tool results.
 * Shows a compact list of matching Gmail attachments with scores.
 */
export function GmailAttachmentsResult({
  result,
  uiActions,
  maxItems = 5,
}: GmailAttachmentsResultProps) {
  const { candidates, totalFound, queriesUsed, integrationCount } = result;
  const displayCandidates = candidates.slice(0, maxItems);
  const hasMore = totalFound > maxItems;

  const handleRowClick = (candidate: GmailAttachmentCandidate) => {
    if (candidate.existingFileId && uiActions?.openFile) {
      uiActions.openFile(candidate.existingFileId);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return null;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/50 dark:text-green-200";
    if (score >= 70) return "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/50 dark:text-yellow-200";
    return "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300";
  };

  const truncateEmail = (email?: string) => {
    if (!email) return null;
    // Extract name part if present (e.g., "John Doe <john@example.com>" -> "John Doe")
    const nameMatch = email.match(/^([^<]+)</);
    if (nameMatch) return nameMatch[1].trim();
    // Otherwise just return the email, truncated
    return email.length > 25 ? email.slice(0, 22) + "..." : email;
  };

  // Show connect banner when Gmail is not connected
  if (result.gmailNotConnected) {
    return (
      <div className="rounded-md border text-xs overflow-hidden">
        {/* Header */}
        <div className="bg-muted/50 px-3 py-2 flex items-center justify-between border-b">
          <div className="flex items-center gap-2">
            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium text-sm">Gmail Attachments</span>
          </div>
        </div>

        {/* Connect Gmail banner */}
        <div className="p-3">
          <IntegrationStatusBanner
            integration={{
              id: "gmail",
              displayName: "Gmail",
              isConnected: false,
              needsReauth: false,
            }}
          />
        </div>
      </div>
    );
  }

  const { integrationsNeedingReauth } = result;

  if (candidates.length === 0) {
    return (
      <div className="rounded-md border text-xs overflow-hidden">
        {/* Header */}
        <div className="bg-muted/50 px-3 py-2 flex items-center justify-between border-b">
          <div className="flex items-center gap-2">
            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium text-sm">Gmail Attachments</span>
          </div>
          <span className="text-muted-foreground">0 found</span>
        </div>

        {/* Search queries used - show even with no results */}
        {queriesUsed.length > 0 && (
          <div className="px-3 py-1.5 bg-muted/20 border-b flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-muted-foreground">Searched:</span>
            {queriesUsed.slice(0, 3).map((query, idx) => (
              <Badge key={idx} variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-mono">
                {query}
              </Badge>
            ))}
            {queriesUsed.length > 3 && (
              <span className="text-[10px] text-muted-foreground">+{queriesUsed.length - 3} more</span>
            )}
          </div>
        )}

        {/* Warning banner for integrations needing reauth */}
        {integrationsNeedingReauth && integrationsNeedingReauth.length > 0 && (
          <div className="px-3 py-2 text-xs text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-200 border-b flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-[11px]">Reconnect Integration</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {integrationsNeedingReauth.map((integration) => (
                  <Button
                    key={integration.integrationId}
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[10px] border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/40"
                    asChild
                  >
                    <a href={`/integrations/${integration.integrationId}?toggleReconnect=true`}>
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Gmail: {integration.email}
                    </a>
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Empty state message */}
        <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
          <Mail className="h-4 w-4" />
          <span>No matching Gmail attachments found</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border text-xs overflow-hidden">
      {/* Header */}
      <div className="bg-muted/50 px-3 py-2 flex items-center justify-between border-b">
        <div className="flex items-center gap-2">
          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium text-sm">Gmail Attachments</span>
          {integrationCount > 1 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
              {integrationCount} accounts
            </Badge>
          )}
        </div>
        <span className="text-muted-foreground">
          {totalFound} found
        </span>
      </div>

      {/* Search queries used */}
      {queriesUsed.length > 0 && (
        <div className="px-3 py-1.5 bg-muted/20 border-b flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-muted-foreground">Searched:</span>
          {queriesUsed.slice(0, 3).map((query, idx) => (
            <Badge key={idx} variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-mono">
              {query}
            </Badge>
          ))}
          {queriesUsed.length > 3 && (
            <span className="text-[10px] text-muted-foreground">+{queriesUsed.length - 3} more</span>
          )}
        </div>
      )}

      {/* Warning banner for integrations needing reauth */}
      {integrationsNeedingReauth && integrationsNeedingReauth.length > 0 && (
        <div className="px-3 py-2 text-xs text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-200 border-b flex items-start gap-2">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-[11px]">Reconnect Integration</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {integrationsNeedingReauth.map((integration) => (
                <Button
                  key={integration.integrationId}
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[10px] border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/40"
                  asChild
                >
                  <a href={`/integrations/${integration.integrationId}?toggleReconnect=true`}>
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Gmail: {integration.email}
                  </a>
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Results list - compact single-line rows */}
      <div className="divide-y divide-muted/50">
        {displayCandidates.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            onClick={() => handleRowClick(candidate)}
            disabled={!candidate.alreadyDownloaded}
            className={cn(
              "w-full flex items-center gap-2 px-2.5 py-1.5 transition-colors text-left",
              candidate.alreadyDownloaded
                ? "hover:bg-muted/50 cursor-pointer"
                : "cursor-default"
            )}
          >
            {/* Attachment icon - smaller */}
            {candidate.alreadyDownloaded ? (
              <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />
            ) : (
              <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}

            {/* Filename - single line */}
            <span className="text-xs font-medium truncate flex-1 min-w-0">
              {candidate.attachmentFilename || candidate.emailSubject || "Unnamed attachment"}
            </span>

            {/* Date */}
            {candidate.emailDate && (
              <span className="text-[10px] text-muted-foreground shrink-0">
                {formatDate(candidate.emailDate)}
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
                {candidate.emailSubject && (
                  <div className="text-muted-foreground mb-1 truncate">{candidate.emailSubject}</div>
                )}
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

      {/* More indicator */}
      {hasMore && (
        <div className="px-3 py-1.5 text-center text-muted-foreground bg-muted/30 border-t">
          +{totalFound - maxItems} more attachments
        </div>
      )}
    </div>
  );
}
