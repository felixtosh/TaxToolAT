/**
 * Server-side partner matching utilities
 * Mirrors the client-side matching logic for Cloud Functions
 */

// ============ URL Normalization ============

export function normalizeUrl(url: string): string {
  if (!url) return "";

  try {
    let normalized = url.toLowerCase().trim();
    normalized = normalized.replace(/^https?:\/\//, "");
    normalized = normalized.replace(/^www\./, "");
    normalized = normalized.replace(/\/$/, "");
    normalized = normalized.split("?")[0].split("#")[0];
    return normalized;
  } catch {
    return url.toLowerCase().trim();
  }
}

// ============ IBAN Normalization ============

export function normalizeIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}

// ============ Company Name Normalization ============

const COMPANY_SUFFIXES = [
  /\s*gmbh\s*$/i,
  /\s*g\.m\.b\.h\.\s*$/i,
  /\s*ges\.?m\.?b\.?h\.?\s*$/i,
  /\s*ag\s*$/i,
  /\s*kg\s*$/i,
  /\s*ohg\s*$/i,
  /\s*og\s*$/i,
  /\s*e\.?u\.?\s*$/i,
  /\s*&\s*co\.?\s*(kg|ohg)?\s*$/i,
  /\s*mbh\s*$/i,
  /\s*ltd\.?\s*$/i,
  /\s*limited\s*$/i,
  /\s*inc\.?\s*$/i,
  /\s*incorporated\s*$/i,
  /\s*corp\.?\s*$/i,
  /\s*corporation\s*$/i,
  /\s*llc\s*$/i,
  /\s*llp\s*$/i,
  /\s*plc\s*$/i,
  /\s*co\.?\s*$/i,
  /\s*s\.?a\.?\s*$/i,
  /\s*s\.?a\.?r\.?l\.?\s*$/i,
  /\s*sarl\s*$/i,
  /\s*sas\s*$/i,
  /\s*s\.?r\.?l\.?\s*$/i,
  /\s*srl\s*$/i,
  /\s*s\.?p\.?a\.?\s*$/i,
  /\s*spa\s*$/i,
  /\s*s\.?l\.?\s*$/i,
  /\s*b\.?v\.?\s*$/i,
  /\s*n\.?v\.?\s*$/i,
];

export function normalizeCompanyName(name: string): string {
  if (!name) return "";

  let normalized = name.toLowerCase().trim();

  for (const suffix of COMPANY_SUFFIXES) {
    normalized = normalized.replace(suffix, "");
  }

  normalized = normalized.replace(/[^a-z0-9äöüß\s]/g, " ");
  normalized = normalized
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
  normalized = normalized.replace(/\s+/g, " ").trim();

  return normalized;
}

// ============ Similarity Calculation ============

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

export function calculateCompanyNameSimilarity(name1: string, name2: string): number {
  const normalized1 = normalizeCompanyName(name1);
  const normalized2 = normalizeCompanyName(name2);

  if (normalized1 === normalized2) return 100;

  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
    const shorter = normalized1.length < normalized2.length ? normalized1 : normalized2;
    const longer = normalized1.length >= normalized2.length ? normalized1 : normalized2;
    const coverage = shorter.length / longer.length;
    return Math.round(75 + coverage * 25);
  }

  const maxLen = Math.max(normalized1.length, normalized2.length);
  if (maxLen === 0) return 0;

  const distance = levenshteinDistance(normalized1, normalized2);
  return Math.round(((maxLen - distance) / maxLen) * 100);
}

// ============ Glob Pattern Matching ============

export interface LearnedPattern {
  pattern: string;
  field: "partner" | "name";
  confidence: number;
}

/**
 * Match a glob-style pattern against text
 * Supports * as wildcard (matches any characters)
 */
export function globMatch(pattern: string, text: string): boolean {
  if (!pattern || !text) return false;

  const normalizedText = text.toLowerCase();
  const normalizedPattern = pattern.toLowerCase();

  // Convert glob to regex: escape special chars, then replace * with .*
  const regexPattern = normalizedPattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&") // Escape regex special chars
    .replace(/\*/g, ".*"); // * -> .*

  try {
    return new RegExp(`^${regexPattern}$`).test(normalizedText);
  } catch {
    return false;
  }
}

// ============ Partner Matching ============

/** Base pattern interface (used by both global and user partners) */
export interface MatchPattern {
  pattern: string;
  /** DEPRECATED: field is ignored, patterns match all text fields combined */
  field?: "partner" | "name";
  confidence: number;
}

export interface PartnerData {
  id: string;
  name: string;
  aliases: string[];
  ibans: string[];
  website?: string;
  vatId?: string;
  /** AI-learned patterns (user partners) */
  learnedPatterns?: LearnedPattern[];
  /** Static patterns (global partners from presets) */
  patterns?: MatchPattern[];
}

export interface TransactionData {
  id: string;
  partner: string | null;
  partnerIban: string | null;
  name: string;
  reference: string | null;
}

