"use client";

import { useState, useCallback, useMemo } from "react";
import { differenceInDays, subDays, addDays } from "date-fns";
import { TaxFile } from "@/types/file";
import { EmailMessage, EmailAttachment } from "@/types/email-integration";
import { UserPartner, FileSourcePattern } from "@/types/partner";
import { useFiles } from "./use-files";
import { useEmailIntegrations } from "./use-email-integrations";

/**
 * Transaction info for smart search/ranking
 */
export interface TransactionInfo {
  id: string;
  date: Date;
  amount: number;
  currency: string;
  partner?: string;
  partnerId?: string;
}

/**
 * Unified search result - can be a local file or Gmail attachment
 */
export interface UnifiedSearchResult {
  /** Unique key for React rendering */
  id: string;
  /** Source type */
  type: "local" | "gmail";
  /** File/attachment name */
  filename: string;
  /** Date (extracted date for files, email date for Gmail) */
  date?: Date;
  /** Amount in cents (for files with extraction) */
  amount?: number;
  /** Currency code */
  currency?: string;
  /** Partner name (extracted for files, sender for Gmail) */
  partner?: string;
  /** Preview URL */
  previewUrl: string;
  /** MIME type */
  mimeType: string;
  /** Size in bytes */
  size: number;
  /** Whether this is likely a receipt */
  isLikelyReceipt: boolean;

  // For local files:
  fileId?: string;
  file?: TaxFile;

  // For Gmail attachments:
  integrationId?: string;
  messageId?: string;
  attachmentId?: string;
  emailSubject?: string;
  emailFrom?: string;

  // Ranking
  score: number;
  matchReasons: string[];
}

/**
 * Hook result
 */
export interface UseUnifiedFileSearchResult {
  /** Search results (sorted by score) */
  results: UnifiedSearchResult[];
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | null;
  /** Run search */
  search: (query: string) => Promise<void>;
  /** Clear results */
  clear: () => void;
  /** Whether search has been run */
  hasSearched: boolean;
  /** Current search query */
  searchQuery: string;
  /** Set search query without searching */
  setSearchQuery: (query: string) => void;
}

/**
 * Score a search result based on how well it matches the transaction
 */
function scoreResult(
  result: Omit<UnifiedSearchResult, "score" | "matchReasons">,
  transaction: TransactionInfo,
  partner?: UserPartner | null
): { score: number; matchReasons: string[] } {
  let score = 0;
  const matchReasons: string[] = [];

  // Amount match (0-40)
  if (result.amount && transaction.amount) {
    const resultAmount = Math.abs(result.amount);
    const txAmount = Math.abs(transaction.amount);
    const diff = Math.abs(resultAmount - txAmount) / txAmount;

    if (diff === 0) {
      score += 40;
      matchReasons.push("Exact amount");
    } else if (diff <= 0.01) {
      score += 38;
      matchReasons.push("Amount ±1%");
    } else if (diff <= 0.05) {
      score += 30;
      matchReasons.push("Amount ±5%");
    } else if (diff <= 0.10) {
      score += 20;
      matchReasons.push("Amount ±10%");
    }
  }

  // Date proximity (0-25)
  if (result.date && transaction.date) {
    const daysDiff = Math.abs(differenceInDays(result.date, transaction.date));

    if (daysDiff === 0) {
      score += 25;
      matchReasons.push("Same day");
    } else if (daysDiff <= 3) {
      score += 22;
      matchReasons.push("Within 3 days");
    } else if (daysDiff <= 7) {
      score += 15;
      matchReasons.push("Within 7 days");
    } else if (daysDiff <= 14) {
      score += 8;
      matchReasons.push("Within 14 days");
    } else if (daysDiff <= 30) {
      score += 3;
      matchReasons.push("Within 30 days");
    }
  }

  // Partner match (0-20)
  if (partner && result.partner) {
    const partnerLower = partner.name.toLowerCase();
    const resultPartnerLower = result.partner.toLowerCase();

    if (
      resultPartnerLower.includes(partnerLower) ||
      partnerLower.includes(resultPartnerLower) ||
      partner.aliases.some(
        (a) =>
          a.toLowerCase().includes(resultPartnerLower) ||
          resultPartnerLower.includes(a.toLowerCase())
      )
    ) {
      score += 20;
      matchReasons.push("Partner match");
    }
  }

  // Source preference (0-10)
  if (partner?.fileSourcePatterns?.length) {
    const hasPreference = partner.fileSourcePatterns.some(
      (p) => p.sourceType === result.type
    );
    if (hasPreference) {
      score += 10;
      matchReasons.push("Preferred source");
    }
  }

  // Likely receipt (0-5)
  if (result.isLikelyReceipt) {
    score += 5;
    matchReasons.push("Likely receipt");
  }

  return { score, matchReasons };
}

/**
 * Convert a TaxFile to UnifiedSearchResult
 */
function fileToResult(file: TaxFile): Omit<UnifiedSearchResult, "score" | "matchReasons"> {
  return {
    id: `local-${file.id}`,
    type: "local",
    filename: file.fileName,
    date: file.extractedDate?.toDate(),
    amount: file.extractedAmount ?? undefined,
    currency: file.extractedCurrency ?? undefined,
    partner: file.extractedPartner ?? undefined,
    previewUrl: file.downloadUrl,
    mimeType: file.fileType,
    size: file.fileSize,
    isLikelyReceipt: true, // All uploaded files are assumed to be receipts
    fileId: file.id,
    file,
  };
}

/**
 * Convert a Gmail attachment to UnifiedSearchResult
 */
