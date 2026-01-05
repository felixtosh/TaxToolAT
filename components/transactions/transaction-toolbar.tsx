"use client";

import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import { TransactionFiltersPopover } from "./transaction-filters";
import { TransactionFilters } from "@/types/transaction";

interface TransactionToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  filters: TransactionFilters;
  onFiltersChange: (filters: TransactionFilters) => void;
  importFileName?: string;
}

export function TransactionToolbar({
  searchValue,
  onSearchChange,
  filters,
  onFiltersChange,
  importFileName,
}: TransactionToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b bg-background">
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search transactions..."
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 h-9"
        />
        {searchValue && (
          <button
            onClick={() => onSearchChange("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 hover:bg-muted rounded p-0.5"
          >
            <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>

      <TransactionFiltersPopover
        filters={filters}
        onFiltersChange={onFiltersChange}
        importFileName={importFileName}
      />
    </div>
  );
}
