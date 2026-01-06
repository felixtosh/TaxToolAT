/**
 * Transaction matching algorithm for files
 *
 * Matches files (receipts/invoices) to transactions based on:
 * 1. Amount match (0-40 points)
 * 2. Date proximity (0-25 points)
 * 3. Partner overlap (0-20 points)
 * 4. IBAN match (0-10 points)
 * 5. Reference/Invoice ID match (0-5 points + date bonus)
 */

import { TaxFile, TransactionSuggestion, TransactionMatchSource } from "@/types/file";
import { Transaction } from "@/types/transaction";
import { normalizeIban } from "@/lib/import/deduplication";
import { Timestamp } from "firebase/firestore";

// === Configuration ===

export const TRANSACTION_MATCH_CONFIG = {
  /** Minimum confidence for auto-matching (creates connection automatically) */
  AUTO_MATCH_THRESHOLD: 85,
  /** Minimum confidence to show as suggestion */
  SUGGESTION_THRESHOLD: 50,
  /** Days to search before/after file date */
  DATE_RANGE_DAYS: 30,
  /** Max suggestions to store per file */
  MAX_SUGGESTIONS: 5,
};

// === Scoring Breakdown ===

export interface TransactionMatchScore {
  transactionId: string;
  confidence: number; // 0-100
  breakdown: {
    amountScore: number; // 0-40
    dateScore: number; // 0-25
    partnerScore: number; // 0-20
    ibanScore: number; // 0-10
    referenceScore: number; // 0-5
  };
  matchSources: TransactionMatchSource[];
  preview: {
    date: Timestamp;
    amount: number;
    currency: string;
    name: string;
    partner: string | null;
  };
}

// === Main Matching Function ===

/**
 * Score a transaction against a file
 * Returns a match score with breakdown
 */
export function scoreTransactionMatch(
  file: TaxFile,
  transaction: Transaction
): TransactionMatchScore {
  const breakdown = {
    amountScore: 0,
    dateScore: 0,
    partnerScore: 0,
    ibanScore: 0,
    referenceScore: 0,
  };
  const matchSources: TransactionMatchSource[] = [];

  // 1. Amount scoring (0-40)
  if (file.extractedAmount != null) {
    const result = calculateAmountScore(file.extractedAmount, transaction.amount);
    breakdown.amountScore = result.score;
    if (result.source) matchSources.push(result.source);
  }

  // 2. Date scoring (0-25, can get +10 bonus from reference match)
  if (file.extractedDate) {
    const result = calculateDateScore(
      file.extractedDate.toDate(),
      transaction.date.toDate()
    );
    breakdown.dateScore = result.score;
    if (result.source) matchSources.push(result.source);
  }

  // 3. Partner scoring (0-20)
  if (file.partnerId && transaction.partnerId) {
    if (file.partnerId === transaction.partnerId) {
      breakdown.partnerScore = 20;
      matchSources.push("partner");
    }
  }

  // 4. IBAN scoring (0-10)
  if (file.extractedIban && transaction.partnerIban) {
    const fileIban = normalizeIban(file.extractedIban);
    const txIban = normalizeIban(transaction.partnerIban);
    if (fileIban === txIban) {
      breakdown.ibanScore = 10;
      matchSources.push("iban");
    }
  }

  // 5. Reference/Invoice ID scoring (0-5, with date bonus)
  if (file.extractedText && transaction.reference) {
    const result = calculateReferenceScore(
      file.extractedText,
      transaction.reference,
      breakdown.dateScore
    );
    breakdown.referenceScore = result.score;
    if (result.dateBonus) {
      breakdown.dateScore = Math.min(25, breakdown.dateScore + result.dateBonus);
    }
    if (result.source) matchSources.push(result.source);
  }

  const confidence =
    breakdown.amountScore +
    breakdown.dateScore +
    breakdown.partnerScore +
    breakdown.ibanScore +
    breakdown.referenceScore;

  return {
    transactionId: transaction.id,
    confidence,
    breakdown,
    matchSources,
    preview: {
      date: transaction.date,
      amount: transaction.amount,
      currency: transaction.currency,
      name: transaction.name,
      partner: transaction.partner,
    },
  };
}

