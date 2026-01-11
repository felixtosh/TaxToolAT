/**
 * Company Name Validator
 *
 * Validates if a company name contains a legal entity suffix,
 * indicating it's likely a real registered business.
 */

// Legal entity suffixes by region
const LEGAL_SUFFIXES = [
  // DACH (Germany, Austria, Switzerland)
  /\b(gmbh|g\.m\.b\.h\.?|ges\.?m\.?b\.?h\.?|ag|kg|ohg|og|e\.?u\.?|kgaa|gmbh\s*&\s*co\.?\s*kg)$/i,
  // English-speaking
  /\b(ltd\.?|limited|inc\.?|incorporated|corp\.?|corporation|llc|l\.l\.c\.?|llp|l\.l\.p\.?|plc|p\.l\.c\.?)$/i,
  // French
  /\b(s\.?a\.?|s\.?a\.?r\.?l\.?|sarl|sas|s\.?a\.?s\.?|eurl|s\.?c\.?i\.?)$/i,
  // Italian
  /\b(s\.?r\.?l\.?|srl|s\.?p\.?a\.?|spa|s\.?n\.?c\.?)$/i,
  // Spanish
  /\b(s\.?l\.?|sl|s\.?a\.?)$/i,
  // Dutch/Belgian
  /\b(b\.?v\.?|bv|n\.?v\.?|nv|vof|cvba)$/i,
  // Polish
  /\b(sp\.?\s*z\.?\s*o\.?\s*o\.?|s\.?a\.?)$/i,
  // Czech/Slovak
  /\b(s\.?r\.?o\.?|a\.?s\.?)$/i,
  // Nordic
  /\b(ab|a\/s|as|aps|oy|oyj)$/i,
];

/**
 * Check if a company name contains a legal entity suffix.
 * This indicates the name is likely a registered business.
 *
 * @param name - The company name to validate
 * @returns true if the name contains a recognized legal suffix
 */
export function isValidCompanyName(name: string | null | undefined): boolean {
  if (!name || typeof name !== "string") return false;

  const trimmed = name.trim();
  if (trimmed.length < 3) return false;

  // Check against all known legal suffixes
  return LEGAL_SUFFIXES.some((regex) => regex.test(trimmed));
}

/**
 * Extract the legal suffix from a company name if present.
 *
 * @param name - The company name
 * @returns The matched suffix or null
 */
export function extractLegalSuffix(name: string): string | null {
  if (!name || typeof name !== "string") return null;

  const trimmed = name.trim();

  for (const regex of LEGAL_SUFFIXES) {
    const match = trimmed.match(regex);
    if (match) {
      return match[0];
    }
  }

  return null;
}

/**
 * Normalize a company name for comparison.
 * Removes common suffixes and extra whitespace.
 *
 * @param name - The company name to normalize
 * @returns Normalized name
 */
export function normalizeCompanyName(name: string): string {
  if (!name || typeof name !== "string") return "";

  let normalized = name.trim();

  // Remove legal suffixes for comparison
  for (const regex of LEGAL_SUFFIXES) {
    normalized = normalized.replace(regex, "").trim();
  }

  // Normalize whitespace
  normalized = normalized.replace(/\s+/g, " ");

  return normalized;
}
