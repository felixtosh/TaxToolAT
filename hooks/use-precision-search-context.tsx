"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface PrecisionSearchContextValue {
  searchingTransactions: Set<string>;
  setSearching: (transactionId: string, isSearching: boolean) => void;
  isSearchingTransaction: (transactionId: string) => boolean;
}

const PrecisionSearchContext = createContext<PrecisionSearchContextValue | null>(null);

export function PrecisionSearchProvider({ children }: { children: ReactNode }) {
  const [searchingTransactions, setSearchingTransactions] = useState<Set<string>>(new Set());

  const setSearching = useCallback((transactionId: string, isSearching: boolean) => {
    setSearchingTransactions((prev) => {
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
      value={{ searchingTransactions, setSearching, isSearchingTransaction }}
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
