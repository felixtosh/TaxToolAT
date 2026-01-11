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
 * Generate simple search suggestions from transaction/partner data.
 * Fast client-side extraction - no AI needed for this simple task.
 */
function generateQueries(
  transaction: Transaction,
  partner?: UserPartner | null
): string[] {
  const suggestions: string[] = [];
  const seen = new Set<string>();

  const addSuggestion = (s: string) => {
    const cleaned = s.trim().toLowerCase();
    if (cleaned && cleaned.length >= 2 && !seen.has(cleaned)) {
      seen.add(cleaned);
      suggestions.push(cleaned);
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

  // 1. Partner name (most reliable if we have a linked partner)
  if (partner?.name) {
    const cleaned = cleanText(partner.name);
    addSuggestion(cleaned);
    // Also add first word if multi-word
    const firstWord = extractFirstWord(partner.name);
    if (firstWord && firstWord !== cleaned.toLowerCase()) {
      addSuggestion(firstWord);
    }
  }

  // 2. Transaction partner field
  if (transaction.partner) {
    const cleaned = cleanText(transaction.partner);
    addSuggestion(cleaned);
    const firstWord = extractFirstWord(transaction.partner);
    if (firstWord && firstWord.length >= 3) {
      addSuggestion(firstWord);
    }
  }

  // 3. Transaction name (if different)
  if (transaction.name && transaction.name !== transaction.partner) {
    const firstWord = extractFirstWord(transaction.name);
    if (firstWord && firstWord.length >= 3) {
      addSuggestion(firstWord);
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
    addSuggestion(invoiceNum);
  }

  // 5. Add "rechnung" variant for German invoices (only if we have a company name and no invoice numbers)
  if (suggestions.length > 0 && allInvoiceNumbers.length === 0) {
    addSuggestion(`${suggestions[0]} rechnung`);
  }

  // 6. Add from: filter if partner has known email domain
  if (partner?.emailDomains?.length) {
    addSuggestion(`from:${partner.emailDomains[0]}`);
  }

  // Return more suggestions since invoice numbers are highly valuable for search
  return suggestions.slice(0, 8);
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
