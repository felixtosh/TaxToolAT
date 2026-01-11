/**
 * File Partner Matcher
 *
 * Server-side logic for matching files to partners based on extracted data.
 * Port of client-side useFilePartnerSuggestions hook logic.
 */

// === Types ===

export interface FileData {
  extractedIban?: string | null;
  extractedVatId?: string | null;
  extractedPartner?: string | null;
  extractedWebsite?: string | null; // Vendor website domain from invoice
  gmailSenderDomain?: string | null; // For email domain matching
}

export interface PartnerData {
  id: string;
  name: string;
  aliases?: string[];
  ibans?: string[];
  vatId?: string | null;
  website?: string | null; // Domain format (e.g., "amazon.de")
  emailDomains?: string[]; // Learned email sender domains
  globalPartnerId?: string | null; // For user partners linked to global
}

export interface FilePartnerMatch {
  partnerId: string;
  partnerType: "user" | "global";
  partnerName: string;
  confidence: number;
  source: "iban" | "vatId" | "name" | "emailDomain" | "website";
}

// === Utility Functions ===

/**
 * Extract root domain from a URL or domain string
 * e.g., "https://www.amazon.de/path" -> "amazon.de"
 * e.g., "www.amazon.de" -> "amazon.de"
 * e.g., "amazon.de" -> "amazon.de"
 */
function extractRootDomain(input: string): string {
  if (!input) return "";

  let domain = input.toLowerCase().trim();

  // Remove protocol
  domain = domain.replace(/^https?:\/\//, "");

  // Remove path and query
  domain = domain.split("/")[0].split("?")[0];

  // Remove www prefix
  domain = domain.replace(/^www\./, "");

  return domain;
}

/**
 * Check if two domains match (handles subdomains)
 * e.g., "mail.amazon.de" matches "amazon.de"
 */
function domainsMatch(domain1: string, domain2: string): boolean {
  if (!domain1 || !domain2) return false;

  const d1 = extractRootDomain(domain1);
  const d2 = extractRootDomain(domain2);

  if (d1 === d2) return true;

  // Check if one is a subdomain of the other
  // e.g., "rechnung.amazon.de" should match "amazon.de"
  return d1.endsWith(`.${d2}`) || d2.endsWith(`.${d1}`);
}

/**
 * Normalize IBAN for comparison (remove spaces, uppercase)
 */
function normalizeIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}

/**
 * Check if two VAT IDs match (normalized)
 */
function vatIdsMatch(vat1: string, vat2: string): boolean {
  if (!vat1 || !vat2) return false;
  const normalize = (vat: string) => vat.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalize(vat1) === normalize(vat2);
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity score between two strings (0-100)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 100;
  if (s1.length === 0 || s2.length === 0) return 0;

  const maxLen = Math.max(s1.length, s2.length);
  const distance = levenshteinDistance(s1, s2);
  const similarity = ((maxLen - distance) / maxLen) * 100;

  return Math.round(similarity);
}

/**
 * Common company suffixes to remove for matching
 */
const COMPANY_SUFFIXES = [
  // German/Austrian
  /\s*gmbh\s*$/i,
  /\s*g\.m\.b\.h\.\s*$/i,
  /\s*ges\.?m\.?b\.?h\.?\s*$/i,
  /\s*ag\s*$/i,
  /\s*kg\s*$/i,
  /\s*ohg\s*$/i,
  /\s*og\s*$/i,
  /\s*e\.?u\.?\s*$/i,
  /\s*&\s*co\.?\s*(kg|ohg)?\s*$/i,
  // English
  /\s*ltd\.?\s*$/i,
  /\s*limited\s*$/i,
  /\s*inc\.?\s*$/i,
  /\s*corp\.?\s*$/i,
  /\s*llc\s*$/i,
  /\s*llp\s*$/i,
  /\s*plc\s*$/i,
  // French
  /\s*s\.?a\.?r\.?l\.?\s*$/i,
  /\s*sarl\s*$/i,
  /\s*sas\s*$/i,
  // Italian
  /\s*s\.?r\.?l\.?\s*$/i,
  /\s*srl\s*$/i,
  /\s*s\.?p\.?a\.?\s*$/i,
  /\s*spa\s*$/i,
  // Dutch
  /\s*b\.?v\.?\s*$/i,
  /\s*bv\s*$/i,
  /\s*n\.?v\.?\s*$/i,
  /\s*nv\s*$/i,
];

