"use client";

import { useMemo } from "react";
import { Transaction } from "@/types/transaction";
import { UserPartner, GlobalPartner, PartnerSuggestion } from "@/types/partner";

export interface PartnerSuggestionWithDetails extends PartnerSuggestion {
  partner: UserPartner | GlobalPartner;
}

/**
 * Hook to get partner suggestions for a transaction with full partner details
 */
export function usePartnerSuggestions(
  transaction: Transaction | null,
  userPartners: UserPartner[],
  globalPartners: GlobalPartner[]
): PartnerSuggestionWithDetails[] {
  return useMemo(() => {
    if (!transaction?.partnerSuggestions || transaction.partnerSuggestions.length === 0) {
      return [];
    }

    return transaction.partnerSuggestions
      .map((suggestion) => {
        let partner: UserPartner | GlobalPartner | undefined;

        if (suggestion.partnerType === "user") {
          partner = userPartners.find((p) => p.id === suggestion.partnerId);
        } else {
          partner = globalPartners.find((p) => p.id === suggestion.partnerId);
        }

        if (!partner) return null;

        return {
          ...suggestion,
          partner,
        };
      })
      .filter((s): s is PartnerSuggestionWithDetails => s !== null)
      // Filter out global partners where user already has a local copy
      .filter((s) => {
        if (s.partnerType === "global") {
          const hasLocalCopy = userPartners.some((up) => up.globalPartnerId === s.partnerId);
          if (hasLocalCopy) return false;
        }
        return true;
      });
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
