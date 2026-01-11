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

  // 2. Pattern match - works for both user (learnedPatterns) and global (patterns) partners
  const patterns = partner._type === "user"
    ? (partner as UserPartner & { _type: "user" }).learnedPatterns
    : (partner as GlobalPartner & { _type: "global" }).patterns;

  if (patterns && patterns.length > 0) {
    for (const p of patterns) {
      const textToMatch = p.field === "partner" ? transaction.partner : transaction.name;
      if (textToMatch && globMatch(p.pattern, textToMatch)) {
        const match: PartnerMatchResult = {
          partnerId: partner.id,
          partnerType: partner._type,
          partnerName: partner.name,
          confidence: p.confidence,
          source: "pattern",
        };
        if (!bestMatch || match.confidence > bestMatch.confidence) {
          bestMatch = match;
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

  // 4. Manual pattern matching (aliases with glob syntax)
  // Check if any alias contains * (glob pattern) - treat as manual pattern
  const aliases = partner.aliases || [];
  const globAliases = aliases.filter((a) => a.includes("*"));

  if (globAliases.length > 0) {
    const textsToCheck = [transaction.partner, transaction.name].filter(Boolean) as string[];

    for (const alias of globAliases) {
      for (const text of textsToCheck) {
        if (globMatch(alias, text)) {
          const match: PartnerMatchResult = {
            partnerId: partner.id,
            partnerType: partner._type,
            partnerName: partner.name,
            confidence: 90, // Manual patterns get 90% confidence
            source: "pattern",
          };
          if (!bestMatch || match.confidence > bestMatch.confidence) {
            bestMatch = match;
          }
          break;
        }
      }
    }
  }

  // 5. Name matching (60-90% confidence)
  // Only use non-glob aliases for fuzzy name matching
  const nameAliases = aliases.filter((a) => !a.includes("*"));
  const namesToCheck = [partner.name, ...nameAliases];

  if (transaction.partner) {
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
 * Determine if a match should be auto-applied (≥89% confidence)
 * Matches server-side threshold in functions/src/utils/partner-matcher.ts
 */
export function shouldAutoApply(confidence: number): boolean {
  return confidence >= 89;
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

