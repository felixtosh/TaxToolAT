"use client";

import { useState, useEffect, useRef } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { UserPartner } from "@/types/partner";
import { Transaction } from "@/types/transaction";

const MOCK_USER_ID = "dev-user-123";

interface UseGmailSearchQueriesOptions {
  transaction?: Transaction | null;
  partner?: UserPartner | null;
  /** Only generate/save queries when enabled (e.g., when overlay is open) */
  enabled?: boolean;
}

/**
 * Generate search suggestions from transaction/partner data.
 * Prioritize partner-local matching criteria before transaction-derived tokens.
 */
function generateQueries(
  transaction: Transaction,
  partner?: UserPartner | null
): string[] {
  const suggestions = new Map<
    string,
    { query: string; score: number; order: number }
  >();
  let order = 0;

  const normalizeQuery = (s: string) =>
    s.trim().replace(/\s+/g, " ").toLowerCase();

  const addSuggestion = (s: string, score: number) => {
    const cleaned = normalizeQuery(s);
    if (!cleaned || cleaned.length < 2) return;

    const existing = suggestions.get(cleaned);
    if (!existing || score > existing.score) {
      suggestions.set(cleaned, {
        query: cleaned,
        score,
        order: existing?.order ?? order++,
      });
    }
  };

  // Clean bank transaction text to extract company name
  const cleanText = (text: string): string => {
    return text
      .replace(/^(pp\*|sq\*|paypal\s*\*|ec\s+|sepa\s+|lastschrift\s+)/i, "")
      .replace(/\.(com|de|at|ch|eu|net|org|io)(\/.*)?$/i, "")
      .replace(/\s+(gmbh|ag|inc|llc|ltd|sagt danke|marketplace|lastschrift|gutschrift|ab|bv|nv|ug).*$/i, "")
      .replace(/\s+\d{4,}.*$/, "")
      .replace(/\d{6,}\*+\d+/g, "")
      .replace(/[*]{3,}/g, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  // Extract first meaningful word
  const extractFirstWord = (text: string): string => {
    const cleaned = cleanText(text);
    const words = cleaned.split(/\s+/).filter((w) => w.length >= 2);
    return words[0] || "";
  };

  // Extract ALL invoice/reference numbers from text (returns array)
  const extractInvoiceNumbers = (text: string): string[] => {
    if (!text) return [];

    const results: string[] = [];
    const seen = new Set<string>();

    const addResult = (s: string) => {
      const cleaned = s.replace(/^[-_#\s]+|[-_#\s]+$/g, "").trim();
      const lower = cleaned.toLowerCase();
      if (cleaned.length >= 4 && !seen.has(lower)) {
        seen.add(lower);
        results.push(cleaned);
      }
    };

    // Pattern 1: R- 2024.014, R-2024.001, RE-2024-001 (letter prefix + year + separator + number)
    const letterYearPattern = /\b([A-Z]{1,3})[-\s]*(\d{4})[.\-/](\d{1,})\b/gi;
    let match;
    while ((match = letterYearPattern.exec(text)) !== null) {
      // Preserve the original format for searching
      addResult(`${match[1]}- ${match[2]}.${match[3]}`);  // "R- 2024.014"
      addResult(`${match[1]}${match[2]}${match[3]}`);     // "R2024014" compact version
    }

    // Pattern 2: Prefixed numbers: INV-123, RE-2024-001, Invoice #12345
    const prefixedPattern = /\b(inv|re|rg|rech|invoice|rechnung|bill|order|bestellung)[-_]?\s*#?\s*(\d{3,}[-_.\d]*)/gi;
    while ((match = prefixedPattern.exec(text)) !== null) {
      addResult(match[0].replace(/\s+/g, ""));
    }

    // Pattern 3: Year-prefixed: 2024-12345, 2024/001234
    const yearPrefixPattern = /\b(20\d{2})[-/_](\d{4,})\b/g;
    while ((match = yearPrefixPattern.exec(text)) !== null) {
      addResult(`${match[1]}-${match[2]}`);
    }

    // Pattern 4: Long alphanumeric refs (ROC/2024122400589)
    const alphaNumPattern = /\b([A-Z]{2,})\/?(\d{10,})\b/gi;
    while ((match = alphaNumPattern.exec(text)) !== null) {
      addResult(match[2]); // Just the number part for searching
    }

    // Pattern 5: Standalone long numbers (7+ digits, not UUIDs)
    const longNumberPattern = /\b(\d{7,})\b/g;
    while ((match = longNumberPattern.exec(text)) !== null) {
      // Skip if it looks like part of a UUID (has hex characters nearby)
      const surrounding = text.slice(Math.max(0, match.index - 5), match.index + match[0].length + 5);
      if (!/[a-f]/i.test(surrounding)) {
        addResult(match[1]);
      }
    }

    return results;
  };

  // 1. Partner-local strongest criteria
  if (partner?.ibans?.length) {
    for (const iban of partner.ibans) {
      addSuggestion(iban.replace(/\s+/g, ""), 100);
    }
  }

  if (partner?.vatId) {
    addSuggestion(partner.vatId, 95);
  }

  if (partner?.emailDomains?.length) {
    for (const domain of partner.emailDomains) {
      addSuggestion(`from:${domain}`, 90);
      addSuggestion(domain, 88);
    }
  }

  if (partner?.website) {
    const website = partner.website.replace(/^www\./i, "");
    addSuggestion(`from:${website}`, 88);
    addSuggestion(website, 85);
  }

  if (partner?.fileSourcePatterns?.length) {
    const sortedPatterns = [...partner.fileSourcePatterns].sort((a, b) => {
      if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
      return b.confidence - a.confidence;
    });

    for (const pattern of sortedPatterns.slice(0, 5)) {
      const usageBoost = Math.min(5, Math.floor(pattern.usageCount / 2));
      const patternScore = Math.min(95, Math.max(60, pattern.confidence + usageBoost));
      const normalized =
        pattern.sourceType === "local"
          ? pattern.pattern.replace(/\*/g, " ").replace(/\s+/g, " ").trim()
          : pattern.pattern;
      if (normalized) {
        addSuggestion(normalized, patternScore);
      }
    }
  }

  if (partner?.name) {
    const cleaned = cleanText(partner.name);
    addSuggestion(cleaned, 80);
    const firstWord = extractFirstWord(partner.name);
    if (firstWord && firstWord !== cleaned.toLowerCase()) {
      addSuggestion(firstWord, 78);
    }
  }

  if (partner?.aliases?.length) {
    for (const alias of partner.aliases.filter((a) => !a.includes("*"))) {
      const cleaned = cleanText(alias);
      if (cleaned) {
        addSuggestion(cleaned, 72);
      }
    }
  }

  // 2. Transaction-derived tokens
  if (transaction.partner) {
    const cleaned = cleanText(transaction.partner);
    addSuggestion(cleaned, 68);
    const firstWord = extractFirstWord(transaction.partner);
    if (firstWord && firstWord.length >= 3) {
      addSuggestion(firstWord, 66);
    }
  }

  if (transaction.name && transaction.name !== transaction.partner) {
    const firstWord = extractFirstWord(transaction.name);
    if (firstWord && firstWord.length >= 3) {
      addSuggestion(firstWord, 62);
    }
  }

  // 4. Extract ALL invoice numbers from reference, name, and description
  const allInvoiceNumbers = [
    ...extractInvoiceNumbers(transaction.description || ""),
    ...extractInvoiceNumbers(transaction.name || ""),
    ...extractInvoiceNumbers(transaction.reference || ""),
  ];

  // Add all unique invoice numbers (most specific/formatted ones first from description)
  for (const invoiceNum of allInvoiceNumbers) {
    addSuggestion(invoiceNum, 70);
  }

  // Add "rechnung" variant for German invoices (only if we have a name and no invoice numbers)
  if (allInvoiceNumbers.length === 0 && partner?.name) {
    const cleanedName = cleanText(partner.name);
    if (cleanedName) {
      addSuggestion(`${cleanedName} rechnung`, 55);
    }
  }

  const sorted = [...suggestions.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.order - b.order;
  });

  return sorted.slice(0, 8).map((entry) => entry.query);
}

export function useGmailSearchQueries({
  transaction,
  partner,
  enabled = true,
}: UseGmailSearchQueriesOptions = {}) {
  const [queries, setQueries] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const lastTransactionIdRef = useRef<string | null>(null);
  const hasSavedRef = useRef(false);

  useEffect(() => {
    // Don't run if not enabled (e.g., overlay is closed)
    if (!enabled) {
      return;
    }

    if (!transaction) {
      setQueries([]);
      lastTransactionIdRef.current = null;
      hasSavedRef.current = false;
      return;
    }

    // Skip if same transaction already processed
    if (transaction.id === lastTransactionIdRef.current) {
      return;
    }

    lastTransactionIdRef.current = transaction.id;
    hasSavedRef.current = false;

    // Check if we have cached queries that match current partner
    const currentPartnerId = transaction.partnerId || null;
    const cachedPartnerId = transaction.aiSearchQueriesForPartnerId || null;
    const hasCachedQueries = transaction.aiSearchQueries && transaction.aiSearchQueries.length > 0;
    const partnerMatches = currentPartnerId === cachedPartnerId;

    if (hasCachedQueries && partnerMatches) {
      // Use cached queries instantly
      setQueries(transaction.aiSearchQueries!);
      setIsLoading(false);
      return;
    }

    // Generate queries immediately (no AI, pure client-side)
    setIsLoading(true);
    const newQueries = generateQueries(transaction, partner);
    setQueries(newQueries);
    setIsLoading(false);

    // Save to transaction in background (don't block UI)
    if (newQueries.length > 0 && !hasSavedRef.current) {
      hasSavedRef.current = true;
      const txRef = doc(db, "users", MOCK_USER_ID, "transactions", transaction.id);
      updateDoc(txRef, {
        aiSearchQueries: newQueries,
        aiSearchQueriesForPartnerId: currentPartnerId,
      }).catch((err) => {
        // Silently ignore - transaction might not exist or be deleted
        console.warn("Could not cache queries to transaction:", err.code || err.message);
      });
    }
  }, [transaction, partner, enabled]);

  return {
    queries,
    isLoading,
  };
}
