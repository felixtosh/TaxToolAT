"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { format } from "date-fns";
import {
  Search,
  FileText,
  Image,
  Check,
  Link2,
  Mail,
  HardDrive,
  Loader2,
  Paperclip,
  FileDown,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ContentOverlay } from "@/components/ui/content-overlay";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { isPdfOrImageAttachment } from "@/lib/email-providers/interface";
import { FilePreview } from "./file-preview";
import {
  useUnifiedFileSearch,
  UnifiedSearchResult,
  TransactionInfo,
} from "@/hooks/use-unified-file-search";
import { usePartners } from "@/hooks/use-partners";
import { useEmailIntegrations } from "@/hooks/use-email-integrations";
import { useGmailSearchQueries } from "@/hooks/use-gmail-search-queries";
import { addEmailDomainToPartner, learnFileSourcePattern } from "@/lib/operations";
import { db } from "@/lib/firebase/config";
import { EmailMessage, EmailAttachment } from "@/types/email-integration";
import { Transaction } from "@/types/transaction";

const MOCK_USER_ID = "dev-user-123";

const RECEIPT_KEYWORDS = [
  "invoice",
  "rechnung",
  "receipt",
  "beleg",
  "quittung",
  "faktura",
  "bon",
  "bill",
];

const AUTH_ERROR_CODES = new Set([
  "AUTH_EXPIRED",
  "TOKEN_EXPIRED",
  "REAUTH_REQUIRED",
  "TOKENS_MISSING",
]);

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildAmountVariants(amountCents?: number | null): string[] {
  if (amountCents == null) return [];
  const amount = Math.abs(amountCents) / 100;
  const fixed = amount.toFixed(2);
  const withComma = fixed.replace(".", ",");
  const en = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  const de = new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

  return Array.from(new Set([fixed, withComma, en, de]));
}

function extractTokens(text?: string | null): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function containsAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

function extractEmailDomain(email?: string | null): string | null {
  if (!email) return null;
  const match = email.toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})/i);
  return match ? match[1] : null;
}

interface ConnectFileOverlayProps {
  open: boolean;
  onClose: () => void;
  onSelect: (
    fileId: string,
    sourceInfo?: {
      sourceType: "local" | "gmail";
      searchPattern?: string;
      gmailIntegrationId?: string;
      gmailMessageId?: string;
    }
  ) => Promise<void>;
  connectedFileIds?: string[];
  transaction?: Transaction | null;
}

interface EmailWithContent extends EmailMessage {
  integrationId: string;
  htmlBody?: string;
  textBody?: string;
  loadingContent?: boolean;
}

interface GmailAttachmentItem {
  key: string;
  attachment: EmailAttachment;
  message: EmailMessage;
  integrationId: string;
}

