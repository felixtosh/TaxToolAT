/**
 * Partner matching algorithm
 *
 * Matches transactions to partners based on:
 * 1. IBAN match (100% confidence)
 * 2. VAT ID match (95% confidence)
 * 3. Website/URL match (90% confidence)
 * 4. Fuzzy name match (60-90% confidence)
 */

import { UserPartner, GlobalPartner, PartnerMatchResult, MatchSource, LearnedPattern } from "@/types/partner";
import { Transaction } from "@/types/transaction";
import { normalizeIban } from "@/lib/import/deduplication";
import { normalizeUrl, rootDomainsMatch } from "./url-normalizer";
import { calculateCompanyNameSimilarity, vatIdsMatch } from "./fuzzy-match";

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

type PartnerWithType = (UserPartner | GlobalPartner) & { _type: "user" | "global" };

/**
 * Match a transaction against all known partners
 * Returns top 3 matches sorted by confidence
 *
 * Priority: User partners first (they usually know their partners better)
 */
export function matchTransaction(
  transaction: Transaction,
  userPartners: UserPartner[],
  globalPartners: GlobalPartner[]
): PartnerMatchResult[] {
  const results: PartnerMatchResult[] = [];

  // Process user partners first (they take priority in case of ties)
  for (const partner of userPartners) {
    const match = matchSinglePartner(transaction, { ...partner, _type: "user" });
    if (match) {
      results.push(match);
    }
  }

  // Then process global partners
  for (const partner of globalPartners) {
    const match = matchSinglePartner(transaction, { ...partner, _type: "global" });
    if (match) {
      // Check if we already have a match for this partner (avoid duplicates)
      const existingMatch = results.find(
        (r) => r.partnerId === match.partnerId && r.partnerType === match.partnerType
      );
      if (!existingMatch) {
        results.push(match);
      }
    }
  }

  // Sort by confidence (highest first), with user partners first for ties
  results.sort((a, b) => {
    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence;
    }
    // User partners take priority over global partners at same confidence
    if (a.partnerType === "user" && b.partnerType === "global") return -1;
    if (a.partnerType === "global" && b.partnerType === "user") return 1;
    return 0;
  });

  // Return top 3
  return results.slice(0, 3);
}

/**
 * Match a transaction against a single partner
 * Returns the best match or null if no match
 */
