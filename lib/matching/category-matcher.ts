/**
 * No-Receipt Category matching algorithm
 *
 * Matches transactions to categories based on:
 * 1. Partner match (85% confidence) - transaction's partner is in category's matchedPartnerIds
 * 2. Pattern match (variable confidence) - glob patterns learned from previous assignments
 * 3. Partner + Pattern (up to 100%) - combined match gets boosted confidence
 */

import {
  UserNoReceiptCategory,
  CategorySuggestion,
  NoReceiptCategoryId,
} from "@/types/no-receipt-category";
import { Transaction } from "@/types/transaction";
import { globMatch } from "./partner-matcher";

// Thresholds for category matching
export const CATEGORY_MATCH_CONFIG = {
  /** Minimum confidence to show as suggestion */
  SUGGESTION_THRESHOLD: 60,
  /** Minimum confidence for auto-assignment */
  AUTO_APPLY_THRESHOLD: 89,
  /** Base confidence for partner-only match (at threshold to auto-apply) */
  PARTNER_MATCH_CONFIDENCE: 89,
  /** Bonus confidence when both partner and pattern match */
  COMBINED_MATCH_BONUS: 15,
  /** Maximum suggestions to return */
  MAX_SUGGESTIONS: 3,
  /** Maximum usage-based confidence boost (applied logarithmically) */
  USAGE_BOOST_MAX: 10,
  /** Boost when partner has no file source patterns (likely no-receipt partner) */
  NO_FILE_PATTERNS_BOOST: 8,
};

/**
 * Options for category matching with context about partners
 */
export interface CategoryMatchOptions {
  /**
   * Map of partnerId -> number of file source patterns.
   * Partners with 0 or no entry are boosted (likely no-receipt partners).
   */
  partnerFilePatternCounts?: Map<string, number>;
}

/**
 * Match a transaction against all user categories.
 * Returns suggestions sorted by confidence (highest first).
 *
 * @param transaction - The transaction to match
 * @param categories - All user categories to match against
 * @param options - Optional context for improved matching
 */
export function matchTransactionToCategories(
  transaction: Transaction,
  categories: UserNoReceiptCategory[],
  options?: CategoryMatchOptions
): CategorySuggestion[] {
  const suggestions: CategorySuggestion[] = [];

  for (const category of categories) {
    // Skip receipt-lost - it requires explicit user action
    if (category.templateId === "receipt-lost") {
      continue;
    }

    const suggestion = matchSingleCategory(transaction, category, options);
    if (suggestion) {
      suggestions.push(suggestion);
    }
  }

  // Sort by confidence (highest first)
  suggestions.sort((a, b) => b.confidence - a.confidence);

  // Return top suggestions
  return suggestions.slice(0, CATEGORY_MATCH_CONFIG.MAX_SUGGESTIONS);
}

/**
 * Calculate usage-based confidence boost.
 * Uses logarithmic scaling so early uses have bigger impact than later uses.
 * E.g., going from 0->10 transactions gives ~6 points, 10->100 gives ~3 more.
 */
function calculateUsageBoost(transactionCount: number): number {
  if (transactionCount <= 0) return 0;
  // Log10 scale: 10 txns = 5 points, 100 txns = 8 points, 1000 txns = 10 points (capped)
  const boost = Math.log10(transactionCount + 1) * 5;
  return Math.min(boost, CATEGORY_MATCH_CONFIG.USAGE_BOOST_MAX);
}

/**
 * Check if partner has file source patterns.
 * Partners without file patterns are more likely to be no-receipt partners.
 */
function partnerHasNoFilePatterns(
  partnerId: string | null | undefined,
  partnerFilePatternCounts?: Map<string, number>
): boolean {
  if (!partnerId || !partnerFilePatternCounts) return false;
  const count = partnerFilePatternCounts.get(partnerId);
  // Partner found in map with 0 patterns = definitely no file patterns
  // Partner not in map = we don't know, assume has patterns (no boost)
  return count !== undefined && count === 0;
}

/**
 * Match a transaction against a single category.
 * Returns null if no match found above threshold.
 *
 * Confidence boosting:
 * 1. Base confidence from match type (partner: 85%, pattern: variable, combined: +15)
 * 2. Usage boost: +0-10 based on category's transactionCount (logarithmic)
 * 3. No-file-patterns boost: +8 if partner has no file source patterns
 */
function matchSingleCategory(
  transaction: Transaction,
  category: UserNoReceiptCategory,
  options?: CategoryMatchOptions
): CategorySuggestion | null {
  let confidence = 0;
  let source: CategorySuggestion["source"] | null = null;

  // 1. Check if transaction's partner is in category's matched partners
  const partnerMatch =
    transaction.partnerId &&
    category.matchedPartnerIds.includes(transaction.partnerId);

  // 2. Check pattern matches
  const patternMatch = matchCategoryPatterns(transaction, category);

  // Determine base confidence and source
  if (partnerMatch && patternMatch) {
    // Both match - highest confidence
    confidence =
      patternMatch.confidence + CATEGORY_MATCH_CONFIG.COMBINED_MATCH_BONUS;
    source = "partner+pattern";
  } else if (partnerMatch) {
    // Partner-only match
    confidence = CATEGORY_MATCH_CONFIG.PARTNER_MATCH_CONFIDENCE;
    source = "partner";
  } else if (patternMatch) {
    // Pattern-only match
    confidence = patternMatch.confidence;
    source = "pattern";
  }

  // Apply boosts if we have a base match
  if (confidence > 0 && source) {
    // Usage boost: categories used more often rank higher
    const usageBoost = calculateUsageBoost(category.transactionCount);
    confidence += usageBoost;

    // No-file-patterns boost: if partner doesn't typically have files, boost category match
    // Only applies when we have a partner match (partner is known to belong to this category)
    if (
      partnerMatch &&
      partnerHasNoFilePatterns(
        transaction.partnerId,
        options?.partnerFilePatternCounts
      )
    ) {
      confidence += CATEGORY_MATCH_CONFIG.NO_FILE_PATTERNS_BOOST;
    }

    // Cap at 100
    confidence = Math.min(100, confidence);
  }

  // Return suggestion if above threshold
  if (confidence >= CATEGORY_MATCH_CONFIG.SUGGESTION_THRESHOLD && source) {
    return {
      categoryId: category.id,
      templateId: category.templateId,
      confidence,
      source,
    };
  }

  return null;
}

