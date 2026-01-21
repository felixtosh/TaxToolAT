/**
 * Transaction matching algorithm for files (Cloud Functions version)
 *
 * IMPORTANT: This should mirror lib/matching/transaction-matcher.ts from frontend
 *
 * Matches files (receipts/invoices) to transactions based on:
 * 1. Amount match (0-40 points)
 * 2. Date proximity (0-25 points)
 * 3. Partner overlap (0-20 points)
 * 4. IBAN match (0-10 points)
 * 5. Reference/Invoice ID match (0-5 points + date bonus)
 */

import { Timestamp } from "firebase-admin/firestore";

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

export type TransactionMatchSource =
  | "amount_exact"
  | "amount_close"
  | "date_exact"
  | "date_close"
  | "partner"
  | "iban"
  | "reference"
  | "filename";

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
}

// === File/Transaction interfaces for scoring ===

export interface ScoringFile {
  extractedAmount?: number | null; // In euros (not cents)
  extractedDate?: Timestamp | null;
  partnerId?: string | null;
  extractedIban?: string | null;
  extractedText?: string | null;
  fileName?: string | null; // For filename-based matching
}

export interface ScoringTransaction {
  id: string;
  amount: number; // In cents
  date: Timestamp;
  partnerId?: string | null;
  partnerIban?: string | null;
  reference?: string | null;
  name?: string | null; // For name-based matching (may contain invoice numbers)
}

// === Main Matching Function ===

/**
 * Score a transaction against a file
 * Returns a match score with breakdown
 */
export function scoreTransactionMatch(
  file: ScoringFile,
  transaction: ScoringTransaction
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
  // File amount is in euros, transaction amount is in cents
  if (file.extractedAmount != null) {
    const txAmountEuros = Math.abs(transaction.amount) / 100;
    const result = calculateAmountScore(file.extractedAmount, txAmountEuros);
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

  // 6. Filename/Transaction name matching (0-25 bonus)
  // Check if invoice-like patterns in filename match patterns in transaction name
  let filenameScore = 0;
  if (file.fileName && transaction.name) {
    const result = calculateFilenameScore(file.fileName, transaction.name);
    filenameScore = result.score;
    if (result.dateBonus) {
      // Filename match can give date bonus (like reference match)
      breakdown.dateScore = Math.min(25, breakdown.dateScore + result.dateBonus);
    }
    if (result.source) matchSources.push(result.source);
  }

  const confidence =
    breakdown.amountScore +
    breakdown.dateScore +
    breakdown.partnerScore +
    breakdown.ibanScore +
    breakdown.referenceScore +
    filenameScore;

  return {
    transactionId: transaction.id,
    confidence,
    breakdown,
    matchSources,
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

  // Exact match (within 0.01 for rounding)
  if (Math.abs(absFile - absTx) < 0.01) {
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

/**
 * Extract invoice-like patterns from a string
 * Matches patterns like: R-2024.014, INV-12345, 2024122400589, etc.
 */
function extractInvoicePatterns(text: string): string[] {
  if (!text) return [];

  const patterns: string[] = [];

  // Pattern 1: Invoice-style codes (R-2024.014, INV-12345, etc.)
  // Letters followed by dash/dots and numbers
  const invoicePattern = /[A-Za-z]{1,4}[-.]?\d{4,}[-.]?\d*/g;
  const invoiceMatches = text.match(invoicePattern) || [];
  patterns.push(...invoiceMatches);

  // Pattern 2: Long numeric sequences (likely reference numbers)
  const numericPattern = /\d{6,}/g;
  const numericMatches = text.match(numericPattern) || [];
  patterns.push(...numericMatches);

  // Normalize: lowercase, remove spaces/dashes/dots for comparison
  return [...new Set(patterns.map((p) => p.toLowerCase().replace(/[-.\s]/g, "")))];
}

/**
 * Calculate filename/transaction name match score (0-25)
 * Checks if invoice patterns in filename appear in transaction name
 */
function calculateFilenameScore(
  fileName: string,
  transactionName: string
): { score: number; dateBonus: number; source: TransactionMatchSource | null } {
  const filePatterns = extractInvoicePatterns(fileName);
  const txPatterns = extractInvoicePatterns(transactionName);

  if (filePatterns.length === 0 || txPatterns.length === 0) {
    return { score: 0, dateBonus: 0, source: null };
  }

  // Check for any matching patterns
  for (const filePattern of filePatterns) {
    // Minimum length of 4 to avoid false positives
    if (filePattern.length < 4) continue;

    for (const txPattern of txPatterns) {
      // Check if one contains the other (handles partial matches)
      if (
        filePattern.includes(txPattern) ||
        txPattern.includes(filePattern) ||
        filePattern === txPattern
      ) {
        // Strong match! Invoice number in filename matching transaction is very strong signal
        // Score 30 + dateBonus 20 to ensure it can bypass date gaps
        return { score: 30, dateBonus: 20, source: "filename" };
      }
    }
  }

  return { score: 0, dateBonus: 0, source: null };
}

/**
 * Normalize IBAN for comparison
 */
function normalizeIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}

/**
 * Determine if a match should be auto-applied
 */
export function shouldAutoMatchTransaction(confidence: number): boolean {
  return confidence >= TRANSACTION_MATCH_CONFIG.AUTO_MATCH_THRESHOLD;
}

/**
 * Log match score breakdown for debugging
 */
export function logMatchScore(
  fileId: string,
  fileName: string,
  score: TransactionMatchScore
): void {
  const { breakdown, confidence, matchSources } = score;
  console.log(
    `[PrecisionSearch] Match score for file ${fileName} (${fileId}): ` +
      `${confidence}% [amount:${breakdown.amountScore}, date:${breakdown.dateScore}, ` +
      `partner:${breakdown.partnerScore}, iban:${breakdown.ibanScore}, ref:${breakdown.referenceScore}] ` +
      `sources: ${matchSources.join(", ") || "none"}`
  );
}
