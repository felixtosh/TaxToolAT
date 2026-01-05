"use client";

import { useMemo } from "react";
import { Transaction, TransactionFilters } from "@/types/transaction";

/**
 * Client-side filtering hook for transactions.
 * Applies all filter criteria and returns filtered list.
 */
export function useFilteredTransactions(
  transactions: Transaction[],
  filters: TransactionFilters,
  searchValue: string
): Transaction[] {
  return useMemo(() => {
    let result = transactions;

    // Text search
    if (searchValue.trim()) {
      const search = searchValue.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(search) ||
          t.description?.toLowerCase().includes(search) ||
          t.partner?.toLowerCase().includes(search)
      );
    }

    // Import ID filter
    if (filters.importId) {
      result = result.filter((t) => t.importJobId === filters.importId);
    }

    // Source filter
    if (filters.sourceId) {
      result = result.filter((t) => t.sourceId === filters.sourceId);
    }

    // Receipt filter
    if (filters.hasReceipt !== undefined) {
      result = result.filter((t) =>
        filters.hasReceipt
          ? t.receiptIds.length > 0
          : t.receiptIds.length === 0
      );
    }

    // Date range filter
    if (filters.dateFrom) {
      const fromTime = filters.dateFrom.getTime();
      result = result.filter((t) => t.date.toDate().getTime() >= fromTime);
    }
    if (filters.dateTo) {
      // Add one day to include the end date fully
      const toTime = filters.dateTo.getTime() + 24 * 60 * 60 * 1000;
      result = result.filter((t) => t.date.toDate().getTime() < toTime);
    }

    // Amount type filter
    if (filters.amountType === "income") {
      result = result.filter((t) => t.amount > 0);
    } else if (filters.amountType === "expense") {
      result = result.filter((t) => t.amount < 0);
    }

    // Completion status filter
    if (filters.isComplete !== undefined) {
      result = result.filter((t) => t.isComplete === filters.isComplete);
    }

    return result;
  }, [transactions, filters, searchValue]);
}
