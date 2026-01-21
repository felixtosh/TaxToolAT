"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { fetchWithAuth } from "@/lib/api/fetch-with-auth";
import { usePrecisionSearchContext } from "./use-precision-search-context";

export type SearchStrategy = "partner_files" | "amount_files" | "email_attachment" | "email_invoice";

export interface PrecisionSearchStatus {
  isSearching: boolean;
  currentStrategy: SearchStrategy | null;
  progress: number;
  error: string | null;
  queueId: string | null;
}

const STRATEGY_LABELS: Record<SearchStrategy, string> = {
  partner_files: "Searching partner files...",
  amount_files: "Matching by amount...",
  email_attachment: "Searching emails...",
  email_invoice: "Analyzing invoices...",
};

export function getStrategyLabel(strategy: SearchStrategy | null): string {
  if (!strategy) return "Searching...";
  return STRATEGY_LABELS[strategy] || "Searching...";
}

interface UsePrecisionSearchOptions {
  transactionId: string;
  onComplete?: (filesConnected: number) => void;
}

export function usePrecisionSearch({ transactionId, onComplete }: UsePrecisionSearchOptions) {
  const [status, setStatus] = useState<PrecisionSearchStatus>({
    isSearching: false,
    currentStrategy: null,
    progress: 0,
    error: null,
    queueId: null,
  });

  // Get context to share searching state across components (optional - works without provider)
  let setSearchingInContext: ((id: string, searching: boolean) => void) | null = null;
  try {
    const ctx = usePrecisionSearchContext();
    setSearchingInContext = ctx.setSearching;
  } catch {
    // Context not available, that's fine
  }

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // Poll for status
  const pollStatus = useCallback(async (queueId: string) => {
    try {
      const response = await fetchWithAuth(`/api/precision-search/status?queueId=${queueId}`);
      if (!response.ok) {
        throw new Error("Failed to get status");
      }

      const data = await response.json();
      const queueItem = data.queueItem;

      if (!queueItem) {
        stopPolling();
        setStatus((prev) => ({ ...prev, isSearching: false, error: "Search not found" }));
        return;
      }

      // Determine current strategy from the queue item
      // The strategies array is in order, currentStrategyIndex tells us which one
      const strategies: SearchStrategy[] = ["partner_files", "amount_files", "email_attachment", "email_invoice"];
      const currentStrategy = strategies[queueItem.currentStrategyIndex || 0] || null;

      if (queueItem.status === "completed" || queueItem.status === "failed") {
        stopPolling();
        setStatus({
          isSearching: false,
          currentStrategy: null,
          progress: 100,
          error: queueItem.status === "failed" ? queueItem.lastError || "Search failed" : null,
          queueId,
        });

        if (queueItem.status === "completed" && onCompleteRef.current) {
          onCompleteRef.current(queueItem.totalFilesConnected || 0);
        }
      } else {
        setStatus({
          isSearching: true,
          currentStrategy,
          progress: queueItem.progress || 0,
          error: null,
          queueId,
        });
      }
    } catch (err) {
      console.error("Error polling precision search status:", err);
    }
  }, [stopPolling]);

  // Trigger search
  const triggerSearch = useCallback(async () => {
    setStatus({
      isSearching: true,
      currentStrategy: "partner_files", // Start with first strategy
      progress: 0,
      error: null,
      queueId: null,
    });

    try {
      const response = await fetchWithAuth("/api/precision-search/trigger", {
        method: "POST",
        body: JSON.stringify({
          scope: "single_transaction",
          transactionId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to start search");
      }

      const queueId = data.queueId;
      setStatus((prev) => ({ ...prev, queueId }));

      // Start polling
      stopPolling();
      pollingRef.current = setInterval(() => pollStatus(queueId), 2000);

      // Also poll immediately
      pollStatus(queueId);
    } catch (err) {
      setStatus({
        isSearching: false,
        currentStrategy: null,
        progress: 0,
        error: err instanceof Error ? err.message : "Search failed",
        queueId: null,
      });
    }
  }, [transactionId, stopPolling, pollStatus]);

  // Reset state and stop polling when transactionId changes
  useEffect(() => {
    // Reset to initial state when transaction changes
    setStatus({
      isSearching: false,
      currentStrategy: null,
      progress: 0,
      error: null,
      queueId: null,
    });
    stopPolling();
    // Clear context for previous transaction
    setSearchingInContext?.(transactionId, false);
  }, [transactionId, stopPolling, setSearchingInContext]);

  // Sync isSearching state with context (for table column to show loading)
  useEffect(() => {
    setSearchingInContext?.(transactionId, status.isSearching);
  }, [transactionId, status.isSearching, setSearchingInContext]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
      setSearchingInContext?.(transactionId, false);
    };
  }, [stopPolling, transactionId, setSearchingInContext]);

  return {
    ...status,
    triggerSearch,
    strategyLabel: getStrategyLabel(status.currentStrategy),
  };
}
