"use client";

import { useState, useEffect, useMemo } from "react";
import { format, subDays, addDays } from "date-fns";
import {
  Search,
  Mail,
  Paperclip,
  FileText,
  Image,
  Loader2,
  Download,
  AlertCircle,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useEmailIntegrations } from "@/hooks/use-email-integrations";
import { useGmailSearchQueries } from "@/hooks/use-gmail-search-queries";
import { EmailMessage, EmailAttachment } from "@/types/email-integration";
import { isPdfOrImageAttachment } from "@/lib/email-providers/interface";
import { FilePreview } from "../file-preview";

interface GmailAttachmentsTabProps {
  transactionInfo?: {
    name: string;
    partner?: string;
    amount: number;
    date: Date;
    partnerId?: string;
  };
  onFileCreated: (fileId: string) => Promise<void>;
}

export function GmailAttachmentsTab({
  transactionInfo,
  onFileCreated,
}: GmailAttachmentsTabProps) {
  const { integrations, loading: integrationsLoading, hasGmailIntegration } = useEmailIntegrations();
  const gmailIntegrations = useMemo(
    () => integrations.filter((i) => i.provider === "gmail"),
    [integrations]
  );

  // Simple query suggestions - disabled for this older component
  // TODO: This tab component should receive full Transaction instead of transactionInfo
  const {
    queries: suggestedQueries,
    isLoading: queriesLoading,
  } = useGmailSearchQueries({});

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAttachmentKey, setSelectedAttachmentKey] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeQuery, setActiveQuery] = useState<string | null>(null);

  // Flatten all attachments from all messages (only PDFs and images)
  const allAttachments = useMemo(() => {
    const attachments: Array<{
      key: string;
      attachment: EmailAttachment;
      message: EmailMessage;
      integrationId: string;
    }> = [];

    for (const message of messages) {
      for (const attachment of message.attachments) {
        if (isPdfOrImageAttachment(attachment.mimeType, attachment.filename)) {
          attachments.push({
            key: `${message.messageId}-${attachment.attachmentId}`,
            attachment,
            message,
            integrationId: message.integrationId,
          });
        }
      }
    }

    return attachments.sort((a, b) => {
      if (a.attachment.isLikelyReceipt && !b.attachment.isLikelyReceipt) return -1;
      if (!a.attachment.isLikelyReceipt && b.attachment.isLikelyReceipt) return 1;
      return b.message.date.getTime() - a.message.date.getTime();
    });
  }, [messages]);

  // Find selected attachment
  const selectedItem = useMemo(() => {
    if (!selectedAttachmentKey) return null;
    return allAttachments.find((a) => a.key === selectedAttachmentKey) || null;
  }, [allAttachments, selectedAttachmentKey]);

  // Calculate date range from transaction
  const dateRange = useMemo(() => {
    if (!transactionInfo?.date) return { from: undefined, to: undefined };
    return {
      from: subDays(transactionInfo.date, 30),
      to: addDays(transactionInfo.date, 7),
    };
  }, [transactionInfo]);

  // Search Gmail accounts
  const handleSearch = async (query?: string) => {
    const searchWith = query || searchQuery;
    console.log("[GmailSearch] Starting search:", {
      query: searchWith,
      integrations: gmailIntegrations.length,
      dateRange,
    });
    if (!searchWith || gmailIntegrations.length === 0) {
      console.log("[GmailSearch] Skipping - no query or no integrations");
      return;
    }

    setSearchLoading(true);
    setError(null);
    setHasSearched(true);
    setActiveQuery(searchWith);

    try {
      const results = await Promise.all(
        gmailIntegrations.map(async (integration) => {
          try {
            const response = await fetch("/api/gmail/search", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                integrationId: integration.id,
                query: searchWith,
                dateFrom: dateRange.from?.toISOString(),
                dateTo: dateRange.to?.toISOString(),
                hasAttachments: true,
                limit: 20,
              }),
            });

            if (!response.ok) {
              const errorText = await response.text();
              console.warn(`[GmailSearch] Failed for ${integration.email}:`, response.status, errorText);
              return [];
            }

            const data = await response.json();
            console.log(`[GmailSearch] Results from ${integration.email}:`, data.messages?.length || 0);
            return (data.messages || []).map((msg: EmailMessage & { date: string }) => ({
              ...msg,
              date: new Date(msg.date),
              integrationId: integration.id,
            }));
          } catch (err) {
            console.warn(`Search error for ${integration.email}:`, err);
            return [];
          }
        })
      );

      setMessages(results.flat());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearchLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  // Get preview URL for attachment
  const getPreviewUrl = (attachment: EmailAttachment, integrationId: string): string => {
    const params = new URLSearchParams({
      integrationId,
      messageId: attachment.messageId,
      attachmentId: attachment.attachmentId,
      mimeType: attachment.mimeType,
      filename: attachment.filename,
    });
    return `/api/gmail/attachment?${params.toString()}`;
  };

  const handleSaveAttachment = async () => {
    if (!selectedItem) return;

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/gmail/attachment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          integrationId: selectedItem.integrationId,
          messageId: selectedItem.attachment.messageId,
          attachmentId: selectedItem.attachment.attachmentId,
          mimeType: selectedItem.attachment.mimeType,
          filename: selectedItem.attachment.filename,
          gmailMessageSubject: selectedItem.message.subject,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save attachment");
      }

      const data = await response.json();
      await onFileCreated(data.fileId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save attachment");
    } finally {
      setIsSaving(false);
    }
  };

  // No integrations connected
  if (integrationsLoading) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading integrations...
      </div>
    );
  }

  if (!hasGmailIntegration) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
        <Mail className="h-12 w-12 mb-4 opacity-30" />
        <p className="text-center mb-4">
          No Gmail account connected.
          <br />
          Connect your Gmail to search for invoices.
        </p>
        <Button variant="outline" asChild>
          <a href="/integrations">Go to Integrations</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left: Search and results */}
      <div className="w-[420px] border-r flex flex-col">
        {/* Suggested Searches */}
        {suggestedQueries.length > 0 && (
          <div className="p-4 border-b">
            <div className="flex flex-wrap gap-2">
              {suggestedQueries.map((query, idx) => (
                <Badge
                  key={idx}
                  variant={activeQuery === query ? "default" : "outline"}
                  className={cn(
                    "cursor-pointer hover:bg-primary/10 transition-colors",
                    activeQuery === query && "bg-primary text-primary-foreground"
                  )}
                  onClick={() => {
                    setSearchQuery(query);
                    handleSearch(query);
                  }}
                >
                  {query}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        <div className="p-4 border-b">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search Gmail..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pl-9"
              />
            </div>
            <Button
              onClick={() => handleSearch()}
              disabled={searchLoading || !searchQuery}
              size="icon"
            >
              {searchLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="p-4 border-b">
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          </div>
        )}

        {/* Results */}
        <ScrollArea className="flex-1">
          {allAttachments.length === 0 && !searchLoading ? (
            <div className="p-8 text-center text-muted-foreground">
              <Paperclip className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">
                {hasSearched
                  ? "No attachments found"
                  : "Click a suggested search or enter your own"}
              </p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {allAttachments.map((item) => (
                <AttachmentResultCard
                  key={item.key}
                  attachment={item.attachment}
                  message={item.message}
                  isSelected={selectedAttachmentKey === item.key}
                  onSelect={() => setSelectedAttachmentKey(item.key)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Right: Preview */}
      <div className="flex-1 flex flex-col">
        {selectedItem ? (
          <>
            <div className="flex-1 overflow-hidden">
              <FilePreview
                downloadUrl={getPreviewUrl(selectedItem.attachment, selectedItem.integrationId)}
                fileType={selectedItem.attachment.mimeType}
                fileName={selectedItem.attachment.filename}
                fullSize
              />
            </div>
            <div className="border-t p-4 space-y-3">
              <div>
                <p className="font-medium truncate">{selectedItem.attachment.filename}</p>
                <p className="text-sm text-muted-foreground truncate">
                  {selectedItem.message.fromName || selectedItem.message.from}
                </p>
                <p className="text-xs text-muted-foreground">
                  {format(selectedItem.message.date, "MMM d, yyyy")} · {Math.round(selectedItem.attachment.size / 1024)} KB
                  {selectedItem.attachment.isLikelyReceipt && (
                    <span className="ml-2 text-green-600">Likely receipt</span>
                  )}
                </p>
              </div>
              <Button
                onClick={handleSaveAttachment}
                disabled={isSaving}
                className="w-full"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Save & Connect
              </Button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <FileText className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p>Select an attachment to preview</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface AttachmentResultCardProps {
  attachment: EmailAttachment;
  message: EmailMessage;
  isSelected: boolean;
  onSelect: () => void;
}

function AttachmentResultCard({ attachment, message, isSelected, onSelect }: AttachmentResultCardProps) {
  const isPdf =
    attachment.mimeType === "application/pdf" ||
    (attachment.mimeType === "application/octet-stream" &&
      attachment.filename.toLowerCase().endsWith(".pdf"));
  const sizeKb = Math.round(attachment.size / 1024);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full flex items-start gap-3 p-3 rounded-md transition-colors text-left overflow-hidden",
        isSelected && "bg-primary/10 ring-1 ring-primary",
        !isSelected && "hover:bg-muted"
      )}
    >
      <div className="h-10 w-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
        {isPdf ? (
          <FileText className="h-5 w-5 text-red-500" />
        ) : (
          <Image className="h-5 w-5 text-blue-500" />
        )}
      </div>
      <div className="flex-1 min-w-0 overflow-hidden">
        <p className="text-sm font-medium truncate">{attachment.filename}</p>
        <p className="text-xs text-muted-foreground truncate">
          {message.fromName || message.from}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground">
            {format(message.date, "MMM d, yyyy")}
          </span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground">{sizeKb} KB</span>
          {attachment.isLikelyReceipt && (
            <Badge variant="secondary" className="text-xs py-0 h-4 text-green-600">
              Likely
            </Badge>
          )}
        </div>
      </div>
      {isSelected && <Check className="h-4 w-4 text-primary flex-shrink-0 mt-1" />}
    </button>
  );
}