export function ConnectFileOverlay({
  open,
  onClose,
  onSelect,
  connectedFileIds = [],
  transaction,
}: ConnectFileOverlayProps) {
  // Common state
  const [activeTab, setActiveTab] = useState<"files" | "gmail-attachments" | "email-to-pdf">("files");
  const [searchQuery, setSearchQuery] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const hasTriedAutoSearch = useRef(false);

  // Files tab state
  const [selectedResult, setSelectedResult] = useState<UnifiedSearchResult | null>(null);

  // Gmail attachments tab state
  const [gmailMessages, setGmailMessages] = useState<EmailMessage[]>([]);
  const [selectedAttachmentKey, setSelectedAttachmentKey] = useState<string | null>(null);
  const [isSavingAttachment, setIsSavingAttachment] = useState(false);

  // Email to PDF tab state
  const [emails, setEmails] = useState<EmailWithContent[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<EmailWithContent | null>(null);
  const [isConverting, setIsConverting] = useState(false);

  // Common loading/error state
  const [searchLoading, setSearchLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailContentByMessageId, setEmailContentByMessageId] = useState<
    Record<string, { textBody?: string; htmlBody?: string }>
  >({});
  const [lastSearchTerm, setLastSearchTerm] = useState<string | null>(null);
  const [gmailAuthIssues, setGmailAuthIssues] = useState<
    Record<string, { code: string; message: string }>
  >({});

  // Hooks
  const { partners } = usePartners();
  const { integrations, hasGmailIntegration } = useEmailIntegrations();
  const gmailIntegrations = useMemo(
    () => integrations.filter((i) => i.provider === "gmail"),
    [integrations]
  );
  const integrationLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const integration of integrations) {
      map.set(
        integration.id,
        integration.displayName || integration.email || integration.provider
      );
    }
    return map;
  }, [integrations]);

  const partner = useMemo(
    () => (transaction?.partnerId ? partners.find((p) => p.id === transaction.partnerId) : null),
    [partners, transaction?.partnerId]
  );

  // AI suggestions - pass full transaction and partner, only enabled when overlay is open
  const { queries: suggestedQueries, isLoading: suggestionsLoading } = useGmailSearchQueries({
    transaction,
    partner,
    enabled: open,
  });

  // Build transaction info for the search hook
  const searchTransactionInfo: TransactionInfo | null = useMemo(() => {
    if (!transaction) return null;
    return {
      id: transaction.id,
      date: transaction.date.toDate(),
      amount: transaction.amount,
      currency: transaction.currency,
      partner: transaction.partner || undefined,
      partnerId: transaction.partnerId || undefined,
    };
  }, [transaction]);

  // Local files search hook
  const {
    results: localFileResults,
    loading: localFilesLoading,
    search: searchLocalFiles,
    clear: clearLocalFiles,
    hasSearched: hasSearchedLocalFiles,
  } = useUnifiedFileSearch(
    searchTransactionInfo || { id: "", date: new Date(), amount: 0, currency: "EUR" },
    partner,
    { localOnly: true }
  );

  // Transaction date for sorting results by proximity
  const transactionDate = transaction?.date.toDate();

  // Flatten Gmail attachments - sorted by proximity to transaction date
  const allAttachments = useMemo(() => {
    const attachments: GmailAttachmentItem[] = [];
    for (const message of gmailMessages) {
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
      // Likely receipts first
      if (a.attachment.isLikelyReceipt && !b.attachment.isLikelyReceipt) return -1;
      if (!a.attachment.isLikelyReceipt && b.attachment.isLikelyReceipt) return 1;
      // Then by proximity to transaction date (closest first)
      if (transactionDate) {
        const aDiff = Math.abs(a.message.date.getTime() - transactionDate.getTime());
        const bDiff = Math.abs(b.message.date.getTime() - transactionDate.getTime());
        return aDiff - bDiff;
      }
      // Fallback to newest first
      return b.message.date.getTime() - a.message.date.getTime();
    });
  }, [gmailMessages, transactionDate]);

  const selectedAttachment = useMemo(() => {
    if (!selectedAttachmentKey) return null;
    return allAttachments.find((a) => a.key === selectedAttachmentKey) || null;
  }, [allAttachments, selectedAttachmentKey]);

  useEffect(() => {
    if (!hasSearched || gmailMessages.length === 0) return;

    let cancelled = false;

    const fetchContent = async () => {
      for (const message of gmailMessages) {
        if (emailContentByMessageId[message.messageId]) continue;

        try {
          const response = await fetch("/api/gmail/email-content", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              integrationId: message.integrationId,
              messageId: message.messageId,
            }),
          });

          if (!response.ok) continue;
          const data = await response.json();
          if (cancelled) return;

          setEmailContentByMessageId((prev) => ({
            ...prev,
            [message.messageId]: {
              textBody: data.textBody,
              htmlBody: data.htmlBody,
            },
          }));
        } catch {
          // Ignore content fetch errors to avoid blocking search UI
        }
      }
    };

    fetchContent();

    return () => {
      cancelled = true;
    };
  }, [gmailMessages, hasSearched, emailContentByMessageId]);

  const attachmentSignals = useMemo(() => {
    const amountVariants = buildAmountVariants(transaction?.amount);
    const partnerTokens = [
      ...extractTokens(partner?.name),
      ...extractTokens(transaction?.partner),
    ];
    const invoiceTokens = [
      ...extractTokens(transaction?.name),
      ...extractTokens(transaction?.reference),
    ];
    const knownDomains = (partner?.emailDomains || []).map((d) => d.toLowerCase());
    const gmailPatterns = (partner?.fileSourcePatterns || []).filter(
      (pattern) => pattern.sourceType === "gmail" && pattern.integrationId
    );

    const map = new Map<
      string,
      { score: number; label: string | null; reasons: string[] }
    >();

    for (const item of allAttachments) {
      const message = item.message;
      const content = emailContentByMessageId[message.messageId];
      const bodyText = content?.textBody
        ? content.textBody
        : content?.htmlBody
          ? stripHtml(content.htmlBody)
          : "";

      const combined = [
        message.subject,
        message.snippet,
        message.from,
        bodyText,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const filename = item.attachment.filename.toLowerCase();
      const subject = (message.subject || "").toLowerCase();
      const senderDomain = extractEmailDomain(message.from);

      let score = 0;
      const reasons: string[] = [];
      let dateMultiplier = 1;

      if (item.attachment.isLikelyReceipt) {
        score += 0.15;
        reasons.push("Likely receipt file type");
      }
      if (containsAny(filename, RECEIPT_KEYWORDS)) {
        score += 0.25;
        reasons.push("Filename has invoice keyword");
      }
      if (containsAny(subject, RECEIPT_KEYWORDS)) {
        score += 0.15;
        reasons.push("Subject has invoice keyword");
      }
      if (containsAny(combined, RECEIPT_KEYWORDS)) {
        score += 0.1;
        reasons.push("Email text has invoice keyword");
      }

      if (
        amountVariants.length > 0 &&
        containsAny(combined + " " + filename, amountVariants.map((v) => v.toLowerCase()))
      ) {
        score += 0.2;
        reasons.push("Amount appears in email or filename");
      }

      if (partnerTokens.length > 0 && containsAny(combined, partnerTokens)) {
        score += 0.1;
        reasons.push("Partner name appears in email");
      }

      if (invoiceTokens.length > 0 && containsAny(combined + " " + filename, invoiceTokens)) {
        score += 0.1;
        reasons.push("Invoice reference appears in email or filename");
      }

      if (senderDomain && knownDomains.includes(senderDomain)) {
        score += 0.2;
        reasons.push(`Sender domain matches ${senderDomain}`);
      }

      if (
        gmailPatterns.some((pattern) => pattern.integrationId === message.integrationId)
      ) {
        score += 0.1;
        reasons.push("Learned Gmail account pattern");
      }

      if (transactionDate) {
        const dayDiff =
          Math.abs(message.date.getTime() - transactionDate.getTime()) / (1000 * 60 * 60 * 24);
        if (dayDiff <= 7) dateMultiplier = 1;
        else if (dayDiff <= 14) dateMultiplier = 0.9;
        else if (dayDiff <= 30) dateMultiplier = 0.8;
        else if (dayDiff <= 60) dateMultiplier = 0.65;
        else if (dayDiff <= 90) dateMultiplier = 0.5;
        else if (dayDiff <= 180) dateMultiplier = 0.35;
        else dateMultiplier = 0.25;
        reasons.push(`Date distance ×${dateMultiplier.toFixed(2)}`);
      }

      score = score * dateMultiplier;

      if (score > 0.95) score = 0.95;

      const label = score >= 0.75 ? "Strong" : score >= 0.4 ? "Likely" : null;
      map.set(item.key, { score, label, reasons });
    }

    return map;
  }, [
    allAttachments,
    emailContentByMessageId,
    partner?.name,
    partner?.emailDomains,
    partner?.fileSourcePatterns,
    transaction?.amount,
    transaction?.name,
    transaction?.partner,
    transaction?.reference,
    transactionDate,
  ]);

  const sortedAttachments = useMemo(() => {
    return [...allAttachments].sort((a, b) => {
      const aScore = attachmentSignals.get(a.key)?.score ?? 0;
      const bScore = attachmentSignals.get(b.key)?.score ?? 0;
      if (bScore !== aScore) return bScore - aScore;

      if (a.attachment.isLikelyReceipt && !b.attachment.isLikelyReceipt) return -1;
      if (!a.attachment.isLikelyReceipt && b.attachment.isLikelyReceipt) return 1;

      if (transactionDate) {
        const aDiff = Math.abs(a.message.date.getTime() - transactionDate.getTime());
        const bDiff = Math.abs(b.message.date.getTime() - transactionDate.getTime());
        return aDiff - bDiff;
      }

      return b.message.date.getTime() - a.message.date.getTime();
    });
  }, [allAttachments, attachmentSignals, transactionDate]);

  // Sort emails by proximity to transaction date
  const sortedEmails = useMemo(() => {
    if (!transactionDate) return emails;
    return [...emails].sort((a, b) => {
      const aDiff = Math.abs(a.date.getTime() - transactionDate.getTime());
      const bDiff = Math.abs(b.date.getTime() - transactionDate.getTime());
      return aDiff - bDiff;
    });
  }, [emails, transactionDate]);

  // Best learned pattern
  const bestLearnedPattern = useMemo(() => {
    if (!partner?.fileSourcePatterns?.length) return null;
    const sorted = [...partner.fileSourcePatterns].sort((a, b) => {
      if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
      return b.confidence - a.confidence;
    });
    return sorted[0];
  }, [partner?.fileSourcePatterns]);

  // Simple search fallback
  const simpleSearch = useMemo(() => {
    const cleanText = (text: string) => {
      const cleaned = text
        .toLowerCase()
        .replace(/^(pp\*|sq\*|paypal\s*\*|ec\s+|sepa\s+)/i, "")
        .replace(/\.(com|de|at|ch|eu|net|org|io)(\/.*)?$/i, "")
        .replace(/\s+(gmbh|ag|inc|llc|ltd|sagt danke|marketplace|lastschrift|gutschrift|ab|bv|nv).*$/i, "")
        .replace(/\s+\d{4,}.*$/, "")
        .replace(/\d{6,}\*+\d+/g, "")
        .replace(/[*]{3,}/g, "")
        .replace(/[^a-z\s]/g, " ")
        .trim();
      const words = cleaned.split(/\s+/).filter((w) => w.length > 2);
      return words[0] || "";
    };

    const candidates = [
      partner?.name,
      transaction?.partner,
      transaction?.name,
      transaction?.reference,
    ].filter(Boolean);

    for (const text of candidates) {
      const cleaned = cleanText(text!);
      if (cleaned && cleaned.length >= 2) return cleaned;
    }
    return "";
  }, [partner?.name, transaction?.partner, transaction?.name, transaction?.reference]);

  const buildGmailQueries = useCallback(
    (searchWith: string, includeTransactionTokens: boolean) => {
    const queries = new Set<string>();
    if (searchWith) {
      queries.add(searchWith);
    }

    const isDomain = /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(searchWith);
    const isEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(searchWith);
    const hasGmailOperator = searchWith.includes(":");

    if (!hasGmailOperator && (isDomain || isEmail)) {
      queries.add(`from:${searchWith}`);
    }

    const tokenSources = [searchWith];
    if (includeTransactionTokens) {
      if (transaction?.name) tokenSources.push(transaction.name);
      if (transaction?.reference) tokenSources.push(transaction.reference);
    }

    const filenameTokens = new Set<string>();
    for (const source of tokenSources) {
      if (!/\d/.test(source)) continue;
      const normalizedSource = source.replace(/\s+/g, "");
      const patterns = [source, normalizedSource];
      for (const value of patterns) {
        const matches =
          value.match(/\b[A-Za-z]{0,5}-?\d{3,}(?:[./]\d+)?\b/g) || [];
        for (const match of matches) {
          const cleaned = match.replace(/[^A-Za-z0-9._-]/g, "");
          if (cleaned.length > 0) {
            filenameTokens.add(cleaned);
          }
        }
      }
    }

    for (const token of filenameTokens) {
      queries.add(`filename:${token}`);
    }

    return Array.from(queries);
  }, [transaction?.name, transaction?.reference]);

  // Track transaction ID to detect changes
  const lastTransactionIdRef = useRef<string | null>(null);

  // Reset state when overlay opens OR transaction changes
  useEffect(() => {
    if (!open) return;

    const transactionChanged = transaction?.id !== lastTransactionIdRef.current;
    lastTransactionIdRef.current = transaction?.id || null;

    if (transactionChanged) {
      setActiveTab("files");
      setSearchQuery("");
      setSelectedResult(null);
      setGmailMessages([]);
      setSelectedAttachmentKey(null);
      setEmails([]);
      setSelectedEmail(null);
      setIsConnecting(false);
      setHasSearched(false);
      setError(null);
      hasTriedAutoSearch.current = false;
      clearLocalFiles();
    }
  }, [open, transaction?.id, clearLocalFiles]);

  // Auto-search when transaction is ready
  useEffect(() => {
    if (!open || hasSearched || hasTriedAutoSearch.current) return;
    if (!transaction) return;

    hasTriedAutoSearch.current = true;

    // Use learned pattern if available, otherwise use simple search
    const queryToUse = bestLearnedPattern?.pattern || simpleSearch;

    if (queryToUse) {
      setSearchQuery(queryToUse);
      setTimeout(() => handleSearch(queryToUse, "auto"), 50);
    }
  }, [open, hasSearched, transaction, bestLearnedPattern, simpleSearch]);

  // Helper to search Gmail with a specific query
  const searchGmail = useCallback(async (
    integration: { id: string },
    query: string,
    hasAttachments: boolean,
    expandThreads: boolean = false,
    limit: number = 20
  ): Promise<{
    messages: EmailMessage[];
    authIssue?: { integrationId: string; code: string; message: string };
  }> => {
    try {
      const response = await fetch("/api/gmail/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          integrationId: integration.id,
          query,
          hasAttachments,
          limit,
          expandThreads,
        }),
      });
      if (!response.ok) {
        let errorData: { error?: string; code?: string } | null = null;
        try {
          errorData = await response.json();
        } catch {
          errorData = null;
        }

        if (response.status === 403 && errorData?.code && AUTH_ERROR_CODES.has(errorData.code)) {
          return {
            messages: [],
            authIssue: {
              integrationId: integration.id,
              code: errorData.code,
              message: errorData.error || "Reconnect Gmail to search this inbox.",
            },
          };
        }

        return { messages: [] };
      }
      const data = await response.json();
      return {
        messages: (data.messages || []).map((msg: EmailMessage & { date: string }) => ({
          ...msg,
          date: new Date(msg.date),
          integrationId: integration.id,
        })),
      };
    } catch {
      return { messages: [] };
    }
  }, []);

  // Deduplicate messages by messageId
  const dedupeMessages = (messages: EmailMessage[]): EmailMessage[] => {
    const seen = new Set<string>();
    return messages.filter((msg) => {
      if (seen.has(msg.messageId)) return false;
      seen.add(msg.messageId);
      return true;
    });
  };

  // Search handler - searches based on active tab
  const handleSearch = useCallback(async (query?: string, source: "auto" | "manual" = "manual") => {
    const searchWith = query || searchQuery;
    if (!searchWith) return;

    setLastSearchTerm(searchWith);
    setSearchLoading(true);
    setError(null);
    setHasSearched(true);
    setSelectedResult(null);
    setSelectedAttachmentKey(null);
    setSelectedEmail(null);
    setGmailAuthIssues({});

    try {
      // Always search local files
      searchLocalFiles(searchWith);

      // Search Gmail if integrations available
      if (hasGmailIntegration && gmailIntegrations.length > 0) {
        // Build query variations to find more results
        // 1. Basic query (searches subject, body, etc.)
        // 2. from: query (finds emails from sender/domain matching query)
        const queries = buildGmailQueries(searchWith, source === "auto");

        // Search for attachments with all query variations
        // expandThreads=true fetches all messages in matching threads for complete attachment coverage
        const attachmentResults = await Promise.all(
          gmailIntegrations.flatMap((integration) =>
            queries.flatMap((q) => [
              searchGmail(integration, q, true, true, 50),
              searchGmail(integration, q, false, true, 20),
            ])
          )
        );
        const attachmentMessages = attachmentResults.flatMap((result) => result.messages);
        setGmailMessages(dedupeMessages(attachmentMessages));

        // Search for emails with all query variations
        // expandThreads=true ensures we see full thread context for email-to-PDF conversion
        const emailResults = await Promise.all(
          gmailIntegrations.flatMap((integration) =>
            queries.map((q) => searchGmail(integration, q, false, true, 20))
          )
        );
        const emailMessages = emailResults.flatMap((result) => result.messages);
        setEmails(dedupeMessages(emailMessages));

        const issueMap = new Map<string, { code: string; message: string }>();
        for (const result of [...attachmentResults, ...emailResults]) {
          if (result.authIssue && !issueMap.has(result.authIssue.integrationId)) {
            issueMap.set(result.authIssue.integrationId, {
              code: result.authIssue.code,
              message: result.authIssue.message,
            });
          }
        }
        setGmailAuthIssues(Object.fromEntries(issueMap));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearchLoading(false);
    }
  }, [
    searchQuery,
    searchLocalFiles,
    hasGmailIntegration,
    gmailIntegrations,
    searchGmail,
    buildGmailQueries,
  ]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch(undefined, "manual");
  }, [handleSearch]);

  // Handle selecting a local file
  const handleSelectLocalFile = async () => {
    if (!selectedResult) return;

    setIsConnecting(true);
    try {
      if (selectedResult.type === "local" && selectedResult.fileId) {
        await onSelect(selectedResult.fileId, {
          sourceType: "local",
          searchPattern: searchQuery || undefined,
        });

        if (partner && searchQuery && transaction) {
          try {
            await learnFileSourcePattern(
              { db, userId: MOCK_USER_ID },
              partner.id,
              transaction.id,
              { sourceType: "local", searchPattern: searchQuery }
            );
          } catch (err) {
            console.error("Failed to learn pattern:", err);
          }
        }
      }
      onClose();
    } catch (error) {
      console.error("Failed to connect file:", error);
    } finally {
      setIsConnecting(false);
    }
  };

  const gmailAuthIssueList = useMemo(() => {
    if (Object.keys(gmailAuthIssues).length === 0) return [];
    return Object.entries(gmailAuthIssues).map(([integrationId, issue]) => {
      const integration = integrations.find((item) => item.id === integrationId);
      const providerLabel = integration?.provider
        ? `${integration.provider.charAt(0).toUpperCase()}${integration.provider.slice(1)}`
        : "Email";
      return {
        integrationId,
        email: integration?.email || integration?.displayName || "Gmail",
        providerLabel,
        message: issue.message,
      };
    });
  }, [gmailAuthIssues, integrations]);

  const reconnectReturnTo = useMemo(() => {
    if (typeof window === "undefined") return "/integrations";
    const pathname = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);
    if (transaction?.id) {
      if (!searchParams.get("id")) {
        searchParams.set("id", transaction.id);
      }
      if (searchParams.get("connect") !== "true") {
        searchParams.set("connect", "true");
      }
    }
    return `${pathname}?${searchParams.toString()}`;
  }, [transaction?.id]);

  // Handle saving Gmail attachment
  const handleSaveAttachment = async () => {
    if (!selectedAttachment) return;

    setIsSavingAttachment(true);
    setError(null);

    try {
      const response = await fetch("/api/gmail/attachment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          integrationId: selectedAttachment.integrationId,
          messageId: selectedAttachment.attachment.messageId,
          attachmentId: selectedAttachment.attachment.attachmentId,
          mimeType: selectedAttachment.attachment.mimeType,
          filename: selectedAttachment.attachment.filename,
          gmailMessageSubject: selectedAttachment.message.subject,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save attachment");
      }

      const data = await response.json();
      const searchPattern = lastSearchTerm || searchQuery || undefined;
      await onSelect(data.fileId, {
        sourceType: "gmail",
        searchPattern,
        gmailIntegrationId: selectedAttachment.integrationId,
        gmailMessageId: selectedAttachment.attachment.messageId,
      });

      if (partner && searchPattern && transaction) {
        try {
          await learnFileSourcePattern(
            { db, userId: MOCK_USER_ID },
            partner.id,
            transaction.id,
            {
              sourceType: "gmail",
              searchPattern,
              integrationId: selectedAttachment.integrationId,
            }
          );
        } catch (err) {
          console.error("Failed to learn file source pattern:", err);
        }
      }

      const senderDomain = extractEmailDomain(selectedAttachment.message.from);
      if (partner && senderDomain) {
        try {
          await addEmailDomainToPartner(
            { db, userId: MOCK_USER_ID },
            partner.id,
            senderDomain
          );
        } catch (err) {
          console.error("Failed to learn email domain:", err);
        }
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save attachment");
    } finally {
      setIsSavingAttachment(false);
    }
  };

  // Handle loading email content
  const handleSelectEmail = async (email: EmailWithContent) => {
    setSelectedEmail(email);
    if (email.htmlBody || email.textBody) return;

    setEmails(prev => prev.map(e =>
      e.messageId === email.messageId ? { ...e, loadingContent: true } : e
    ));

    try {
      const response = await fetch("/api/gmail/email-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          integrationId: email.integrationId,
          messageId: email.messageId,
        }),
      });

      if (!response.ok) throw new Error("Failed to load email");

      const data = await response.json();
      const updatedEmail = { ...email, htmlBody: data.htmlBody, textBody: data.textBody, loadingContent: false };

      setEmails(prev => prev.map(e => e.messageId === email.messageId ? updatedEmail : e));
      setSelectedEmail(updatedEmail);
    } catch (err) {
      console.error("Failed to load email content:", err);
      setEmails(prev => prev.map(e => e.messageId === email.messageId ? { ...e, loadingContent: false } : e));
    }
  };

  // Handle converting email to PDF
  const handleConvertToPdf = async () => {
    if (!selectedEmail) return;

    setIsConverting(true);
    setError(null);

    try {
      const response = await fetch("/api/gmail/convert-to-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      await onSelect(data.fileId, { sourceType: "gmail" });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to convert email");
    } finally {
      setIsConverting(false);
    }
  };

  const formatAmount = (amount: number | null | undefined, currency: string | null | undefined) => {
    if (amount == null) return null;
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: currency || "EUR" }).format(amount / 100);
  };

  const isFileConnected = (result: UnifiedSearchResult) => {
    return result.type === "local" && result.fileId ? connectedFileIds.includes(result.fileId) : false;
  };

  const getAttachmentPreviewUrl = (attachment: EmailAttachment, integrationId: string): string => {
    const params = new URLSearchParams({
      integrationId,
      messageId: attachment.messageId,
      attachmentId: attachment.attachmentId,
      mimeType: attachment.mimeType,
      filename: attachment.filename,
    });
    return `/api/gmail/attachment?${params.toString()}`;
  };

  // Subtitle
  const subtitle = transaction ? (
    <>
      {format(transaction.date.toDate(), "MMM d, yyyy")} &middot;{" "}
      <span className={transaction.amount < 0 ? "text-red-600" : "text-green-600"}>
        {new Intl.NumberFormat("de-DE", { style: "currency", currency: transaction.currency }).format(transaction.amount / 100)}
      </span>
      {transaction.partner && ` · ${transaction.partner}`}
    </>
  ) : undefined;

  const loading = searchLoading || localFilesLoading;

  return (
    <TooltipProvider>
      <ContentOverlay open={open} onClose={onClose} title="Connect File to Transaction" subtitle={subtitle}>
      <div className="flex h-full">
        {/* Left sidebar: Search + Tabs + Results */}
        <div className="w-[350px] shrink-0 border-r flex flex-col min-h-0">
          {/* Search section */}
          <div className="p-4 border-b space-y-3">
            {/* AI suggestions */}
            {suggestionsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Generating suggestions...</span>
              </div>
            ) : suggestedQueries.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {suggestedQueries.map((query, idx) => (
                  <Badge
                    key={idx}
                    variant={searchQuery === query ? "default" : "outline"}
                    className={cn(
                      "cursor-pointer hover:bg-primary/10 transition-colors",
                      searchQuery === query && "bg-primary text-primary-foreground"
                    )}
                    onClick={() => {
                      setSearchQuery(query);
                      handleSearch(query, "manual");
                    }}
                  >
                    {query}
                  </Badge>
                ))}
              </div>
            ) : null}

            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pl-9"
              />
            </div>

            <Button onClick={() => handleSearch(undefined, "manual")} disabled={loading} className="w-full">
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
              Search
            </Button>
          </div>

          {/* Error */}
          {error && (
            <div className="px-4 py-2 text-sm text-red-600 bg-red-50 border-b">
              {error}
            </div>
          )}

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="flex flex-col flex-1 min-h-0">
            <TabsList className="h-10 w-full grid grid-cols-3 rounded-none border-b shrink-0">
              <TabsTrigger value="files" className="gap-1 text-xs">
                <HardDrive className="h-3.5 w-3.5" />
                Files
                {hasSearchedLocalFiles && localFileResults.length > 0 && (
                  <span className="ml-1 text-xs text-muted-foreground">({localFileResults.length})</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="gmail-attachments" className="gap-1 text-xs">
                <Paperclip className="h-3.5 w-3.5" />
                Attachments
                {hasSearched && allAttachments.length > 0 && (
                  <span className="ml-1 text-xs text-muted-foreground">({allAttachments.length})</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="email-to-pdf" className="gap-1 text-xs">
                <Mail className="h-3.5 w-3.5" />
                Emails
                {hasSearched && sortedEmails.length > 0 && (
                  <span className="ml-1 text-xs text-muted-foreground">({sortedEmails.length})</span>
                )}
              </TabsTrigger>
            </TabsList>

            {gmailAuthIssueList.length > 0 && (
              <div className="px-4 py-2 text-xs text-amber-700 bg-amber-50 border-b flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium">Reconnect Search Integration</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {gmailAuthIssueList.map((issue) => (
                      <Button
                        key={issue.integrationId}
                        variant="outline"
                        size="sm"
                        className="h-7 px-3 border-amber-200 text-amber-700 hover:bg-amber-100"
                        asChild
                      >
                        <a
                          href={`/integrations/${issue.integrationId}?toggleReconnect=true&returnTo=${encodeURIComponent(reconnectReturnTo)}`}
                        >
                          <RefreshCw className="h-3 w-3 mr-1" />
                          {issue.providerLabel}: {issue.email}
                        </a>
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Files Tab Results */}
            <TabsContent value="files" className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden" forceMount>
              <ScrollArea className="h-full">
                {!hasSearchedLocalFiles ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Search for files</p>
                  </div>
                ) : localFileResults.length === 0 && !localFilesLoading ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No files found</p>
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {localFileResults.map((result) => {
                      const isConnected = isFileConnected(result);
                      const isSelected = selectedResult?.id === result.id;
                      const isPdf = result.mimeType === "application/pdf";

                      return (
                        <button
                          key={result.id}
                          type="button"
                          disabled={isConnected}
                          onClick={() => setSelectedResult(result)}
                          className={cn(
                            "w-full flex items-start gap-3 p-3 rounded-md text-left transition-colors",
                            isSelected && "bg-primary/10 ring-1 ring-primary",
                            !isSelected && !isConnected && "hover:bg-muted",
                            isConnected && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          <div className="flex-shrink-0 w-10 h-10 rounded bg-muted flex items-center justify-center">
                            {isPdf ? <FileText className="h-5 w-5 text-red-500" /> : <Image className="h-5 w-5 text-blue-500" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate">{result.filename}</p>
                              {isConnected && (
                                <Badge variant="secondary" className="text-xs">
                                  <Link2 className="h-3 w-3 mr-1" />
                                  Connected
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {result.date && <span>{format(result.date, "MMM d, yyyy")}</span>}
                              {result.amount && (
                                <>
                                  <span>·</span>
                                  <span>{formatAmount(result.amount, result.currency)}</span>
                                </>
                              )}
                            </div>
                            {result.partner && <p className="text-xs text-muted-foreground truncate mt-0.5">{result.partner}</p>}
                            {result.matchedFields && result.matchedFields.length > 0 && (
                              <p className="text-xs text-primary/70 mt-0.5">
                                Matched: {result.matchedFields.join(", ")}
                              </p>
                            )}
                          </div>
                          {isSelected && <Check className="h-4 w-4 text-primary flex-shrink-0 mt-1" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            {/* Gmail Attachments Tab Results */}
            <TabsContent value="gmail-attachments" className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden" forceMount>
              <ScrollArea className="h-full">
                {!hasGmailIntegration ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <Mail className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No Gmail connected</p>
                  </div>
                ) : !hasSearched ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <Paperclip className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Search for attachments</p>
                  </div>
                ) : allAttachments.length === 0 && !loading ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <Paperclip className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No attachments found</p>
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {sortedAttachments.map((item) => {
                      const isSelected = selectedAttachmentKey === item.key;
                      const isPdf =
                        item.attachment.mimeType === "application/pdf" ||
                        (item.attachment.mimeType === "application/octet-stream" &&
                          item.attachment.filename.toLowerCase().endsWith(".pdf"));
                      const signal = attachmentSignals.get(item.key);
                      const confidence = signal ? Math.round(signal.score * 100) : null;

                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setSelectedAttachmentKey(item.key)}
                          className={cn(
                            "w-full flex items-start gap-3 p-3 rounded-md text-left transition-colors min-w-0 overflow-hidden",
                            isSelected && "bg-primary/10 ring-1 ring-primary",
                            !isSelected && "hover:bg-muted"
                          )}
                        >
                          <div className="h-10 w-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                            {isPdf ? <FileText className="h-5 w-5 text-red-500" /> : <Image className="h-5 w-5 text-blue-500" />}
                          </div>
                          <div className="flex-1 min-w-0 overflow-hidden">
                            <p className="text-sm font-medium truncate">{item.attachment.filename}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {item.message.fromName || item.message.from}
                            </p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {integrationLabels.get(item.message.integrationId) || "Gmail"}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 mt-0.5 min-w-0">
                              <span className="text-xs text-muted-foreground">{format(item.message.date, "MMM d, yyyy")}</span>
                              <span className="text-xs text-muted-foreground">·</span>
                              <span className="text-xs text-muted-foreground">{Math.round(item.attachment.size / 1024)} KB</span>
                              {signal?.label && (
                                <Badge variant="secondary" className="text-xs py-0 h-4 text-green-600">
                                  {signal.label}
                                </Badge>
                              )}
                              {confidence !== null && confidence > 0 && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="outline" className="text-xs py-0 h-4">
                                      {confidence}%
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-[260px] text-xs">
                                    <div className="font-medium mb-1">Confidence signals</div>
                                    <div className="space-y-0.5">
                                      {signal?.reasons?.length
                                        ? signal.reasons.map((reason, index) => (
                                            <div key={`${item.key}-reason-${index}`}>
                                              {reason}
                                            </div>
                                          ))
                                        : "No signals yet"}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </div>
                          {isSelected && <Check className="h-4 w-4 text-primary flex-shrink-0 mt-1" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            {/* Email to PDF Tab Results */}
            <TabsContent value="email-to-pdf" className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden" forceMount>
              <ScrollArea className="h-full">
                {!hasGmailIntegration ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <Mail className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No Gmail connected</p>
                  </div>
                ) : !hasSearched ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <Mail className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Search for emails</p>
                  </div>
                ) : sortedEmails.length === 0 && !loading ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <Mail className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No emails found</p>
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {sortedEmails.map((email) => {
                      const isSelected = selectedEmail?.messageId === email.messageId;

                      return (
                        <button
                          key={email.messageId}
                          type="button"
                          onClick={() => handleSelectEmail(email)}
                          className={cn(
                            "w-full flex items-start gap-3 p-3 rounded-md text-left transition-colors",
                            isSelected && "bg-primary/10 ring-1 ring-primary",
                            !isSelected && "hover:bg-muted"
                          )}
                        >
                          <div className="h-10 w-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                            <Mail className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{email.subject}</p>
                            <p className="text-xs text-muted-foreground truncate">{email.fromName || email.from}</p>
                            <span className="text-xs text-muted-foreground">{format(email.date, "MMM d, yyyy")}</span>
                          </div>
                          {isSelected && <Check className="h-4 w-4 text-primary flex-shrink-0 mt-1" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right panel: Preview + Actions */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          {/* Files preview */}
          {activeTab === "files" && (
            selectedResult ? (
              <>
                <div className="flex-1 overflow-hidden">
                  <FilePreview downloadUrl={selectedResult.previewUrl} fileType={selectedResult.mimeType} fileName={selectedResult.filename} fullSize />
                </div>
                <div className="border-t p-4 flex justify-end gap-2 shrink-0">
                  <Button variant="outline" onClick={onClose}>Cancel</Button>
                  <Button onClick={handleSelectLocalFile} disabled={isConnecting}>
                    {isConnecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Connect File
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Select a file to preview</p>
                </div>
              </div>
            )
          )}

          {/* Gmail attachments preview */}
          {activeTab === "gmail-attachments" && (
            selectedAttachment ? (
              <>
                <div className="flex-1 overflow-hidden">
                  <FilePreview
                    downloadUrl={getAttachmentPreviewUrl(selectedAttachment.attachment, selectedAttachment.integrationId)}
                    fileType={selectedAttachment.attachment.mimeType}
                    fileName={selectedAttachment.attachment.filename}
                    fullSize
                  />
                </div>
                <div className="border-t p-4 flex justify-end gap-2 shrink-0">
                  <Button variant="outline" onClick={onClose}>Cancel</Button>
                  <Button onClick={handleSaveAttachment} disabled={isSavingAttachment}>
                    {isSavingAttachment ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Save & Connect
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Paperclip className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Select an attachment to preview</p>
                </div>
              </div>
            )
          )}

          {/* Email to PDF preview */}
          {activeTab === "email-to-pdf" && (
            selectedEmail ? (
              <>
                <div className="flex-1 overflow-hidden">
                  {selectedEmail.loadingContent ? (
                    <div className="h-full flex items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : selectedEmail.htmlBody ? (
                    <iframe srcDoc={selectedEmail.htmlBody} className="w-full h-full border-0 bg-white" sandbox="allow-same-origin" title="Email content" />
                  ) : selectedEmail.textBody ? (
                    <div className="p-4 overflow-auto h-full">
                      <pre className="whitespace-pre-wrap text-sm font-sans">{selectedEmail.textBody}</pre>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground">
                      <p>No content available</p>
                    </div>
                  )}
                </div>
                <div className="border-t p-4 flex justify-end gap-2 shrink-0">
                  <Button variant="outline" onClick={onClose}>Cancel</Button>
                  <Button onClick={handleConvertToPdf} disabled={isConverting}>
                    {isConverting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
                    Convert to PDF & Connect
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Mail className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Select an email to preview</p>
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </ContentOverlay>
    </TooltipProvider>
  );
}
