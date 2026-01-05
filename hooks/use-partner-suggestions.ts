"use client";

import { useMemo } from "react";
import { Transaction } from "@/types/transaction";
import { UserPartner, GlobalPartner, PartnerSuggestion } from "@/types/partner";
import { matchTransactionByPattern } from "@/lib/matching/partner-matcher";

export interface PartnerSuggestionWithDetails extends PartnerSuggestion {
  partner: UserPartner | GlobalPartner;
}

/**
 * Hook to get partner suggestions for a transaction with full partner details
 * Combines:
 * 1. Server-side stored suggestions (transaction.partnerSuggestions)
 * 2. Client-side pattern matches (instant, from learned patterns)
 */
export function usePartnerSuggestions(
  transaction: Transaction | null,
  userPartners: UserPartner[],
  globalPartners: GlobalPartner[]
): PartnerSuggestionWithDetails[] {
  return useMemo(() => {
    if (!transaction) return [];

    const results: PartnerSuggestionWithDetails[] = [];
    const seenPartnerIds = new Set<string>();

    // 1. Add client-side pattern matches first (instant, most relevant)
    if (!transaction.partnerId) {
      const patternMatch = matchTransactionByPattern(transaction, userPartners);
      if (patternMatch) {
        const partner = userPartners.find((p) => p.id === patternMatch.partnerId);
        if (partner && !seenPartnerIds.has(patternMatch.partnerId)) {
          seenPartnerIds.add(patternMatch.partnerId);
          results.push({
            partnerId: patternMatch.partnerId,
            partnerType: "user",
            confidence: patternMatch.confidence,
            source: "pattern",
            partner,
          });
        }
      }
    }

    // 2. Add server-side stored suggestions
    if (transaction.partnerSuggestions && transaction.partnerSuggestions.length > 0) {
      for (const suggestion of transaction.partnerSuggestions) {
        if (seenPartnerIds.has(suggestion.partnerId)) continue;

        let partner: UserPartner | GlobalPartner | undefined;
        if (suggestion.partnerType === "user") {
          partner = userPartners.find((p) => p.id === suggestion.partnerId);
        } else {
          partner = globalPartners.find((p) => p.id === suggestion.partnerId);
        }

        if (!partner) continue;

        // Filter out global partners where user already has a local copy
        if (suggestion.partnerType === "global") {
          const hasLocalCopy = userPartners.some((up) => up.globalPartnerId === suggestion.partnerId);
          if (hasLocalCopy) continue;
        }

        seenPartnerIds.add(suggestion.partnerId);
        results.push({
          ...suggestion,
          partner,
        });
      }
    }

    // Sort by confidence (highest first)
    return results.sort((a, b) => b.confidence - a.confidence);
  }, [transaction, userPartners, globalPartners]);
}

/**
 * Get the assigned partner for a transaction
 */
export function useAssignedPartner(
  transaction: Transaction | null,
  userPartners: UserPartner[],
  globalPartners: GlobalPartner[]
): (UserPartner | GlobalPartner) | null {
  return useMemo(() => {
    if (!transaction?.partnerId || !transaction?.partnerType) {
      return null;
    }

    if (transaction.partnerType === "user") {
      return userPartners.find((p) => p.id === transaction.partnerId) || null;
    } else {
      return globalPartners.find((p) => p.id === transaction.partnerId) || null;
    }
  }, [transaction, userPartners, globalPartners]);
}
