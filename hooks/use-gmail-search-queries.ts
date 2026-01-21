"use client";

import { useState, useEffect, useRef } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/config";
import { Transaction } from "@/types/transaction";

/** Types of search suggestions - matches backend SuggestionType */
export type SuggestionType =
  | "invoice_number"  // Invoice/reference numbers (highest priority)
  | "company_name"    // Partner/company names
  | "email_domain"    // Email domains (from:domain)
  | "vat_id"          // VAT IDs
  | "iban"            // Bank account numbers
  | "pattern"         // File source patterns
  | "fallback";       // Generic search terms

export interface TypedSuggestion {
  query: string;
  type: SuggestionType;
  score: number;
}

interface UseGmailSearchQueriesOptions {
  transaction?: Transaction | null;
  /** @deprecated Partner data is now fetched server-side using partnerId */
  partner?: unknown;
  /** Only generate queries when enabled (e.g., when overlay is open) */
  enabled?: boolean;
}

interface GenerateSearchQueriesRequest {
  transaction: {
    name: string;
    partner?: string | null;
    description?: string;
    reference?: string;
    partnerId?: string | null;
    partnerType?: "global" | "user" | null;
  };
  maxQueries?: number;
}

interface GenerateSearchQueriesResponse {
  queries: string[];
  suggestions: TypedSuggestion[];
}

const generateSearchQueriesFn = httpsCallable<
  GenerateSearchQueriesRequest,
  GenerateSearchQueriesResponse
>(functions, "generateSearchQueriesCallable");

export function useGmailSearchQueries({
  transaction,
  enabled = true,
}: UseGmailSearchQueriesOptions = {}) {
  const [queries, setQueries] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<TypedSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const lastTransactionIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Don't run if not enabled (e.g., overlay is closed)
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    if (!transaction) {
      setQueries([]);
      setSuggestions([]);
      setIsLoading(false);
      lastTransactionIdRef.current = null;
      return;
    }

    // Skip if same transaction already processed
    if (transaction.id === lastTransactionIdRef.current) {
      return;
    }

    lastTransactionIdRef.current = transaction.id;

    // Note: Partner data is fetched server-side in the cloud function using partnerId,
    // so we don't need to wait for the partner object here. This also handles global
    // partners which aren't in the user's partner list.

    // Cancel any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    // Call cloud function to generate queries
    setIsLoading(true);

    generateSearchQueriesFn({
      transaction: {
        name: transaction.name ?? "",
        partner: transaction.partner,
        description: transaction.description ?? undefined,
        reference: transaction.reference ?? undefined,
        partnerId: transaction.partnerId,
        partnerType: transaction.partnerType,
      },
    })
      .then((result) => {
        setQueries(result.data.queries);
        setSuggestions(result.data.suggestions || []);
        setIsLoading(false);
      })
      .catch((error) => {
        // Ignore aborted requests
        if (error.code === "cancelled") return;
        console.error("Failed to generate search queries:", error);
        setQueries([]);
        setSuggestions([]);
        setIsLoading(false);
      });

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [transaction, enabled]);

  return {
    queries,
    suggestions,
    isLoading,
  };
}