/**
 * Match transaction text against category's learned patterns.
 * Returns the highest-confidence matching pattern, or null if none match.
 */
function matchCategoryPatterns(
  transaction: Transaction,
  category: UserNoReceiptCategory
): { confidence: number } | null {
  if (category.learnedPatterns.length === 0) {
    return null;
  }

  // Build text to match against
  const textToMatch = buildTransactionText(transaction);

  let bestMatch: { confidence: number } | null = null;

  for (const pattern of category.learnedPatterns) {
    if (globMatch(pattern.pattern, textToMatch)) {
      if (!bestMatch || pattern.confidence > bestMatch.confidence) {
        bestMatch = { confidence: pattern.confidence };
      }
    }
  }

  return bestMatch;
}

/**
 * Build searchable text from transaction fields.
 */
function buildTransactionText(transaction: Transaction): string {
  return [transaction.partner, transaction.name, transaction.reference]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * Check if a category suggestion should be auto-applied.
 */
export function shouldAutoApplyCategory(confidence: number): boolean {
  return confidence >= CATEGORY_MATCH_CONFIG.AUTO_APPLY_THRESHOLD;
}

/**
 * Find the best category match for a transaction.
 * Returns the top match if it's above auto-apply threshold.
 */
export function findBestCategoryMatch(
  transaction: Transaction,
  categories: UserNoReceiptCategory[],
  options?: CategoryMatchOptions
): CategorySuggestion | null {
  const suggestions = matchTransactionToCategories(
    transaction,
    categories,
    options
  );

  if (suggestions.length === 0) {
    return null;
  }

  const best = suggestions[0];

  // Only return if above auto-apply threshold
  if (shouldAutoApplyCategory(best.confidence)) {
    return best;
  }

  return null;
}

/**
 * Get category suggestions for display in UI.
 * Returns all matches above suggestion threshold, sorted by confidence.
 */
export function getCategorySuggestions(
  transaction: Transaction,
  categories: UserNoReceiptCategory[],
  options?: CategoryMatchOptions
): CategorySuggestion[] {
  return matchTransactionToCategories(transaction, categories, options);
}

/**
 * Check if a transaction is a good candidate for any no-receipt category.
 * Used for filtering transactions in batch operations.
 */
export function isNoReceiptCandidate(transaction: Transaction): boolean {
  // Already has category
  if (transaction.noReceiptCategoryId) {
    return false;
  }

  // Already has file(s) attached
  if (transaction.fileIds && transaction.fileIds.length > 0) {
    return false;
  }

  // Check for common no-receipt indicators
  const text = buildTransactionText(transaction);

  const noReceiptIndicators = [
    // Bank fees
    /kontoführung/i,
    /gebühr/i,
    /entgelt/i,
    /provision/i,
    // Interest
    /zins/i,
    /interest/i,
    // Transfers
    /übertrag/i,
    /umbuchung/i,
    /transfer/i,
    // Payment providers
    /stripe/i,
    /paypal/i,
    /adyen/i,
    /mollie/i,
    // Taxes
    /finanzamt/i,
    /steuern/i,
    /umsatzsteuer/i,
    /sozialversicherung/i,
    // Payroll
    /gehalt/i,
    /lohn/i,
    /salary/i,
  ];

  return noReceiptIndicators.some((pattern) => pattern.test(text));
}

/**
 * Suggest a category template based on transaction text patterns.
 * Used for initial suggestions when no learned patterns exist yet.
 */
export function suggestCategoryByText(
  transaction: Transaction
): NoReceiptCategoryId | null {
  const text = buildTransactionText(transaction);

  // Bank fees patterns
  if (
    /kontoführung|buchungsposten|karten.?gebühr|jahresgebühr|guthabenzins|negativzins|dispozins/i.test(
      text
    )
  ) {
    return "bank-fees";
  }

  // Interest patterns
  if (/zinsen|interest|overdraft|kredit.?zins/i.test(text)) {
    return "interest";
  }

  // Internal transfer patterns
  if (
    /übertrag|umbuchung|internal|eigen.?konto|sammelüberweisung/i.test(text)
  ) {
    return "internal-transfers";
  }

  // Payment provider patterns
  if (/stripe.*payout|paypal.*auszahl|settlement|adyen.*payout/i.test(text)) {
    return "payment-provider-settlements";
  }

  // Tax patterns
  if (/finanzamt|umsatzsteuer|körperschaftsteuer|lohnsteuer|sozialversicherung/i.test(text)) {
    return "taxes-government";
  }

  // Payroll patterns
  if (/gehalt|lohn.?zahlung|salary|net.*pay|arbeitgeber.*anteil/i.test(text)) {
    return "payroll";
  }

  // Zero-value transactions
  if (transaction.amount === 0) {
    return "zero-value";
  }

  return null;
}
