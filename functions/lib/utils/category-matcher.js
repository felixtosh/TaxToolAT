"use strict";
/**
 * Server-side no-receipt category matching utilities
 * Mirrors the client-side matching logic for Cloud Functions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CATEGORY_MATCH_CONFIG = void 0;
exports.matchTransactionToCategories = matchTransactionToCategories;
exports.shouldAutoApplyCategory = shouldAutoApplyCategory;
exports.isEligibleForCategoryMatching = isEligibleForCategoryMatching;
const partner_matcher_1 = require("./partner-matcher");
// ============ Thresholds ============
exports.CATEGORY_MATCH_CONFIG = {
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
function matchTransactionToCategories(transaction, categories, categoryManualRemovals) {
    const suggestions = [];
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
    return suggestions.slice(0, exports.CATEGORY_MATCH_CONFIG.MAX_SUGGESTIONS);
}
/**
 * Match a transaction against a single category.
 * Returns null if no match found above threshold.
 */
function matchSingleCategory(transaction, category) {
    let confidence = 0;
    let source = null;
    // 1. Check if transaction's partner is in category's matched partners
    const partnerMatch = transaction.partnerId &&
        category.matchedPartnerIds.includes(transaction.partnerId);
    // 2. Check pattern matches
    const patternMatch = matchCategoryPatterns(transaction, category);
    // Determine confidence and source
    if (partnerMatch && patternMatch) {
        // Both match - highest confidence
        confidence = Math.min(100, patternMatch.confidence + exports.CATEGORY_MATCH_CONFIG.COMBINED_MATCH_BONUS);
        source = "partner+pattern";
    }
    else if (partnerMatch) {
        // Partner-only match
        confidence = exports.CATEGORY_MATCH_CONFIG.PARTNER_MATCH_CONFIDENCE;
        source = "partner";
    }
    else if (patternMatch) {
        // Pattern-only match
        confidence = patternMatch.confidence;
        source = "pattern";
    }
    // Return suggestion if above threshold
    if (confidence >= exports.CATEGORY_MATCH_CONFIG.SUGGESTION_THRESHOLD && source) {
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
function matchCategoryPatterns(transaction, category) {
    if (!category.learnedPatterns || category.learnedPatterns.length === 0) {
        return null;
    }
    // Build text to match against
    const textToMatch = buildTransactionText(transaction);
    let bestMatch = null;
    for (const pattern of category.learnedPatterns) {
        if ((0, partner_matcher_1.globMatch)(pattern.pattern, textToMatch)) {
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
function buildTransactionText(transaction) {
    return [transaction.partner, transaction.name, transaction.reference]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
}
/**
 * Check if a category suggestion should be auto-applied.
 */
function shouldAutoApplyCategory(confidence) {
    return confidence >= exports.CATEGORY_MATCH_CONFIG.AUTO_APPLY_THRESHOLD;
}
/**
 * Check if a transaction is eligible for category matching.
 * Skip if already has category or has files attached.
 */
function isEligibleForCategoryMatching(transaction) {
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
//# sourceMappingURL=category-matcher.js.map