/**
 * Normalize company name for matching
 */
function normalizeCompanyName(name: string): string {
  if (!name) return "";

  let normalized = name.toLowerCase().trim();

  for (const suffix of COMPANY_SUFFIXES) {
    normalized = normalized.replace(suffix, "");
  }

  // Remove punctuation except alphanumeric and spaces
  normalized = normalized.replace(/[^a-z0-9äöüß\s]/g, " ");

  // Handle German umlauts
  normalized = normalized
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");

  // Collapse multiple spaces
  normalized = normalized.replace(/\s+/g, " ").trim();

  return normalized;
}

/**
 * Calculate company name similarity (using normalized names)
 */
function calculateCompanyNameSimilarity(name1: string, name2: string): number {
  const normalized1 = normalizeCompanyName(name1);
  const normalized2 = normalizeCompanyName(name2);

  if (normalized1 === normalized2) return 100;

  // Check if one contains the other
  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
    const shorter = normalized1.length < normalized2.length ? normalized1 : normalized2;
    const longer = normalized1.length >= normalized2.length ? normalized1 : normalized2;
    const coverage = shorter.length / longer.length;
    return Math.round(75 + coverage * 25);
  }

  return calculateSimilarity(normalized1, normalized2);
}

/**
 * Check if a glob pattern matches a string
 * Supports * as wildcard for any characters
 * e.g., "*amazon*" matches "Amazon Europe Core"
 */
function globMatches(pattern: string, text: string): boolean {
  if (!pattern || !text) return false;

  const normalizedPattern = pattern.toLowerCase().trim();
  const normalizedText = text.toLowerCase().trim();

  // Convert glob pattern to regex
  // Escape special regex chars except *, then convert * to .*
  const regexPattern = normalizedPattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&") // Escape special chars
    .replace(/\*/g, ".*"); // Convert * to .*

  try {
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(normalizedText);
  } catch {
    return false;
  }
}

// === Main Matching Functions ===

/**
 * Match a file's extracted data against a single partner
 *
 * @param file - File data with extracted fields
 * @param partner - Partner to match against
 * @param partnerType - Whether this is a user or global partner
 * @returns Match result or null if no match
 */
