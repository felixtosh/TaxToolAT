/**
 * URL normalization utilities for partner matching
 */

/**
 * Normalize a URL for comparison
 * - Converts to lowercase
 * - Removes protocol (http://, https://)
 * - Removes www. prefix
 * - Removes trailing slashes
 * - Removes query params and hash
 */
export function normalizeUrl(url: string): string {
  if (!url) return "";

  try {
    let normalized = url.toLowerCase().trim();

    // Remove protocol
    normalized = normalized.replace(/^https?:\/\//, "");

    // Remove www.
    normalized = normalized.replace(/^www\./, "");

    // Remove trailing slash
    normalized = normalized.replace(/\/$/, "");

    // Remove query params and hash
    normalized = normalized.split("?")[0].split("#")[0];

    return normalized;
  } catch {
    return url.toLowerCase().trim();
  }
}

/**
 * Extract domain from URL (without subdomains except www which is removed)
 */
export function extractDomain(url: string): string {
  const normalized = normalizeUrl(url);
  const parts = normalized.split("/");
  return parts[0];
}

/**
 * Extract root domain (e.g., "amazon.com" from "aws.amazon.com")
 */
export function extractRootDomain(url: string): string {
  const domain = extractDomain(url);
  const parts = domain.split(".");

  // Handle cases like "co.uk", "com.au", etc.
  const twoPartTlds = ["co.uk", "com.au", "co.at", "com.br", "co.nz"];

  if (parts.length >= 3) {
    const lastTwo = parts.slice(-2).join(".");
    if (twoPartTlds.includes(lastTwo)) {
      return parts.slice(-3).join(".");
    }
  }

  // Return last two parts (domain + TLD)
  if (parts.length >= 2) {
    return parts.slice(-2).join(".");
  }

  return domain;
}

/**
 * Check if two URLs match (same domain)
 */
export function urlsMatch(url1: string, url2: string): boolean {
  return extractDomain(url1) === extractDomain(url2);
}

/**
 * Check if two URLs match at the root domain level
 */
export function rootDomainsMatch(url1: string, url2: string): boolean {
  return extractRootDomain(url1) === extractRootDomain(url2);
}

/**
 * Validate URL format (basic check)
 */
export function isValidUrl(url: string): boolean {
  if (!url) return false;

  const normalized = normalizeUrl(url);

  // Must have at least a domain with TLD
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+/.test(normalized)) {
    return false;
  }

  return true;
}
