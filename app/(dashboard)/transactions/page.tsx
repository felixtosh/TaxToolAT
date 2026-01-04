"use client";

import { Suspense } from "react";
import { TransactionTable } from "@/components/transactions/transaction-table";
import { Skeleton } from "@/components/ui/skeleton";

function TransactionTableFallback() {
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

export default function TransactionsPage() {
  return (
    <Suspense fallback={<TransactionTableFallback />}>
      <TransactionTable />
    </Suspense>
  );
}
