"use client";

import { useMemo, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransactions } from "@/hooks/use-transactions";
import { useSources } from "@/hooks/use-sources";
import { useFilteredTransactions } from "@/hooks/use-filtered-transactions";
import { parseFiltersFromUrl, buildFilterUrl } from "@/lib/filters/url-params";
import { matchAllTransactionsByPattern } from "@/lib/matching";
import { DataTable } from "./data-table";
import { getTransactionColumns } from "./transaction-columns";
import { TransactionToolbar } from "./transaction-toolbar";
import { Transaction, TransactionFilters } from "@/types/transaction";
import { UserPartner, GlobalPartner } from "@/types/partner";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";

interface TransactionTableProps {
  onSelectTransaction: (transaction: Transaction) => void;
  selectedTransactionId: string | null;
  searchValue: string;
  onSearchChange: (value: string) => void;
  userPartners?: UserPartner[];
  globalPartners?: GlobalPartner[];
}

export function TransactionTable({
  onSelectTransaction,
  selectedTransactionId,
  searchValue,
  onSearchChange,
  userPartners = [],
  globalPartners = [],
}: TransactionTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { transactions, loading, error } = useTransactions();
  const { sources } = useSources();

  // Scroll to and highlight a transaction by ID
  const scrollToTransactionById = useCallback((transactionId: string) => {
    const element = document.querySelector(
      `[data-transaction-id="${transactionId}"]`
    );
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.classList.add("animate-pulse", "bg-primary/10");
      setTimeout(() => {
        element.classList.remove("animate-pulse", "bg-primary/10");
      }, 2000);
    }
  }, []);

  // Find and open a transaction by ID (for chat UI control)
  const openTransactionById = useCallback(
    (transactionId: string) => {
      const transaction = transactions.find((t) => t.id === transactionId);
      if (transaction) {
        onSelectTransaction(transaction);
      }
    },
    [transactions, onSelectTransaction]
  );

  // Listen for chat UI control events
  useEffect(() => {
    const handleOpenTransaction = (
      e: CustomEvent<{ transactionId: string }>
    ) => {
      openTransactionById(e.detail.transactionId);
    };

    const handleScrollToTransaction = (
      e: CustomEvent<{ transactionId: string }>
    ) => {
      scrollToTransactionById(e.detail.transactionId);
    };

    const handleHighlightTransaction = (
      e: CustomEvent<{ transactionId: string }>
    ) => {
      scrollToTransactionById(e.detail.transactionId);
    };

    window.addEventListener(
      "chat:openTransaction",
      handleOpenTransaction as EventListener
    );
    window.addEventListener(
      "chat:scrollToTransaction",
      handleScrollToTransaction as EventListener
    );
    window.addEventListener(
      "chat:highlightTransaction",
      handleHighlightTransaction as EventListener
    );

    return () => {
      window.removeEventListener(
        "chat:openTransaction",
        handleOpenTransaction as EventListener
      );
      window.removeEventListener(
        "chat:scrollToTransaction",
        handleScrollToTransaction as EventListener
      );
      window.removeEventListener(
        "chat:highlightTransaction",
        handleHighlightTransaction as EventListener
      );
    };
  }, [openTransactionById, scrollToTransactionById]);

  // Parse filters from URL
  const filters = useMemo(
    () => parseFiltersFromUrl(searchParams),
    [searchParams]
  );

  // Apply filters using the hook
  const filteredTransactions = useFilteredTransactions(
    transactions,
    filters,
    searchValue
  );

  // Update URL when filters change
  const handleFiltersChange = (newFilters: TransactionFilters) => {
    const url = buildFilterUrl("/transactions", newFilters);
    router.push(url);
  };

  // Compute pattern-based suggestions for unassigned transactions (instant, client-side)
  const patternSuggestions = useMemo(
    () => matchAllTransactionsByPattern(transactions, userPartners),
    [transactions, userPartners]
  );

  // Create columns with sources and partners lookup - must be before conditional returns
  const columns = useMemo(
    () => getTransactionColumns(sources, userPartners, globalPartners, patternSuggestions),
    [sources, userPartners, globalPartners, patternSuggestions]
  );

  const handleRowClick = (transaction: Transaction) => {
    onSelectTransaction(transaction);
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden bg-background">
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-background">
          <Skeleton className="h-9 w-[300px]" />
          <Skeleton className="h-9 w-[100px]" />
        </div>
        <div className="flex-1">
          {[...Array(15)].map((_, i) => (
            <div
              key={i}
              className="flex items-center space-x-4 px-4 py-3 border-b last:border-b-0"
            >
              <Skeleton className="h-4 w-[80px]" />
              <Skeleton className="h-4 w-[80px]" />
              <Skeleton className="h-4 w-[200px]" />
              <Skeleton className="h-4 w-[120px]" />
              <Skeleton className="h-4 w-[80px]" />
              <Skeleton className="h-4 w-[60px]" />
              <Skeleton className="h-4 w-[24px]" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-10">
        <p className="text-destructive mb-2">Error loading transactions</p>
        <p className="text-sm text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Fixed toolbar */}
      <TransactionToolbar
        searchValue={searchValue}
        onSearchChange={onSearchChange}
        filters={filters}
        onFiltersChange={handleFiltersChange}
      />

      {/* Scrollable table area */}
      <div className="flex-1 flex flex-col min-h-0">
        <TooltipProvider>
          <DataTable
            columns={columns}
            data={filteredTransactions}
            onRowClick={handleRowClick}
            selectedRowId={selectedTransactionId}
          />
        </TooltipProvider>
      </div>
    </div>
  );
}
