"use client";

import { useState, useMemo } from "react";
import { format, subDays, addDays } from "date-fns";
import { fetchWithAuth } from "@/lib/api/fetch-with-auth";
import {
  Search,
  Mail,
  FileText,
  Loader2,
  Download,
  AlertCircle,
  Check,
  Link,
  CheckCircle2,
  FileDown,
  ExternalLink,
  BookmarkPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useEmailIntegrations } from "@/hooks/use-email-integrations";
import { useGmailSearchQueries } from "@/hooks/use-gmail-search-queries";
import { EmailMessage, EmailAttachment, EmailClassification } from "@/types/email-integration";
import { isPdfAttachment } from "@/lib/email-providers/interface";
import { GmailAttachmentPreview } from "../gmail-attachment-preview";

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

// Extended message with integration ID for tracking
interface ExtendedEmailMessage extends EmailMessage {
  integrationId: string;
}

// Selection can be an attachment or an email (for mail-to-pdf)
type SelectionType =
  | { type: "attachment"; messageId: string; attachmentId: string; integrationId: string }
  | { type: "email"; messageId: string; integrationId: string };

export function GmailAttachmentsTab({
  transactionInfo,
  onFileCreated,
}: GmailAttachmentsTabProps) {
  const { integrations, loading: integrationsLoading, hasGmailIntegration } = useEmailIntegrations();
  const gmailIntegrations = useMemo(
    () => integrations.filter((i) => i.provider === "gmail"),
    [integrations]
  );

  const {
    queries: suggestedQueries,
  } = useGmailSearchQueries({});

  const [searchQuery, setSearchQuery] = useState("");
  const [selection, setSelection] = useState<SelectionType | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [messages, setMessages] = useState<ExtendedEmailMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeQuery, setActiveQuery] = useState<string | null>(null);

  // Sort messages by classification confidence and date
  const sortedMessages = useMemo(() => {
    return [...messages].sort((a, b) => {
      // Prioritize messages with classification data
      const confA = a.classification?.confidence || 0;
      const confB = b.classification?.confidence || 0;
      if (confA !== confB) return confB - confA;
      // Then by date (newest first)
      return b.date.getTime() - a.date.getTime();
    });
  }, [messages]);

  // Find selected message and attachment
  const selectedMessage = useMemo(() => {
    if (!selection) return null;
    return messages.find(m =>
      m.messageId === selection.messageId &&
      m.integrationId === selection.integrationId
    ) || null;
  }, [messages, selection]);

  const selectedAttachment = useMemo(() => {
    if (!selection || selection.type !== "attachment" || !selectedMessage) return null;
    return selectedMessage.attachments.find(a => a.attachmentId === selection.attachmentId) || null;
  }, [selection, selectedMessage]);

  // Calculate date range from transaction
  const dateRange = useMemo(() => {
    if (!transactionInfo?.date) return { from: undefined, to: undefined };
    return {
      from: subDays(transactionInfo.date, 30),
      to: addDays(transactionInfo.date, 7),
    };
  }, [transactionInfo]);

  // Search Gmail accounts - now searches ALL emails (not just with attachments)
  const handleSearch = async (query?: string) => {
    const searchWith = query || searchQuery;
    if (!searchWith || gmailIntegrations.length === 0) {
      return;
    }

    setSearchLoading(true);
    setError(null);
    setHasSearched(true);
    setActiveQuery(searchWith);
    setSelection(null);

    try {
      const results = await Promise.all(
        gmailIntegrations.map(async (integration) => {
          try {
            // Search WITHOUT hasAttachments filter to get all emails
            const response = await fetchWithAuth("/api/gmail/search", {
              method: "POST",
              body: JSON.stringify({
                integrationId: integration.id,
                query: searchWith,
                dateFrom: dateRange.from?.toISOString(),
                dateTo: dateRange.to?.toISOString(),
                hasAttachments: false, // Get ALL emails, not just with attachments
                limit: 20,
              }),
            });

            if (!response.ok) {
              console.warn(`[GmailSearch] Failed for ${integration.email}:`, response.status);
              return [];
            }

            const data = await response.json();
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

  // Save a specific attachment
  const handleSaveAttachment = async (
    message: ExtendedEmailMessage,
    attachment: EmailAttachment
  ) => {
    setIsSaving(true);
    setError(null);

    try {
      // If file already exists, just connect it directly
      if (attachment.existingFileId) {
        await onFileCreated(attachment.existingFileId);
        return;
      }

      // Otherwise, download and save the attachment
      const response = await fetchWithAuth("/api/gmail/attachment", {
        method: "POST",
        body: JSON.stringify({
          integrationId: message.integrationId,
          messageId: attachment.messageId,
          attachmentId: attachment.attachmentId,
          mimeType: attachment.mimeType,
          filename: attachment.filename,
          gmailMessageSubject: message.subject,
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

  // Convert email to PDF
  const handleConvertToPdf = async (message: ExtendedEmailMessage) => {
    setIsConverting(true);
    setError(null);

    try {
      const response = await fetchWithAuth("/api/gmail/convert-to-pdf", {
        method: "POST",
        body: JSON.stringify({
          integrationId: message.integrationId,
          messageId: message.messageId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to convert email");
      }

      const data = await response.json();
      await onFileCreated(data.fileId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to convert email");
    } finally {
      setIsConverting(false);
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

        {/* Results - Now showing messages, not attachments */}
        <ScrollArea className="flex-1">
          {sortedMessages.length === 0 && !searchLoading ? (
            <div className="p-8 text-center text-muted-foreground">
              <Mail className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">
                {hasSearched
                  ? "No emails found"
                  : "Click a suggested search or enter your own"}
              </p>
            </div>
          ) : (
            <div className="p-2 space-y-2">
              {sortedMessages.map((message) => (
                <EmailResultCard
                  key={`${message.integrationId}-${message.messageId}`}
                  message={message}
                  selection={selection}
                  onSelectAttachment={(attachmentId) => setSelection({
                    type: "attachment",
                    messageId: message.messageId,
                    attachmentId,
                    integrationId: message.integrationId,
                  })}
                  onSelectEmail={() => setSelection({
                    type: "email",
                    messageId: message.messageId,
                    integrationId: message.integrationId,
                  })}
                  onSaveAttachment={(attachment) => handleSaveAttachment(message, attachment)}
                  onConvertToPdf={() => handleConvertToPdf(message)}
                  isSaving={isSaving}
                  isConverting={isConverting}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Right: Preview */}
      <div className="flex-1 flex flex-col">
        {selection?.type === "attachment" && selectedAttachment && selectedMessage ? (
          <>
            <div className="flex-1 overflow-hidden">
              <GmailAttachmentPreview
                integrationId={selectedMessage.integrationId}
                messageId={selectedAttachment.messageId}
                attachmentId={selectedAttachment.attachmentId}
                mimeType={selectedAttachment.mimeType}
                filename={selectedAttachment.filename}
                fullSize
              />
            </div>
            <div className="border-t p-4 space-y-3">
              <div>
                <p className="font-medium truncate">{selectedAttachment.filename}</p>
                <p className="text-sm text-muted-foreground truncate">
                  {selectedMessage.fromName || selectedMessage.from}
                </p>
                <p className="text-xs text-muted-foreground">
                  {format(selectedMessage.date, "MMM d, yyyy")} · {Math.round(selectedAttachment.size / 1024)} KB
                </p>
              </div>
              <Button
                onClick={() => handleSaveAttachment(selectedMessage, selectedAttachment)}
                disabled={isSaving}
                className="w-full"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : selectedAttachment.existingFileId ? (
                  <Link className="h-4 w-4 mr-2" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                {selectedAttachment.existingFileId ? "Connect Existing" : "Save & Connect"}
              </Button>
            </div>
          </>
        ) : selection?.type === "email" && selectedMessage ? (
          <>
            <div className="flex-1 overflow-hidden p-4">
              <div className="bg-muted/50 rounded-lg p-4 h-full flex flex-col items-center justify-center text-center">
                <Mail className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="font-medium">{selectedMessage.subject}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  From: {selectedMessage.fromName || selectedMessage.from}
                </p>
                <p className="text-sm text-muted-foreground">
                  {format(selectedMessage.date, "MMM d, yyyy")}
                </p>
                <p className="text-xs text-muted-foreground mt-4 max-w-md">
                  This email will be converted to PDF and saved as a receipt.
                </p>
              </div>
            </div>
            <div className="border-t p-4">
              <Button
                onClick={() => handleConvertToPdf(selectedMessage)}
                disabled={isConverting}
                className="w-full"
              >
                {isConverting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileDown className="h-4 w-4 mr-2" />
                )}
                Convert to PDF & Connect
              </Button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <FileText className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p>Select an option to preview</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Email Result Card - Shows all options for an email
// ============================================================================

interface EmailResultCardProps {
  message: ExtendedEmailMessage;
  selection: SelectionType | null;
  onSelectAttachment: (attachmentId: string) => void;
  onSelectEmail: () => void;
  onSaveAttachment: (attachment: EmailAttachment) => void;
  onConvertToPdf: () => void;
  isSaving: boolean;
  isConverting: boolean;
}

function EmailResultCard({
  message,
  selection,
  onSelectAttachment,
  onSelectEmail,
  onSaveAttachment,
  onConvertToPdf,
  isSaving,
  isConverting,
}: EmailResultCardProps) {
  const classification = message.classification;
  const pdfAttachments = message.attachments.filter(a =>
    isPdfAttachment(a.mimeType, a.filename)
  );

  // Check if this message is selected
  const isMessageSelected = selection &&
    selection.messageId === message.messageId &&
    (selection as { integrationId?: string }).integrationId === message.integrationId;

  // Determine what options are available
  const hasPdfAttachments = pdfAttachments.length > 0;
  const showMailToPdf = classification?.possibleMailInvoice || (!hasPdfAttachments && !classification?.possibleInvoiceLink);
  const showInvoiceLink = classification?.possibleInvoiceLink;

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        isMessageSelected && "border-primary bg-primary/5"
      )}
    >
      {/* Email header */}
      <div className="flex items-start gap-3 mb-3">
        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
          <Mail className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{message.subject}</p>
          <p className="text-xs text-muted-foreground truncate">
            {message.fromName || message.from}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs text-muted-foreground">
              {format(message.date, "MMM d, yyyy")}
            </span>
            {classification && classification.confidence >= 50 && (
              <Badge
                variant="secondary"
                className={cn(
                  "text-xs py-0 h-4",
                  classification.confidence >= 70 ? "text-green-600" : "text-amber-600"
                )}
              >
                {classification.confidence >= 70 ? "Strong" : "Likely"}
              </Badge>
            )}
            {/* Type badges */}
            {hasPdfAttachments && (
              <Badge variant="outline" className="text-xs py-0 h-4 text-red-600">
                PDF
              </Badge>
            )}
            {classification?.possibleMailInvoice && (
              <Badge variant="outline" className="text-xs py-0 h-4 text-blue-600">
                Email Invoice
              </Badge>
            )}
            {classification?.possibleInvoiceLink && (
              <Badge variant="outline" className="text-xs py-0 h-4 text-amber-600">
                Link
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Available options */}
      <div className="space-y-2 pl-[52px]">
        {/* PDF Attachments */}
        {pdfAttachments.map((attachment) => {
          const isSelected = selection?.type === "attachment" &&
            selection.attachmentId === attachment.attachmentId &&
            selection.messageId === message.messageId;
          const sizeKb = Math.round(attachment.size / 1024);

          return (
            <div
              key={attachment.attachmentId}
              className={cn(
                "flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors",
                isSelected ? "bg-primary/10 ring-1 ring-primary" : "hover:bg-muted"
              )}
              onClick={() => onSelectAttachment(attachment.attachmentId)}
            >
              <FileText className="h-4 w-4 text-red-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{attachment.filename}</p>
                <p className="text-xs text-muted-foreground">{sizeKb} KB</p>
              </div>
              {attachment.existingFileId && (
                <Badge variant="secondary" className="text-xs py-0 h-4 text-blue-600">
                  <CheckCircle2 className="h-3 w-3 mr-0.5" />
                  Imported
                </Badge>
              )}
              <Button
                size="sm"
                variant={isSelected ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onSaveAttachment(attachment);
                }}
                disabled={isSaving}
              >
                {isSaving && isSelected ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : attachment.existingFileId ? (
                  <>
                    <Link className="h-3 w-3 mr-1" />
                    Connect
                  </>
                ) : (
                  <>
                    <Download className="h-3 w-3 mr-1" />
                    Save
                  </>
                )}
              </Button>
              {isSelected && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
            </div>
          );
        })}

        {/* Email to PDF option */}
        {showMailToPdf && (
          <div
            className={cn(
              "flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors",
              selection?.type === "email" && selection.messageId === message.messageId
                ? "bg-primary/10 ring-1 ring-primary"
                : "hover:bg-muted"
            )}
            onClick={onSelectEmail}
          >
            <Mail className="h-4 w-4 text-blue-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium">Email → PDF</p>
              <p className="text-xs text-muted-foreground">Convert email body to PDF</p>
            </div>
            <Button
              size="sm"
              variant={selection?.type === "email" && selection.messageId === message.messageId ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onConvertToPdf();
              }}
              disabled={isConverting}
            >
              {isConverting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <>
                  <FileDown className="h-3 w-3 mr-1" />
                  Convert
                </>
              )}
            </Button>
            {selection?.type === "email" && selection.messageId === message.messageId && (
              <Check className="h-4 w-4 text-primary flex-shrink-0" />
            )}
          </div>
        )}

        {/* Invoice link option */}
        {showInvoiceLink && (
          <div className="flex items-center gap-2 p-2 rounded-md bg-amber-50 dark:bg-amber-950/20">
            <ExternalLink className="h-4 w-4 text-amber-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-500">
                Invoice Link Detected
              </p>
              <p className="text-xs text-muted-foreground">
                Email may contain a download link
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                // TODO: Phase 3 - Save link to partner
                onSelectEmail();
              }}
            >
              <BookmarkPlus className="h-3 w-3 mr-1" />
              Save Link
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
