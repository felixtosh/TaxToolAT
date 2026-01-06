"use client";

import { useState, useCallback } from "react";
import { Institution } from "./use-institutions";

/**
 * Connection flow steps
 */
export type ConnectionStep =
  | "select-country"
  | "select-bank"
  | "authorizing"
  | "select-accounts"
  | "creating-source"
  | "complete"
  | "error";

/**
 * Account info from requisition
 */
export interface BankAccount {
  accountId: string;
  iban: string;
  ownerName?: string;
  status: string;
}

/**
 * Connection state
 */
export interface BankConnectionState {
  step: ConnectionStep;
  selectedCountry: string | null;
  selectedInstitution: Institution | null;
  connectionId: string | null;
  authorizationUrl: string | null;
  accounts: BankAccount[];
  createdSourceId: string | null;
  /** Existing source ID when linking/reconnecting */
  linkToSourceId: string | null;
  error: string | null;
}

const initialState: BankConnectionState = {
  step: "select-country",
  selectedCountry: null,
  selectedInstitution: null,
  connectionId: null,
  authorizationUrl: null,
  accounts: [],
  createdSourceId: null,
  linkToSourceId: null,
  error: null,
};

/**
 * Hook for managing the bank connection flow
 *
 * @param sourceId - Optional existing source ID for linking/reconnecting
 */
export function useBankConnection(sourceId?: string | null) {
  const [state, setState] = useState<BankConnectionState>(() => ({
    ...initialState,
    linkToSourceId: sourceId || null,
  }));
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Select a country and move to bank selection
   */
  const selectCountry = useCallback((countryCode: string) => {
    setState((s) => ({
      ...s,
      step: "select-bank",
      selectedCountry: countryCode,
      error: null,
    }));
  }, []);

  /**
   * Go back to country selection
   */
  const goBackToCountry = useCallback(() => {
    setState((s) => ({
      ...s,
      step: "select-country",
      selectedInstitution: null,
      error: null,
    }));
  }, []);

  /**
   * Start connection to a bank
   */
  const startConnection = useCallback(async (institution: Institution) => {
    setIsLoading(true);
    setState((s) => ({
      ...s,
      selectedInstitution: institution,
      error: null,
    }));

    try {
      // Get auth URL from TrueLayer
      const response = await fetch("/api/truelayer/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: institution.id,
          providerName: institution.name,
          providerLogo: institution.logo,
          sourceId: state.linkToSourceId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to start bank connection");
      }

      setState((s) => ({
        ...s,
        step: "authorizing",
        authorizationUrl: data.authUrl,
      }));

      // Redirect to TrueLayer auth (same window - they'll redirect back)
      window.location.href = data.authUrl;
    } catch (err) {
      setState((s) => ({
        ...s,
        step: "error",
        error: err instanceof Error ? err.message : "Failed to start connection",
      }));
    } finally {
      setIsLoading(false);
    }
  }, [state.linkToSourceId]);

  /**
   * Check connection status (not needed for TrueLayer - callback handles it)
   * Kept for compatibility but does nothing
   */
  const checkStatus = useCallback(async (connectionId: string) => {
    // TrueLayer handles this in the callback - no polling needed
    // The callback redirects directly to the accounts page
    setState((s) => ({
      ...s,
      connectionId,
    }));
  }, []);

  /**
   * Create a source from a selected account
   */
  const linkAccount = useCallback(
    async (accountId: string, name: string, connectionId?: string) => {
      const connId = connectionId || state.connectionId;
      if (!connId) {
        setState((s) => ({
          ...s,
          step: "error",
          error: "No connection ID available",
        }));
        return;
      }

      setIsLoading(true);
      setState((s) => ({ ...s, step: "creating-source" }));

      try {
        const response = await fetch("/api/truelayer/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            connectionId: connId,
            accountId,
            name,
            sourceId: state.linkToSourceId,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to create source");
        }

        setState((s) => ({
          ...s,
          step: "complete",
          createdSourceId: data.sourceId,
        }));
      } catch (err) {
        setState((s) => ({
          ...s,
          step: "error",
          error: err instanceof Error ? err.message : "Failed to link account",
        }));
      } finally {
        setIsLoading(false);
      }
    },
    [state.connectionId, state.linkToSourceId]
  );

  /**
   * Reset the connection flow
   */
  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  /**
   * Clear error and go back to previous step
   */
  const clearError = useCallback(() => {
    setState((s) => ({
      ...s,
      step: s.selectedInstitution ? "select-bank" : "select-country",
      error: null,
    }));
  }, []);

  return {
    state,
    isLoading,
    selectCountry,
    goBackToCountry,
    startConnection,
    checkStatus,
    linkAccount,
    reset,
    clearError,
  };
}