export function matchFileToPartner(
  file: FileData,
  partner: PartnerData,
  partnerType: "user" | "global"
): FilePartnerMatch | null {
  let bestMatch: FilePartnerMatch | null = null;

  // 1. IBAN match (100% confidence) - Highest priority
  if (file.extractedIban && partner.ibans && partner.ibans.length > 0) {
    const fileIban = normalizeIban(file.extractedIban);
    for (const iban of partner.ibans) {
      if (normalizeIban(iban) === fileIban) {
        return {
          partnerId: partner.id,
          partnerType,
          partnerName: partner.name,
          confidence: 100,
          source: "iban",
        };
      }
    }
  }

  // 2. VAT ID match (95% confidence)
  if (file.extractedVatId && partner.vatId) {
    if (vatIdsMatch(file.extractedVatId, partner.vatId)) {
      return {
        partnerId: partner.id,
        partnerType,
        partnerName: partner.name,
        confidence: 95,
        source: "vatId",
      };
    }
  }

  // 3. Email domain match (90% confidence) - from learned Gmail sender domains
  if (file.gmailSenderDomain && partner.emailDomains && partner.emailDomains.length > 0) {
    for (const domain of partner.emailDomains) {
      if (domainsMatch(file.gmailSenderDomain, domain)) {
        return {
          partnerId: partner.id,
          partnerType,
          partnerName: partner.name,
          confidence: 90,
          source: "emailDomain",
        };
      }
    }
  }

  // 4. Website domain match (90% confidence) - Gmail sender domain matches partner website
  if (file.gmailSenderDomain && partner.website) {
    if (domainsMatch(file.gmailSenderDomain, partner.website)) {
      return {
        partnerId: partner.id,
        partnerType,
        partnerName: partner.name,
        confidence: 90,
        source: "website",
      };
    }
  }

  // 5. Extracted website domain match - from invoice content
  // Website alone is not enough (holdings can share domains)
  // Website + name match = high confidence, website alone = suggestion only
  if (file.extractedWebsite && partner.website) {
    if (domainsMatch(file.extractedWebsite, partner.website)) {
      // Check name similarity to determine confidence
      let nameSimilarity = 0;
      if (file.extractedPartner) {
        const namesToCheck = [partner.name, ...(partner.aliases || []).filter((a) => !a.includes("*"))];
        for (const name of namesToCheck) {
          const similarity = calculateCompanyNameSimilarity(file.extractedPartner, name);
          nameSimilarity = Math.max(nameSimilarity, similarity);
        }
      }

      // Website + reasonable name match (>= 50%) = 92% (auto-assign)
      // Website alone or weak name match = 75% (suggestion only)
      const confidence = nameSimilarity >= 50 ? 92 : 75;

      return {
        partnerId: partner.id,
        partnerType,
        partnerName: partner.name,
        confidence,
        source: "website",
      };
    }
  }

  // 6. Glob pattern matching (90% confidence)
  // Check if extracted partner name matches any glob patterns (e.g., "*amazon*")
  if (file.extractedPartner && partner.aliases?.length) {
    const globPatterns = partner.aliases.filter((a) => a.includes("*"));
    for (const pattern of globPatterns) {
      if (globMatches(pattern, file.extractedPartner)) {
        return {
          partnerId: partner.id,
          partnerType,
          partnerName: partner.name,
          confidence: 90,
          source: "name",
        };
      }
    }
  }

  // 7. Name matching (60-90% confidence)
  if (file.extractedPartner) {
    // Filter out glob patterns (contain *) from aliases for similarity matching
    const namesToCheck = [partner.name, ...(partner.aliases || []).filter((a) => !a.includes("*"))];

    for (const name of namesToCheck) {
      const similarity = calculateCompanyNameSimilarity(file.extractedPartner, name);

      if (similarity >= 60) {
        // Scale 60-100 similarity to 60-90 confidence
        const confidence = Math.min(90, 60 + ((similarity - 60) * 30) / 40);
        const match: FilePartnerMatch = {
          partnerId: partner.id,
          partnerType,
          partnerName: partner.name,
          confidence: Math.round(confidence),
          source: "name",
        };
        if (!bestMatch || match.confidence > bestMatch.confidence) {
          bestMatch = match;
        }
      }
    }
  }

  return bestMatch;
}

/**
 * Match a file against all available partners
 *
 * @param file - File data with extracted fields
 * @param userPartners - User's personal partners
 * @param globalPartners - Global shared partners
 * @returns Array of matches sorted by confidence (highest first), user partners win ties
 */
export function matchFileToAllPartners(
  file: FileData,
  userPartners: PartnerData[],
  globalPartners: PartnerData[]
): FilePartnerMatch[] {
  const results: FilePartnerMatch[] = [];
  const seenPartnerIds = new Set<string>();

  // Match against user partners first
  for (const partner of userPartners) {
    const match = matchFileToPartner(file, partner, "user");
    if (match && !seenPartnerIds.has(match.partnerId)) {
      seenPartnerIds.add(match.partnerId);
      results.push(match);
    }
  }

  // Then match against global partners
  for (const partner of globalPartners) {
    // Skip if user already has a local copy of this global partner
    const hasLocalCopy = userPartners.some((up) => up.globalPartnerId === partner.id);
    if (hasLocalCopy) continue;

    const match = matchFileToPartner(file, partner, "global");
    if (match && !seenPartnerIds.has(match.partnerId)) {
      seenPartnerIds.add(match.partnerId);
      results.push(match);
    }
  }

  // Sort by confidence (highest first), user partners win ties
  return results.sort((a, b) => {
    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence;
    }
    if (a.partnerType === "user" && b.partnerType === "global") return -1;
    if (a.partnerType === "global" && b.partnerType === "user") return 1;
    return 0;
  });
}

/**
 * Check if a confidence score should trigger auto-assignment
 */
export function shouldAutoApply(confidence: number): boolean {
  return confidence >= 89;
}
