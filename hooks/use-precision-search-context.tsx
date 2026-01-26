"use client";

import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";
import { useRunningWorkers } from "./use-running-workers";

interface PrecisionSearchContextValue {
  /** Combined set of transactionIds being searched (manual + worker automations) */
  searchingTransactions: Set<string>;
  /** Set manual searching state for a transaction */
  setSearching: (transactionId: string, isSearching: boolean) => void;
  /** Check if a transaction has any active search (manual or worker) */
  isSearchingTransaction: (transactionId: string) => boolean;
  /** Set of transactionIds with file-related workers running (from notifications) */
  runningFileSearchTransactionIds: Set<string>;
  /** Set of transactionIds with partner matching workers running (from notifications) */
  runningPartnerSearchTransactionIds: Set<string>;
  /** Set of fileIds with any running worker (file_matching, file_partner_matching) */
  runningFileIds: Set<string>;
}

const PrecisionSearchContext = createContext<PrecisionSearchContextValue | null>(null);

export function PrecisionSearchProvider({ children }: { children: ReactNode }) {
  // Manual precision search state
  const [manualSearchingTransactions, setManualSearchingTransactions] = useState<Set<string>>(new Set());

  // Running workers from notifications (real-time via Firestore)
  const { runningFileSearchTransactionIds, runningPartnerSearchTransactionIds, runningFileIds } = useRunningWorkers();

  // Combine manual searches and worker file searches for the unified searchingTransactions
  const searchingTransactions = useMemo(() => {
    const combined = new Set<string>(manualSearchingTransactions);
    for (const id of runningFileSearchTransactionIds) {
      combined.add(id);
    }
    return combined;
  }, [manualSearchingTransactions, runningFileSearchTransactionIds]);

  const setSearching = useCallback((transactionId: string, isSearching: boolean) => {
    setManualSearchingTransactions((prev) => {
      const next = new Set(prev);
      if (isSearching) {
        next.add(transactionId);
      } else {
        next.delete(transactionId);
      }
      return next;
    });
  }, []);

  const isSearchingTransaction = useCallback(
    (transactionId: string) => searchingTransactions.has(transactionId),
    [searchingTransactions]
  );

  return (
    <PrecisionSearchContext.Provider
      value={{
        searchingTransactions,
        setSearching,
        isSearchingTransaction,
        runningFileSearchTransactionIds,
        runningPartnerSearchTransactionIds,
        runningFileIds,
      }}
    >
      {children}
    </PrecisionSearchContext.Provider>
  );
}

export function usePrecisionSearchContext() {
  const context = useContext(PrecisionSearchContext);
  if (!context) {
    throw new Error("usePrecisionSearchContext must be used within PrecisionSearchProvider");
  }
  return context;
}
