"use client";

import { Suspense } from "react";
import { UsageDashboard } from "@/components/admin";
import { Skeleton } from "@/components/ui/skeleton";

function UsageFallback() {
  return (
    <div className="h-full flex flex-col overflow-hidden bg-card">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <Skeleton className="h-6 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-20" />
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-[100px]" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-[320px]" />
          <Skeleton className="h-[320px]" />
        </div>
        <Skeleton className="h-[200px]" />
        <Skeleton className="h-[300px]" />
      </div>
    </div>
  );
}

export default function AdminUsagePage() {
  return (
    <Suspense fallback={<UsageFallback />}>
      <UsageDashboard />
    </Suspense>
  );
}