// === Individual Scoring Functions ===

/**
 * Calculate amount score (0-40)
 * Exact match = 40, within 1% = 38, within 5% = 30, within 10% = 20
 */
function calculateAmountScore(
  fileAmount: number,
  txAmount: number
): { score: number; source: TransactionMatchSource | null } {
  const absFile = Math.abs(fileAmount);
  const absTx = Math.abs(txAmount);

  // Both must be non-zero
  if (absFile === 0 || absTx === 0) {
    return { score: 0, source: null };
  }

  // Exact match
  if (absFile === absTx) {
    return { score: 40, source: "amount_exact" };
  }

  const difference = Math.abs(absFile - absTx);
  const tolerance = absFile;

  // Within 1%
  if (difference <= tolerance * 0.01) {
    return { score: 38, source: "amount_close" };
  }

  // Within 5%
  if (difference <= tolerance * 0.05) {
    return { score: 30, source: "amount_close" };
  }

  // Within 10%
  if (difference <= tolerance * 0.1) {
    return { score: 20, source: "amount_close" };
  }

  return { score: 0, source: null };
}

/**
 * Calculate date score (0-25)
 * Same day = 25, ≤3 days = 22, ≤7 days = 15, ≤14 days = 8, ≤30 days = 3
 */
function calculateDateScore(
  fileDate: Date,
  txDate: Date
): { score: number; source: TransactionMatchSource | null } {
  const daysDiff = Math.abs(
    Math.floor((fileDate.getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24))
  );

  if (daysDiff === 0) return { score: 25, source: "date_exact" };
  if (daysDiff <= 3) return { score: 22, source: "date_close" };
  if (daysDiff <= 7) return { score: 15, source: "date_close" };
  if (daysDiff <= 14) return { score: 8, source: "date_close" };
  if (daysDiff <= 30) return { score: 3, source: "date_close" };

  return { score: 0, source: null };
}

/**
 * Calculate reference/invoice ID score (0-5)
 * Also returns date bonus if reference matches (bypasses date tolerance)
 */
function calculateReferenceScore(
  extractedText: string,
  reference: string,
  currentDateScore: number
): { score: number; dateBonus: number; source: TransactionMatchSource | null } {
  if (!reference || reference.length < 3) {
    return { score: 0, dateBonus: 0, source: null };
  }

  const normalizedText = extractedText.toLowerCase();
  const normalizedRef = reference.toLowerCase();

  // Check if reference appears in extracted text
  if (normalizedText.includes(normalizedRef)) {
    // Reference match gives +5 score and can add +10 to date score (bypasses date tolerance)
    const dateBonus = currentDateScore < 15 ? 10 : 0;
    return { score: 5, dateBonus, source: "reference" };
  }

  return { score: 0, dateBonus: 0, source: null };
}

// === Batch Matching ===

/**
 * Find matching transactions for a file
 * Returns scored matches sorted by confidence
 */
export function findTransactionMatches(
  file: TaxFile,
  transactions: Transaction[],
  options?: {
    minConfidence?: number;
    limit?: number;
  }
): TransactionMatchScore[] {
  const { minConfidence = TRANSACTION_MATCH_CONFIG.SUGGESTION_THRESHOLD, limit = 10 } =
    options || {};

  // Can't match without extracted data
  if (!file.extractionComplete) {
    return [];
  }

  // Filter to transactions within date range (if file has date)
  let candidates = transactions;
  if (file.extractedDate) {
    const fileDate = file.extractedDate.toDate();
    const startDate = new Date(fileDate);
    startDate.setDate(startDate.getDate() - TRANSACTION_MATCH_CONFIG.DATE_RANGE_DAYS);
    const endDate = new Date(fileDate);
    endDate.setDate(endDate.getDate() + TRANSACTION_MATCH_CONFIG.DATE_RANGE_DAYS);

    candidates = transactions.filter((tx) => {
      const txDate = tx.date.toDate();
      return txDate >= startDate && txDate <= endDate;
    });
  }

  // Score each transaction
  const matches = candidates
    .map((tx) => scoreTransactionMatch(file, tx))
    .filter((m) => m.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit);

  return matches;
}

