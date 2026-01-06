"use client";

import { useMemo, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransactions } from "@/hooks/use-transactions";
import { useSources } from "@/hooks/use-sources";
import { useFilteredTransactions } from "@/hooks/use-filtered-transactions";
import { parseFiltersFromUrl, buildFilterUrl } from "@/lib/filters/url-params";
import { matchAllTransactionsByPattern } from "@/lib/matching";
import { DataTable, DataTableHandle } from "./data-table";
import { getTransactionColumns } from "./transaction-columns";
import { TransactionToolbar } from "./transaction-toolbar";
import { Transaction, TransactionFilters } from "@/types/transaction";
import { UserPartner, GlobalPartner } from "@/types/partner";
import { TooltipProvider } from "@/components/ui/tooltip";

interface TransactionTableProps {
  onSelectTransaction: (transaction: Transaction) => void;
  selectedTransactionId: string | null;
  searchValue: string;
  onSearchChange: (value: string) => void;
  userPartners?: UserPartner[];
  globalPartners?: GlobalPartner[];
  tableRef?: React.RefObject<DataTableHandle | null>;
}

export function TransactionTable({
  onSelectTransaction,
  selectedTransactionId,
  searchValue,
  onSearchChange,
  userPartners = [],
  globalPartners = [],
  tableRef: externalTableRef,
}: TransactionTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { transactions, loading, error } = useTransactions();
  const { sources } = useSources();

  // Internal ref for DataTable, use external if provided
  const internalTableRef = useRef<DataTableHandle>(null);
  const tableRef = externalTableRef || internalTableRef;

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

  // Scroll to and highlight a transaction by ID (uses virtualizer for off-screen items)
  const scrollToTransactionById = useCallback((transactionId: string) => {
    // Find the index in filtered transactions (what's displayed in the table)
    const index = filteredTransactions.findIndex((t) => t.id === transactionId);
    if (index !== -1) {
      // Use virtualizer to scroll first (ensures row is rendered)
      tableRef.current?.scrollToIndex(index);

      // Then highlight after a short delay for the row to render
      setTimeout(() => {
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
      }, 50);
    }
  }, [filteredTransactions, tableRef]);

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
            ref={tableRef}
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
