"use client";

import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X, Upload } from "lucide-react";
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
  const router = useRouter();

  return (
    <div className="flex items-center justify-between py-4 gap-4">
      <div className="flex items-center gap-2 flex-1">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search transactions..."
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 h-10"
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

      <Button onClick={() => router.push("/sources")} variant="outline" size="default">
        <Upload className="h-4 w-4 mr-2" />
        Import
      </Button>
    </div>
  );
}
