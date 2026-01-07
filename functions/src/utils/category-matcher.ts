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
  /** Base confidence for partner-only match */
  PARTNER_MATCH_CONFIDENCE: 85,
  /** Bonus confidence when both partner and pattern match */
  COMBINED_MATCH_BONUS: 15,
  /** Maximum suggestions to return */
  MAX_SUGGESTIONS: 3,
};

// ============ Matching Logic ============

/**
 * Match a transaction against all categories.
 * Returns suggestions sorted by confidence (highest first).
 *
 * @param transaction - The transaction to match
 * @param categories - All user categories to match against
 * @param categoryManualRemovals - Map of categoryId -> Set of transactionIds that were manually removed
 */
export function matchTransactionToCategories(
  transaction: TransactionData,
  categories: CategoryData[],
  categoryManualRemovals?: Map<string, Set<string>>
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

    const suggestion = matchSingleCategory(transaction, category);
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
 * Match a transaction against a single category.
 * Returns null if no match found above threshold.
 */
function matchSingleCategory(
  transaction: TransactionData,
  category: CategoryData
): CategorySuggestion | null {
  let confidence = 0;
  let source: CategorySuggestion["source"] | null = null;

  // 1. Check if transaction's partner is in category's matched partners
  const partnerMatch =
    transaction.partnerId &&
    category.matchedPartnerIds.includes(transaction.partnerId);

  // 2. Check pattern matches
  const patternMatch = matchCategoryPatterns(transaction, category);

  // Determine confidence and source
  if (partnerMatch && patternMatch) {
    // Both match - highest confidence
    confidence = Math.min(
      100,
      patternMatch.confidence + CATEGORY_MATCH_CONFIG.COMBINED_MATCH_BONUS
    );
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