export interface MatchResult {
  partnerId: string;
  partnerType: "global" | "user";
  partnerName: string;
  confidence: number;
  source: "iban" | "vatId" | "website" | "name" | "pattern";
}

export function matchTransaction(
  transaction: TransactionData,
  userPartners: PartnerData[],
  globalPartners: PartnerData[]
): MatchResult[] {
  const results: MatchResult[] = [];

  // Process user partners first
  for (const partner of userPartners) {
    const match = matchSinglePartner(transaction, partner, "user");
    if (match) {
      results.push(match);
    }
  }

  // Then global partners
  for (const partner of globalPartners) {
    const match = matchSinglePartner(transaction, partner, "global");
    if (match) {
      const existingMatch = results.find(
        (r) => r.partnerId === match.partnerId && r.partnerType === match.partnerType
      );
      if (!existingMatch) {
        results.push(match);
      }
    }
  }

  // Sort with user partners taking absolute precedence over global when both above threshold
  const AUTO_ASSIGN_THRESHOLD = 89;
  results.sort((a, b) => {
    const aAboveThreshold = a.confidence >= AUTO_ASSIGN_THRESHOLD;
    const bAboveThreshold = b.confidence >= AUTO_ASSIGN_THRESHOLD;

    // If both above threshold, user always wins over global
    if (aAboveThreshold && bAboveThreshold) {
      if (a.partnerType === "user" && b.partnerType === "global") return -1;
      if (a.partnerType === "global" && b.partnerType === "user") return 1;
      // Same type: sort by confidence
      return b.confidence - a.confidence;
    }

    // If only one is above threshold, it wins
    if (aAboveThreshold && !bAboveThreshold) return -1;
    if (!aAboveThreshold && bAboveThreshold) return 1;

    // Both below threshold: sort by confidence, user wins on ties
    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence;
    }
    if (a.partnerType === "user" && b.partnerType === "global") return -1;
    if (a.partnerType === "global" && b.partnerType === "user") return 1;
    return 0;
  });

  return results.slice(0, 3);
}

function matchSinglePartner(
  transaction: TransactionData,
  partner: PartnerData,
  partnerType: "global" | "user"
): MatchResult | null {
  const candidates: MatchResult[] = [];

  // 1. IBAN match (100%)
  if (transaction.partnerIban && partner.ibans && partner.ibans.length > 0) {
    const txIban = normalizeIban(transaction.partnerIban);
    for (const iban of partner.ibans) {
      if (normalizeIban(iban) === txIban) {
        // IBAN match is definitive - return immediately
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

  // 2. Pattern match - works for both learnedPatterns (user) and patterns (global)
  // Combine all text fields for matching (no field-specific penalties)
  const allPatterns: MatchPattern[] = [
    ...(partner.learnedPatterns || []),
    ...(partner.patterns || []),
  ];

  const textToMatch = [transaction.name, transaction.partner, transaction.reference]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  for (const p of allPatterns) {
    if (globMatch(p.pattern, textToMatch)) {
      candidates.push({
        partnerId: partner.id,
        partnerType,
        partnerName: partner.name,
        confidence: p.confidence, // Use pattern confidence directly, no penalty
        source: "pattern",
      });
    }
  }

  // 3. Website match (90%)
  if (partner.website) {
    const normalizedWebsite = normalizeUrl(partner.website);
    const txText = `${transaction.name || ""} ${transaction.partner || ""}`.toLowerCase();

    if (txText.includes(normalizedWebsite)) {
      candidates.push({
        partnerId: partner.id,
        partnerType,
        partnerName: partner.name,
        confidence: 90,
        source: "website",
      });
    }
  }

  // 4. Name matching (60-90%)
  if (transaction.partner) {
    const namesToCheck = [partner.name, ...(partner.aliases || [])];

    for (const name of namesToCheck) {
      const similarity = calculateCompanyNameSimilarity(transaction.partner, name);

      if (similarity >= 60) {
        const confidence = Math.min(90, 60 + ((similarity - 60) * 30) / 40);
        candidates.push({
          partnerId: partner.id,
          partnerType,
          partnerName: partner.name,
          confidence: Math.round(confidence),
          source: "name",
        });
      }
    }
  }

  // Also check transaction.name if partner field is empty
  if (!transaction.partner && transaction.name) {
    const namesToCheck = [partner.name, ...(partner.aliases || [])];

    for (const name of namesToCheck) {
      const similarity = calculateCompanyNameSimilarity(transaction.name, name);

      if (similarity >= 70) {
        const confidence = Math.min(85, 60 + ((similarity - 70) * 25) / 30);
        candidates.push({
          partnerId: partner.id,
          partnerType,
          partnerName: partner.name,
          confidence: Math.round(confidence),
          source: "name",
        });
      }
    }
  }

  // Return the best candidate
  if (candidates.length === 0) {
    return null;
  }

  return candidates.reduce((best, current) =>
    current.confidence > best.confidence ? current : best
  );
}

export function shouldAutoApply(confidence: number): boolean {
  return confidence >= 89;
}
