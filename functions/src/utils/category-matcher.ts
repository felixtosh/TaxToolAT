/**
 * Server-side no-receipt category matching utilities
 * Mirrors the client-side matching logic for Cloud Functions
 */

import { globMatch } from "./partner-matcher";

// ============ Types ============

export type NoReceiptCategoryId =
  | "bank-fees"
  | "interest"
  | "internal-transfers"
  | "payment-provider-settlements"
  | "taxes-government"
  | "payroll"
  | "private-personal"
  | "zero-value"
  | "receipt-lost";

export interface CategoryLearnedPattern {
  pattern: string;
  confidence: number;
}

export interface CategoryManualRemoval {
  transactionId: string;
}

export interface CategoryData {
  id: string;
  userId: string;
  templateId: NoReceiptCategoryId;
  name: string;
  matchedPartnerIds: string[];
  learnedPatterns: CategoryLearnedPattern[];
  manualRemovals: CategoryManualRemoval[];
  /** Number of transactions assigned to this category */
  transactionCount: number;
  isActive: boolean;
}

export interface TransactionData {
  id: string;
  partner: string | null;
  partnerId: string | null;
  name: string;
  reference: string | null;
  /** Already has a no-receipt category */
  noReceiptCategoryId: string | null;
  /** Has files attached */
  fileIds: string[];
}

export interface CategorySuggestion {
  categoryId: string;
  templateId: NoReceiptCategoryId;
  confidence: number;
  source: "partner" | "pattern" | "partner+pattern";
}

// ============ Thresholds ============

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

// ============ Matching Logic ============

/**
 * Match a transaction against all categories.
 * Returns suggestions sorted by confidence (highest first).
 *
 * @param transaction - The transaction to match
 * @param categories - All user categories to match against
 * @param categoryManualRemovals - Map of categoryId -> Set of transactionIds that were manually removed
 * @param options - Optional context for improved matching (partner file patterns)
 */
export function matchTransactionToCategories(
  transaction: TransactionData,
  categories: CategoryData[],
  categoryManualRemovals?: Map<string, Set<string>>,
  options?: CategoryMatchOptions
): CategorySuggestion[] {
  const suggestions: CategorySuggestion[] = [];

  for (const category of categories) {
    // Skip receipt-lost - it requires explicit user action
    if (category.templateId === "receipt-lost") {
      continue;
    }

    // Skip inactive categories
    if (!category.isActive) {
      continue;
    }

    // Skip if transaction was manually removed from this category
    if (categoryManualRemovals) {
      const removals = categoryManualRemovals.get(category.id);
      if (removals && removals.has(transaction.id)) {
        continue;
      }
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
  if (!transactionCount || transactionCount <= 0) return 0;
  // Log10 scale: 10 txns = 5 points, 100 txns = 8 points, 1000 txns = 10 points (capped)
  const boost = Math.log10(transactionCount + 1) * 5;
  return Math.min(boost, CATEGORY_MATCH_CONFIG.USAGE_BOOST_MAX);
}

/**
 * Check if partner has file source patterns.
 * Partners without file patterns are more likely to be no-receipt partners.
 */
function partnerHasNoFilePatterns(
  partnerId: string | null,
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
  transaction: TransactionData,
  category: CategoryData,
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
  transaction: TransactionData,
  category: CategoryData
): { confidence: number } | null {
  if (!category.learnedPatterns || category.learnedPatterns.length === 0) {
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
function buildTransactionText(transaction: TransactionData): string {
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
 * Check if a transaction is eligible for category matching.
 * Skip if already has category or has files attached.
 */
export function isEligibleForCategoryMatching(
  transaction: TransactionData
): boolean {
  // Already has a category
  if (transaction.noReceiptCategoryId) {
    return false;
  }

  // Has files attached
  if (transaction.fileIds && transaction.fileIds.length > 0) {
    return false;
  }

  return true;
}
