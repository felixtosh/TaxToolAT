"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Globe,
  Plus,
  Trash2,
  RefreshCw,
  Pause,
  Play,
  ExternalLink,
  AlertCircle,
  Clock,
  Calendar,
  Loader2,
  ChevronDown,
  ChevronUp,
  Link as LinkIcon,
} from "lucide-react";
import {
  UserPartner,
  InvoiceSource,
  InvoiceSourceStatus,
} from "@/types/partner";
import { format, formatDistanceToNow } from "date-fns";
import { Timestamp } from "firebase/firestore";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface InvoiceSourcesSectionProps {
  partner: UserPartner;
  onAddSource: (url: string, label?: string) => Promise<string | void>;
  onRemoveSource: (sourceId: string) => Promise<void>;
  onToggleStatus: (
    sourceId: string,
    newStatus: "active" | "paused"
  ) => Promise<void>;
  onFetchNow: (sourceId: string) => Promise<void>;
  onPromoteLink?: (linkIndex: number) => Promise<string | void>;
  onInferFrequency?: (sourceId: string) => Promise<void>;
  isLoading?: boolean;
}

/**
 * Get a human-readable label for frequency in days
 */
function getFrequencyLabel(days: number): string {
  if (days === 7) return "Weekly";
  if (days === 14) return "Bi-weekly";
  if (days >= 28 && days <= 31) return "Monthly";
  if (days >= 89 && days <= 92) return "Quarterly";
  if (days >= 180 && days <= 183) return "Semi-annually";
  if (days >= 364 && days <= 366) return "Yearly";
  return `Every ${days} days`;
}

/**
 * Get badge variant based on source status
 */