function matchSinglePartner(
  transaction: Transaction,
  partner: PartnerWithType
): PartnerMatchResult | null {
  let bestMatch: PartnerMatchResult | null = null;

  // 1. IBAN match (100% confidence) - Highest priority
  if (transaction.partnerIban && partner.ibans && partner.ibans.length > 0) {
    const txIban = normalizeIban(transaction.partnerIban);
    for (const iban of partner.ibans) {
      if (normalizeIban(iban) === txIban) {
        return {
          partnerId: partner.id,
          partnerType: partner._type,
          partnerName: partner.name,
          confidence: 100,
          source: "iban",
        };
      }
    }
  }

  // 2. Learned pattern match (uses AI-determined confidence)
  // Only for user partners (they have learned patterns)
  if (partner._type === "user" && "learnedPatterns" in partner) {
    const userPartner = partner as UserPartner & { _type: "user" };
    if (userPartner.learnedPatterns && userPartner.learnedPatterns.length > 0) {
      for (const lp of userPartner.learnedPatterns) {
        const textToMatch = lp.field === "partner" ? transaction.partner : transaction.name;
        if (textToMatch && globMatch(lp.pattern, textToMatch)) {
          const match: PartnerMatchResult = {
            partnerId: partner.id,
            partnerType: partner._type,
            partnerName: partner.name,
            confidence: lp.confidence,
            source: "pattern",
          };
          if (!bestMatch || match.confidence > bestMatch.confidence) {
            bestMatch = match;
          }
        }
      }
    }
  }

  // 3. VAT ID match (95% confidence)
  // Note: We'd need to extract VAT from transaction - future enhancement
  // For now, VAT matching happens when user explicitly provides VAT

  // 4. Website match (90% confidence)
  // Check if partner website appears in transaction name or description
  if (partner.website) {
    const normalizedWebsite = normalizeUrl(partner.website);
    const txText = `${transaction.name || ""} ${transaction.partner || ""}`.toLowerCase();

    // Check if website domain appears in transaction text
    if (txText.includes(normalizedWebsite)) {
      const match: PartnerMatchResult = {
        partnerId: partner.id,
        partnerType: partner._type,
        partnerName: partner.name,
        confidence: 90,
        source: "website",
      };
      if (!bestMatch || match.confidence > bestMatch.confidence) {
        bestMatch = match;
      }
    }
  }

  // 4. Name matching (60-90% confidence)
  if (transaction.partner) {
    const namesToCheck = [partner.name, ...(partner.aliases || [])];

    for (const name of namesToCheck) {
      const similarity = calculateCompanyNameSimilarity(transaction.partner, name);

      if (similarity >= 60) {
        // Scale 60-100 similarity to 60-90 confidence
        // (Name matching should never be 100% confident by itself)
        const confidence = Math.min(90, 60 + ((similarity - 60) * 30) / 40);
        const match: PartnerMatchResult = {
          partnerId: partner.id,
          partnerType: partner._type,
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

  // Also check transaction.name if partner field is empty
  if (!transaction.partner && transaction.name) {
    const namesToCheck = [partner.name, ...(partner.aliases || [])];

    for (const name of namesToCheck) {
      const similarity = calculateCompanyNameSimilarity(transaction.name, name);

      if (similarity >= 70) {
        // Higher threshold for name field since it's less reliable
        const confidence = Math.min(85, 60 + ((similarity - 70) * 25) / 30);
        const match: PartnerMatchResult = {
          partnerId: partner.id,
          partnerType: partner._type,
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
 * Determine if a match should be auto-applied (≥95% confidence)
 */
export function shouldAutoApply(confidence: number): boolean {
  return confidence >= 95;
}

/**
 * Get confidence tier for display
 */
export function getConfidenceTier(confidence: number): "high" | "medium" | "low" {
  if (confidence >= 90) return "high";
  if (confidence >= 75) return "medium";
  return "low";
}

/**
 * Get confidence tier color for UI
 */
export function getConfidenceColor(confidence: number): string {
  if (confidence >= 90) return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
  if (confidence >= 75) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
  return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
}

/**
 * Get source label for display
 */
export function getSourceLabel(source: MatchSource): string {
  switch (source) {
    case "iban":
      return "IBAN Match";
    case "vatId":
      return "VAT Match";
    case "website":
      return "Website Match";
    case "name":
      return "Name Match";
    case "pattern":
      return "Pattern Match";
    case "manual":
      return "Manual";
    default:
      return source;
  }
}

/**
 * Batch match multiple transactions
 * More efficient than calling matchTransaction for each
 */
export function matchTransactionsBatch(
  transactions: Transaction[],
  userPartners: UserPartner[],
  globalPartners: GlobalPartner[]
): Map<string, PartnerMatchResult[]> {
  const results = new Map<string, PartnerMatchResult[]>();

  for (const transaction of transactions) {
    const matches = matchTransaction(transaction, userPartners, globalPartners);
    if (matches.length > 0) {
      results.set(transaction.id, matches);
    }
  }

  return results;
}

/**
 * Fast client-side pattern matching (instant suggestions)
 * Only checks learned patterns - no IBAN, name, or website matching
 * Use this for instant UI suggestions without server calls
 */
export function matchTransactionByPattern(
  transaction: Transaction,
  partners: UserPartner[]
): PartnerMatchResult | null {
  if (transaction.partnerId) return null; // Already assigned

  let bestMatch: PartnerMatchResult | null = null;

  for (const partner of partners) {
    if (!partner.learnedPatterns || partner.learnedPatterns.length === 0) continue;

    for (const lp of partner.learnedPatterns) {
      const textToMatch = lp.field === "partner" ? transaction.partner : transaction.name;
      if (textToMatch && globMatch(lp.pattern, textToMatch)) {
        if (!bestMatch || lp.confidence > bestMatch.confidence) {
          bestMatch = {
            partnerId: partner.id,
            partnerType: "user",
            partnerName: partner.name,
            confidence: lp.confidence,
            source: "pattern",
          };
        }
      }
    }
  }

  return bestMatch;
}

/**
 * Batch pattern matching for all transactions
 * Returns a Map of transactionId -> suggested partner match
 */
export function matchAllTransactionsByPattern(
  transactions: Transaction[],
  partners: UserPartner[]
): Map<string, PartnerMatchResult> {
  const results = new Map<string, PartnerMatchResult>();

  for (const transaction of transactions) {
    const match = matchTransactionByPattern(transaction, partners);
    if (match) {
      results.set(transaction.id, match);
    }
  }

  return results;
}