/**
 * Convert TransactionMatchScore to TransactionSuggestion (for storage)
 */
export function toTransactionSuggestion(
  score: TransactionMatchScore
): TransactionSuggestion {
  return {
    transactionId: score.transactionId,
    confidence: score.confidence,
    matchSources: score.matchSources,
    preview: score.preview,
  };
}

// === Partner Priority Resolution ===

export type PartnerMatchedBy = "manual" | "suggestion" | "auto" | null;

/**
 * Resolve partner conflict when both file and transaction have partners
 *
 * Priority:
 * 1. Manual always wins over auto/suggestion
 * 2. If both manual: keep transaction's (user explicitly set on tx)
 * 3. If both auto: file wins (file read the actual document content)
 */
export function resolvePartnerConflict(
  filePartnerId: string | null | undefined,
  fileMatchedBy: PartnerMatchedBy,
  txPartnerId: string | null | undefined,
  txMatchedBy: PartnerMatchedBy
): { winnerId: string | null; source: "file" | "transaction" | null } {
  // Neither has partner
  if (!filePartnerId && !txPartnerId) {
    return { winnerId: null, source: null };
  }

  // Only one has partner - use that one
  if (filePartnerId && !txPartnerId) {
    return { winnerId: filePartnerId, source: "file" };
  }
  if (txPartnerId && !filePartnerId) {
    return { winnerId: txPartnerId, source: "transaction" };
  }

  // Both have partners - apply priority rules

  // Manual always wins over auto/suggestion
  const fileIsManual = fileMatchedBy === "manual";
  const txIsManual = txMatchedBy === "manual";

  if (fileIsManual && !txIsManual) {
    return { winnerId: filePartnerId!, source: "file" };
  }
  if (txIsManual && !fileIsManual) {
    return { winnerId: txPartnerId!, source: "transaction" };
  }

  // Both manual - keep transaction's (user explicitly set on tx)
  if (fileIsManual && txIsManual) {
    return { winnerId: txPartnerId!, source: "transaction" };
  }

  // Both auto/suggestion - file wins (it read the document)
  return { winnerId: filePartnerId!, source: "file" };
}

// === Helper Functions ===

/**
 * Determine if a match should be auto-applied
 */
export function shouldAutoMatchTransaction(confidence: number): boolean {
  return confidence >= TRANSACTION_MATCH_CONFIG.AUTO_MATCH_THRESHOLD;
}

/**
 * Get confidence tier for display
 */
export function getTransactionMatchConfidenceTier(
  confidence: number
): "high" | "medium" | "low" {
  if (confidence >= 85) return "high";
  if (confidence >= 70) return "medium";
  return "low";
}

/**
 * Get confidence tier color for UI
 */
export function getTransactionMatchConfidenceColor(confidence: number): string {
  if (confidence >= 85)
    return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
  if (confidence >= 70)
    return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
  return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
}

/**
 * Get source label for display
 */
export function getTransactionMatchSourceLabel(source: TransactionMatchSource): string {
  switch (source) {
    case "amount_exact":
      return "Exact Amount";
    case "amount_close":
      return "Amount Match";
    case "date_exact":
      return "Same Date";
    case "date_close":
      return "Date Match";
    case "partner":
      return "Partner Match";
    case "iban":
      return "IBAN Match";
    case "reference":
      return "Reference Match";
    default:
      return source;
  }
}

/**
 * Get icon name for match source (for UI)
 */
export function getTransactionMatchSourceIcon(
  source: TransactionMatchSource
): string {
  switch (source) {
    case "amount_exact":
    case "amount_close":
      return "euro"; // or "dollar-sign" depending on locale
    case "date_exact":
    case "date_close":
      return "calendar";
    case "partner":
      return "building";
    case "iban":
      return "credit-card";
    case "reference":
      return "hash";
    default:
      return "check";
  }
}