function getStatusBadge(status: InvoiceSourceStatus) {
  switch (status) {
    case "active":
      return (
        <Badge variant="outline" className="text-green-600 border-green-300">
          Active
        </Badge>
      );
    case "paused":
      return (
        <Badge variant="outline" className="text-yellow-600 border-yellow-300">
          Paused
        </Badge>
      );
    case "error":
      return (
        <Badge variant="outline" className="text-red-600 border-red-300">
          Error
        </Badge>
      );
    case "needs_login":
      return (
        <Badge variant="outline" className="text-orange-600 border-orange-300">
          Login Required
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

/**
 * Format a Firestore Timestamp for display
 */
function formatTimestamp(ts: Timestamp | undefined): string {
  if (!ts) return "Never";
  try {
    return formatDistanceToNow(ts.toDate(), { addSuffix: true });
  } catch {
    return "Unknown";
  }
}

/**
 * Single invoice source item
 */
function InvoiceSourceItem({
  source,
  onRemove,
  onToggleStatus,
  onFetchNow,
  onInferFrequency,
  isLoading,
}: {
  source: InvoiceSource;
  onRemove: () => void;
  onToggleStatus: () => void;
  onFetchNow: () => void;
  onInferFrequency?: () => void;
  isLoading?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="font-medium truncate">
              {source.label || source.domain}
            </span>
            {getStatusBadge(source.status)}
          </div>
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mt-1"
          >
            <span className="truncate">{source.domain}</span>
            <ExternalLink className="h-3 w-3 flex-shrink-0" />
          </a>
        </div>

        <div className="flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={onFetchNow}
                  disabled={isLoading || source.status === "paused"}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Fetch Now</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={onToggleStatus}
                >
                  {source.status === "paused" ? (
                    <Play className="h-4 w-4" />
                  ) : (
                    <Pause className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {source.status === "paused" ? "Resume" : "Pause"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Quick stats */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {source.inferredFrequencyDays && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {getFrequencyLabel(source.inferredFrequencyDays)}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Last: {formatTimestamp(source.lastFetchedAt)}
        </span>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="pt-2 border-t space-y-2 text-sm">
          {source.lastError && (
            <div className="flex items-start gap-2 text-red-600 bg-red-50 p-2 rounded">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span className="text-xs">{source.lastError}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground">Added:</span>{" "}
              {formatTimestamp(source.discoveredAt)}
            </div>
            <div>
              <span className="text-muted-foreground">Source:</span>{" "}
              {source.sourceType === "manual"
                ? "Manual"
                : source.sourceType === "email_link"
                ? "Email"
                : "Browser"}
            </div>
            <div>
              <span className="text-muted-foreground">Successful:</span>{" "}
              {source.successfulFetches}
            </div>
            <div>
              <span className="text-muted-foreground">Failed:</span>{" "}
              {source.failedFetches}
            </div>
            {source.nextExpectedAt && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Next fetch:</span>{" "}
                {formatTimestamp(source.nextExpectedAt)}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            {onInferFrequency && !source.inferredFrequencyDays && (
              <Button
                variant="outline"
                size="sm"
                onClick={onInferFrequency}
                className="text-xs"
              >
                <Calendar className="h-3 w-3 mr-1" />
                Infer Frequency
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onRemove}
              className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Remove
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Add source form
 */
function AddSourceForm({
  onAdd,
  isLoading,
}: {
  onAdd: (url: string, label?: string) => void;
  isLoading?: boolean;
}) {
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    onAdd(url.trim(), label.trim() || undefined);
    setUrl("");
    setLabel("");
    setIsExpanded(false);
  };

  if (!isExpanded) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsExpanded(true)}
        className="w-full"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Invoice Source
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="border rounded-lg p-3 space-y-3">
      <div className="space-y-2">
        <Label htmlFor="source-url" className="text-xs">
          Invoice Portal URL
        </Label>
        <Input
          id="source-url"
          type="url"
          placeholder="https://billing.example.com/invoices"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="source-label" className="text-xs">
          Label (optional)
        </Label>
        <Input
          id="source-label"
          type="text"
          placeholder="e.g., Google Admin Billing"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isLoading || !url.trim()}>
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Plus className="h-4 w-4 mr-2" />
          )}
          Add Source
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * Promotable invoice links from emails
 */
function InvoiceLinksSection({
  partner,
  onPromote,
}: {
  partner: UserPartner;
  onPromote: (index: number) => void;
}) {
  const invoiceLinks = partner.invoiceLinks || [];
  const [isExpanded, setIsExpanded] = useState(false);

  if (invoiceLinks.length === 0) return null;

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-between text-xs text-muted-foreground"
        >
          <span className="flex items-center gap-2">
            <LinkIcon className="h-3 w-3" />
            {invoiceLinks.length} discovered link
            {invoiceLinks.length !== 1 ? "s" : ""} from emails
          </span>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 pt-2">
        {invoiceLinks.slice(0, 5).map((link, index) => (
          <div
            key={index}
            className="flex items-center justify-between gap-2 p-2 border rounded text-xs"
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">
                {link.anchorText || "Invoice Link"}
              </div>
              <div className="text-muted-foreground truncate">{link.url}</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPromote(index)}
              className="flex-shrink-0"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add
            </Button>
          </div>
        ))}
        {invoiceLinks.length > 5 && (
          <div className="text-xs text-muted-foreground text-center">
            And {invoiceLinks.length - 5} more...
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Main Invoice Sources Section component
 */
export function InvoiceSourcesSection({
  partner,
  onAddSource,
  onRemoveSource,
  onToggleStatus,
  onFetchNow,
  onPromoteLink,
  onInferFrequency,
  isLoading,
}: InvoiceSourcesSectionProps) {
  const [loadingSourceId, setLoadingSourceId] = useState<string | null>(null);
  const [addingSource, setAddingSource] = useState(false);

  const sources = partner.invoiceSources || [];

  const handleAddSource = useCallback(
    async (url: string, label?: string) => {
      setAddingSource(true);
      try {
        await onAddSource(url, label);
      } finally {
        setAddingSource(false);
      }
    },
    [onAddSource]
  );

  const handleFetchNow = useCallback(
    async (sourceId: string) => {
      setLoadingSourceId(sourceId);
      try {
        await onFetchNow(sourceId);
      } finally {
        setLoadingSourceId(null);
      }
    },
    [onFetchNow]
  );

  const handleToggleStatus = useCallback(
    async (sourceId: string, currentStatus: InvoiceSourceStatus) => {
      const newStatus = currentStatus === "paused" ? "active" : "paused";
      await onToggleStatus(sourceId, newStatus);
    },
    [onToggleStatus]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-muted-foreground">
          Invoice Sources
        </h4>
        {sources.length > 0 && (
          <Badge variant="secondary" className="text-xs">
            {sources.length}
          </Badge>
        )}
      </div>

      {sources.length === 0 && !isLoading && (
        <div className="text-xs text-muted-foreground py-2">
          No invoice sources configured. Add a URL where invoices can be
          automatically fetched.
        </div>
      )}

      {/* Existing sources */}
      <div className="space-y-2">
        {sources.map((source) => (
          <InvoiceSourceItem
            key={source.id}
            source={source}
            onRemove={() => onRemoveSource(source.id)}
            onToggleStatus={() => handleToggleStatus(source.id, source.status)}
            onFetchNow={() => handleFetchNow(source.id)}
            onInferFrequency={
              onInferFrequency
                ? () => onInferFrequency(source.id)
                : undefined
            }
            isLoading={loadingSourceId === source.id}
          />
        ))}
      </div>

      {/* Add source form */}
      <AddSourceForm onAdd={handleAddSource} isLoading={addingSource} />

      {/* Discovered invoice links from emails */}
      {onPromoteLink && (
        <InvoiceLinksSection partner={partner} onPromote={onPromoteLink} />
      )}
    </div>
  );
}
