"use client";

import { TransactionSource } from "@/types/source";
import { SourceCard } from "./source-card";
import { Skeleton } from "@/components/ui/skeleton";

interface SourceListProps {
  sources: TransactionSource[];
  loading: boolean;
  onSourceClick: (source: TransactionSource) => void;
  onImportClick: (source: TransactionSource) => void;
  onConnectClick: (source: TransactionSource) => void;
}

export function SourceList({
  sources,
  loading,
  onSourceClick,
  onImportClick,
  onConnectClick,
}: SourceListProps) {
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="p-6 border rounded-lg">
            <Skeleton className="h-5 w-32 mb-2" />
            <Skeleton className="h-4 w-48 mb-4" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    );
  }

  if (sources.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg bg-muted/30">
        <p className="text-muted-foreground mb-2">No bank accounts added yet</p>
        <p className="text-sm text-muted-foreground">
          Add a bank account to start importing transactions
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {sources.map((source) => (
        <SourceCard
          key={source.id}
          source={source}
          onClick={() => onSourceClick(source)}
          onImportClick={() => onImportClick(source)}
          onConnectClick={() => onConnectClick(source)}
        />
      ))}
    </div>
  );
}
