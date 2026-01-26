"use strict";
/**
 * Pattern Matching Utilities
 *
 * Single source of truth for glob pattern matching logic.
 * Used by pattern learning, partner matching, and transaction matching.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeUmlauts = normalizeUmlauts;
exports.globMatch = globMatch;
exports.matchPatternFlexible = matchPatternFlexible;
/**
 * Normalize German umlauts and special characters for matching.
 * Banks often transliterate: ä→ae, ö→oe, ü→ue, ß→ss
 */
function normalizeUmlauts(text) {
    return text
        .toLowerCase()
        .replace(/ä/g, "ae")
        .replace(/ö/g, "oe")
        .replace(/ü/g, "ue")
        .replace(/ß/g, "ss");
}
/**
 * Match a glob-style pattern against text.
 * Supports * as wildcard (matches any characters).
 * Normalizes German umlauts so "häusler" matches "haeusler".
 *
 * @param pattern - Glob pattern (e.g., "amazon*", "*paypal*")
 * @param text - Text to match against
 * @returns true if pattern matches the entire text
 */
function globMatch(pattern, text) {
    if (!pattern || !text)
        return false;
    // Normalize both for umlaut-insensitive matching
    const normalizedText = normalizeUmlauts(text);
    const normalizedPattern = normalizeUmlauts(pattern);
    // Convert glob to regex: escape special chars, then replace * with .*
    const regexPattern = normalizedPattern
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&") // Escape regex special chars
        .replace(/\*/g, ".*"); // * -> .*
    try {
        return new RegExp(`^${regexPattern}$`).test(normalizedText);
    }
    catch {
        return false;
    }
}
/**
 * Try to match a pattern against transaction text using multiple strategies:
 * 1. Individual fields (name, partner, reference)
 * 2. Combined text in different orderings
 *
 * This handles cases where the relevant text might be in any field,
 * and patterns were learned from a specific field ordering.
 *
 * @param pattern - Glob pattern to match
 * @param txName - Transaction name field
 * @param txPartner - Transaction partner field
 * @param txReference - Transaction reference field (optional)
 * @returns true if pattern matches any field combination
 */
function matchPatternFlexible(pattern, txName, txPartner, txReference) {
    // Build all possible text combinations to try
    const textsToTry = [];
    // Individual fields (most specific)
    if (txName)
        textsToTry.push(txName.toLowerCase());
    if (txPartner)
        textsToTry.push(txPartner.toLowerCase());
    if (txReference)
        textsToTry.push(txReference.toLowerCase());
    // Combined: name + partner (common order)
    const namePartner = [txName, txPartner].filter(Boolean).join(" ").toLowerCase();
    if (namePartner)
        textsToTry.push(namePartner);
    // Combined: partner + name (reverse order - handles cases where fields are swapped)
    const partnerName = [txPartner, txName].filter(Boolean).join(" ").toLowerCase();
    if (partnerName && partnerName !== namePartner)
        textsToTry.push(partnerName);
    // Combined: all fields in standard order
    const allFields = [txName, txPartner, txReference].filter(Boolean).join(" ").toLowerCase();
    if (allFields && allFields !== namePartner && allFields !== partnerName) {
        textsToTry.push(allFields);
    }
    // Combined: all fields with partner first
    const partnerFirst = [txPartner, txName, txReference].filter(Boolean).join(" ").toLowerCase();
    if (partnerFirst && !textsToTry.includes(partnerFirst)) {
        textsToTry.push(partnerFirst);
    }
    // Try matching against each text variant
    for (const text of textsToTry) {
        if (globMatch(pattern, text)) {
            return true;
        }
    }
    return false;
}
//# sourceMappingURL=pattern-utils.js.map