"use client";

import { useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransactions } from "@/hooks/use-transactions";
import { useSources } from "@/hooks/use-sources";
import { useFilteredTransactions } from "@/hooks/use-filtered-transactions";
import { parseFiltersFromUrl, buildFilterUrl } from "@/lib/filters/url-params";
import { DataTable } from "./data-table";
import { getTransactionColumns } from "./transaction-columns";
import { TransactionToolbar } from "./transaction-toolbar";
import { TransactionDetailSheet } from "@/components/sidebar/transaction-detail-sheet";
import { Transaction, TransactionFilters } from "@/types/transaction";
import { Skeleton } from "@/components/ui/skeleton";

export function TransactionTable() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [searchValue, setSearchValue] = useState("");
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const { transactions, loading, error, updateTransaction } =
    useTransactions();
  const { sources } = useSources();

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

  // Create columns with sources lookup - must be before conditional returns
  const columns = useMemo(() => getTransactionColumns(sources), [sources]);

  const handleRowClick = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setIsSheetOpen(true);
  };

  const handleSheetClose = () => {
    setIsSheetOpen(false);
    setTimeout(() => setSelectedTransaction(null), 300);
  };

  const handleTransactionUpdate = async (updates: Partial<Transaction>) => {
    if (!selectedTransaction) return;
    await updateTransaction(selectedTransaction.id, updates);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between py-4">
          <Skeleton className="h-10 w-[300px]" />
          <Skeleton className="h-10 w-[150px]" />
        </div>
        <div className="rounded-lg border bg-card">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="flex items-center space-x-4 p-4 border-b last:border-b-0"
            >
              <Skeleton className="h-4 w-[100px]" />
              <Skeleton className="h-4 w-[200px]" />
              <Skeleton className="h-4 w-[150px]" />
              <Skeleton className="h-4 w-[100px]" />
              <Skeleton className="h-4 w-[80px]" />
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
    <>
      <TransactionToolbar
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        filters={filters}
        onFiltersChange={handleFiltersChange}
      />

      <DataTable
        columns={columns}
        data={filteredTransactions}
        onRowClick={handleRowClick}
        selectedRowId={selectedTransaction?.id}
      />

      <TransactionDetailSheet
        transaction={selectedTransaction}
        source={
          selectedTransaction
            ? sources.find((s) => s.id === selectedTransaction.sourceId)
            : undefined
        }
        open={isSheetOpen}
        onClose={handleSheetClose}
        onUpdate={handleTransactionUpdate}
      />
    </>
  );
}