function attachmentToResult(
  attachment: EmailAttachment,
  message: EmailMessage,
  integrationId: string
): Omit<UnifiedSearchResult, "score" | "matchReasons"> {
  const params = new URLSearchParams({
    integrationId,
    messageId: attachment.messageId,
    attachmentId: attachment.attachmentId,
    mimeType: attachment.mimeType,
    filename: attachment.filename,
  });

  return {
    id: `gmail-${message.messageId}-${attachment.attachmentId}`,
    type: "gmail",
    filename: attachment.filename,
    date: message.date,
    partner: message.fromName || message.from,
    previewUrl: `/api/gmail/attachment?${params.toString()}`,
    mimeType: attachment.mimeType,
    size: attachment.size,
    isLikelyReceipt: attachment.isLikelyReceipt,
    integrationId,
    messageId: message.messageId,
    attachmentId: attachment.attachmentId,
    emailSubject: message.subject,
    emailFrom: message.from,
  };
}

/**
 * Hook for unified file search across local files and Gmail
 */
export function useUnifiedFileSearch(
  transactionInfo: TransactionInfo,
  partner?: UserPartner | null
): UseUnifiedFileSearchResult {
  const { files, loading: filesLoading } = useFiles();
  const { integrations, loading: integrationsLoading, hasGmailIntegration } = useEmailIntegrations();

  const [searchQuery, setSearchQuery] = useState("");
  const [gmailResults, setGmailResults] = useState<EmailMessage[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const gmailIntegrations = useMemo(
    () => integrations.filter((i) => i.provider === "gmail" && i.isActive),
    [integrations]
  );

  // Filter local files by search query and date range
  const filteredLocalFiles = useMemo(() => {
    if (!hasSearched) return [];

    // Filter to unconnected files only
    let filtered = files.filter((f) => f.transactionIds.length === 0);

    // Filter by date range (30 days before to 7 days after transaction)
    if (transactionInfo.date) {
      const dateFrom = subDays(transactionInfo.date, 30);
      const dateTo = addDays(transactionInfo.date, 7);

      filtered = filtered.filter((f) => {
        if (!f.extractedDate) return true; // Include files without dates
        const fileDate = f.extractedDate.toDate();
        return fileDate >= dateFrom && fileDate <= dateTo;
      });
    }

    // Filter by search query
    if (searchQuery) {
      const queryLower = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (f) =>
          f.fileName.toLowerCase().includes(queryLower) ||
          (f.extractedPartner?.toLowerCase() || "").includes(queryLower)
      );
    }

    // Only include PDFs and images
    return filtered.filter(
      (f) =>
        f.fileType === "application/pdf" ||
        f.fileType.startsWith("image/")
    );
  }, [files, searchQuery, transactionInfo.date, hasSearched]);

  // Combine and score results
  const results = useMemo(() => {
    if (!hasSearched) return [];

    const allResults: UnifiedSearchResult[] = [];

    // Add local files
    for (const file of filteredLocalFiles) {
      const baseResult = fileToResult(file);
      const { score, matchReasons } = scoreResult(baseResult, transactionInfo, partner);
      allResults.push({ ...baseResult, score, matchReasons });
    }

    // Add Gmail attachments
    for (const message of gmailResults) {
      for (const attachment of message.attachments) {
        // Only include PDFs and images
        if (
          attachment.mimeType !== "application/pdf" &&
          !attachment.mimeType.startsWith("image/")
        ) {
          continue;
        }

        const baseResult = attachmentToResult(attachment, message, message.integrationId);
        const { score, matchReasons } = scoreResult(baseResult, transactionInfo, partner);
        allResults.push({ ...baseResult, score, matchReasons });
      }
    }

    // Sort by score descending
    return allResults.sort((a, b) => b.score - a.score);
  }, [filteredLocalFiles, gmailResults, transactionInfo, partner, hasSearched]);

  // Search function
  const search = useCallback(
    async (query: string) => {
      setSearchQuery(query);
      setHasSearched(true);
      setError(null);

      // Local files are filtered reactively via useMemo
      // Gmail needs an API call
      if (!hasGmailIntegration || gmailIntegrations.length === 0) {
        return;
      }

      setSearchLoading(true);

      try {
        // Calculate date range
        const dateFrom = transactionInfo.date
          ? subDays(transactionInfo.date, 30)
          : undefined;
        const dateTo = transactionInfo.date
          ? addDays(transactionInfo.date, 7)
          : undefined;

        // Search all Gmail accounts in parallel
        const allMessages = await Promise.all(
          gmailIntegrations.map(async (integration) => {
            try {
              const response = await fetch("/api/gmail/search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  integrationId: integration.id,
                  query: query || undefined,
                  dateFrom: dateFrom?.toISOString(),
                  dateTo: dateTo?.toISOString(),
                  hasAttachments: true,
                  limit: 20,
                }),
              });

              if (!response.ok) {
                console.warn(`Gmail search failed for ${integration.email}`);
                return [];
              }

              const data = await response.json();
              return (data.messages || []).map(
                (msg: EmailMessage & { date: string }) => ({
                  ...msg,
                  date: new Date(msg.date),
                  integrationId: integration.id,
                })
              );
            } catch (err) {
              console.warn(`Gmail search error for ${integration.email}:`, err);
              return [];
            }
          })
        );

        setGmailResults(allMessages.flat());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
      } finally {
        setSearchLoading(false);
      }
    },
    [gmailIntegrations, hasGmailIntegration, transactionInfo.date]
  );

  // Clear results
  const clear = useCallback(() => {
    setSearchQuery("");
    setGmailResults([]);
    setHasSearched(false);
    setError(null);
  }, []);

  return {
    results,
    loading: filesLoading || integrationsLoading || searchLoading,
    error,
    search,
    clear,
    hasSearched,
    searchQuery,
    setSearchQuery,
  };
}
