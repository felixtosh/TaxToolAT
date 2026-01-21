"use client";

import { useState, useMemo, useEffect } from "react";
import { format, subDays, addDays } from "date-fns";
import { fetchWithAuth } from "@/lib/api/fetch-with-auth";
import {
  Search,
  Mail,
  FileText,
  Loader2,
  AlertCircle,
  FileDown,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useEmailIntegrations } from "@/hooks/use-email-integrations";
import { useGmailSearchQueries } from "@/hooks/use-gmail-search-queries";
import { useAttachmentScoring, ScoredAttachment } from "@/hooks/use-attachment-scoring";
import { EmailMessage } from "@/types/email-integration";

interface EmailInvoiceTabProps {
  transactionInfo?: {
    name: string;
    partner?: string;
    amount: number;
    date: Date;
    partnerId?: string;
  };
  onFileCreated: (fileId: string) => Promise<void>;
}

interface EmailWithContent extends EmailMessage {
  integrationId: string;
  htmlBody?: string;
  textBody?: string;
  loadingContent?: boolean;
}

export function EmailInvoiceTab({
  transactionInfo,
  onFileCreated,
}: EmailInvoiceTabProps) {
  const { integrations, loading: integrationsLoading, hasGmailIntegration } = useEmailIntegrations();
  const gmailIntegrations = useMemo(
    () => integrations.filter((i) => i.provider === "gmail"),
    [integrations]
  );

  // Simple query suggestions - disabled for this older component
  // TODO: This tab component should receive full Transaction instead of transactionInfo
  const { queries: suggestedQueries } = useGmailSearchQueries({});
  const { scoreAttachments } = useAttachmentScoring();

  const [searchQuery, setSearchQuery] = useState("");
  const [emails, setEmails] = useState<EmailWithContent[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<EmailWithContent | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeQuery, setActiveQuery] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [emailScores, setEmailScores] = useState<Map<string, ScoredAttachment>>(new Map());

  // Calculate date range from transaction
  const dateRange = useMemo(() => {
    if (!transactionInfo?.date) return { from: undefined, to: undefined };
    return {
      from: subDays(transactionInfo.date, 30),
      to: addDays(transactionInfo.date, 7),
    };
  }, [transactionInfo]);

  // Sort emails by score (highest first)
  const sortedEmails = useMemo(() => {
    if (emailScores.size === 0) return emails;
    return [...emails].sort((a, b) => {
      const scoreA = emailScores.get(a.messageId)?.score || 0;
      const scoreB = emailScores.get(b.messageId)?.score || 0;
      return scoreB - scoreA;
    });
  }, [emails, emailScores]);

  // Score emails when they change
  useEffect(() => {
    if (emails.length === 0 || !transactionInfo) {
      setEmailScores(new Map());
      return;
    }

    const emailsToScore = emails.map((email) => ({
      key: email.messageId,
      filename: `${email.subject}.pdf`, // Treat email as if it were a PDF
      mimeType: "application/pdf",
      emailSubject: email.subject,
      emailFrom: email.from,
      emailSnippet: email.snippet,
      emailDate: email.date,
      integrationId: email.integrationId,
    }));

    scoreAttachments(
      emailsToScore,
      {
        amount: transactionInfo.amount,
        date: transactionInfo.date,
        name: transactionInfo.name,
        partner: transactionInfo.partner,
      }
    ).then((scores) => {
      const scoreMap = new Map<string, ScoredAttachment>();
      for (const score of scores) {
        scoreMap.set(score.key, score);
      }
      setEmailScores(scoreMap);
    });
  }, [emails, transactionInfo, scoreAttachments]);

  // Search emails
  const handleSearch = async (query?: string) => {
    const searchWith = query || searchQuery;
    if (!searchWith || gmailIntegrations.length === 0) return;

    setSearchLoading(true);
    setError(null);
    setHasSearched(true);
    setActiveQuery(searchWith);
    setEmails([]);
    setSelectedEmail(null);

    try {
      const results = await Promise.all(
        gmailIntegrations.map(async (integration) => {
          try {
            const response = await fetchWithAuth("/api/gmail/search", {
              method: "POST",
              body: JSON.stringify({
                integrationId: integration.id,
                query: searchWith,
                dateFrom: dateRange.from?.toISOString(),
                dateTo: dateRange.to?.toISOString(),
                hasAttachments: false,
                limit: 20,
              }),
            });

            if (!response.ok) return [];

            const data = await response.json();
            return (data.messages || []).map((msg: EmailMessage & { date: string }) => ({
              ...msg,
              date: new Date(msg.date),
              integrationId: integration.id,
            }));
          } catch {
            return [];
          }
        })
      );

      setEmails(results.flat());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearchLoading(false);
    }
  };

  // Load email content when selected
  const handleSelectEmail = async (email: EmailWithContent) => {
    setSelectedEmail(email);

    // If already loaded, don't reload
    if (email.htmlBody || email.textBody) return;

    // Mark as loading
    setEmails(prev => prev.map(e =>
      e.messageId === email.messageId ? { ...e, loadingContent: true } : e
    ));

    try {
      const response = await fetchWithAuth("/api/gmail/email-content", {
        method: "POST",
        body: JSON.stringify({
          integrationId: email.integrationId,
          messageId: email.messageId,
        }),
      });

      if (!response.ok) throw new Error("Failed to load email");

      const data = await response.json();

      const updatedEmail = {
        ...email,
        htmlBody: data.htmlBody,
        textBody: data.textBody,
        loadingContent: false,
      };

      setEmails(prev => prev.map(e =>
        e.messageId === email.messageId ? updatedEmail : e
      ));
      setSelectedEmail(updatedEmail);
    } catch (err) {
      console.error("Failed to load email content:", err);
      setEmails(prev => prev.map(e =>
        e.messageId === email.messageId ? { ...e, loadingContent: false } : e
      ));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  // Convert email to PDF
  const handleConvertToPdf = async () => {
    if (!selectedEmail) return;

    setConverting(true);
    setError(null);

    try {
      const response = await fetchWithAuth("/api/gmail/convert-to-pdf", {
        method: "POST",
        body: JSON.stringify({
          integrationId: selectedEmail.integrationId,
          messageId: selectedEmail.messageId,
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
      setConverting(false);
    }
  };

  // No integrations connected
  if (integrationsLoading) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading...
      </div>
    );
  }

  if (!hasGmailIntegration) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
        <Mail className="h-12 w-12 mb-4 opacity-30" />
        <p className="text-center mb-4">
          No Gmail account connected.
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
          {sortedEmails.length === 0 && !searchLoading ? (
            <div className="p-8 text-center text-muted-foreground">
              <Mail className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">
                {hasSearched ? "No emails found" : "Search for emails"}
              </p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {sortedEmails.map((email) => {
                const score = emailScores.get(email.messageId);
                return (
                  <button
                    key={email.messageId}
                    type="button"
                    onClick={() => handleSelectEmail(email)}
                    className={cn(
                      "w-full flex items-start gap-3 p-3 rounded-md transition-colors text-left overflow-hidden",
                      selectedEmail?.messageId === email.messageId && "bg-primary/10 ring-1 ring-primary",
                      selectedEmail?.messageId !== email.messageId && "hover:bg-muted"
                    )}
                  >
                    <div className="h-10 w-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                      <Mail className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <p className="text-sm font-medium truncate">{email.subject}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {email.fromName || email.from}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">
                          {format(email.date, "MMM d, yyyy")}
                        </span>
                        {score && score.score > 0 && (
                          <>
                            {score.label && (
                              <Badge
                                variant="secondary"
                                className={cn(
                                  "text-xs py-0 h-4",
                                  score.label === "Strong" && "text-green-600",
                                  score.label === "Likely" && "text-amber-600"
                                )}
                              >
                                {score.label}
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {score.score}%
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    {selectedEmail?.messageId === email.messageId && (
                      <Check className="h-4 w-4 text-primary flex-shrink-0 mt-1" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Right: Email Preview */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedEmail ? (
          <>
            {/* Email Header */}
            <div className="p-4 border-b shrink-0">
              <h3 className="font-medium truncate">{selectedEmail.subject}</h3>
              <p className="text-sm text-muted-foreground">
                {selectedEmail.fromName || selectedEmail.from} · {format(selectedEmail.date, "MMM d, yyyy")}
              </p>
            </div>

            {/* Email Content */}
            <div className="flex-1 overflow-hidden">
              {selectedEmail.loadingContent ? (
                <div className="h-full flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : selectedEmail.htmlBody ? (
                <iframe
                  srcDoc={`<style>html, body { margin: 0; padding: 8px; overflow-x: hidden; width: 100%; }</style>${selectedEmail.htmlBody}`}
                  className="w-full h-full border-0 bg-white"
                  sandbox="allow-same-origin"
                  title="Email content"
                />
              ) : selectedEmail.textBody ? (
                <div className="p-4 overflow-auto h-full">
                  <pre className="whitespace-pre-wrap text-sm font-sans">
                    {selectedEmail.textBody}
                  </pre>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  <p>No content available</p>
                </div>
              )}
            </div>

            {/* Convert Button */}
            <div className="border-t p-4 shrink-0">
              <Button
                onClick={handleConvertToPdf}
                disabled={converting}
                className="w-full"
              >
                {converting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileDown className="h-4 w-4 mr-2" />
                )}
                To PDF and Connect
              </Button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <FileText className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p>Select an email to preview</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
