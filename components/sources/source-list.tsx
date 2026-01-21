"use client";

import { Building2, Link2, Plus } from "lucide-react";
import { TransactionSource } from "@/types/source";
import { SourceCard } from "./source-card";
import { Skeleton } from "@/components/ui/skeleton";
import { TableEmptyState } from "@/components/ui/table-empty-state";

interface SourceListProps {
  sources: TransactionSource[];
  loading: boolean;
  onSourceClick: (source: TransactionSource) => void;
  onImportClick: (source: TransactionSource) => void;
  onConnectClick?: () => void;
  onAddManualClick?: () => void;
}

export function SourceList({
  sources,
  loading,
  onSourceClick,
  onImportClick,
  onConnectClick,
  onAddManualClick,
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
      <TableEmptyState
        icon={<Building2 className="h-full w-full" />}
        title="No bank accounts yet"
        description="Connect a bank account to automatically sync transactions, or add one manually to import CSV files."
        action={{
          label: "Connect Bank",
          onClick: () => onConnectClick?.(),
          icon: <Link2 className="h-4 w-4" />,
          dataAttributes: { onboarding: "connect-bank" },
        }}
        secondaryAction={{
          label: "Add Manual",
          onClick: () => onAddManualClick?.(),
          icon: <Plus className="h-4 w-4" />,
          dataAttributes: { onboarding: "add-account" },
        }}
        size="lg"
      />
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
        />
      ))}
    </div>
  );
}
