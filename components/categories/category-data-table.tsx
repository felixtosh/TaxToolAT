"use client";

import { Tag, Sparkles, Receipt } from "lucide-react";
import { UserNoReceiptCategory } from "@/types/no-receipt-category";
import { cn } from "@/lib/utils";

interface CategoryDataTableProps {
  data: UserNoReceiptCategory[];
  onRowClick?: (category: UserNoReceiptCategory) => void;
  selectedRowId?: string | null;
}

export function CategoryDataTable({
  data,
  onRowClick,
  selectedRowId,
}: CategoryDataTableProps) {
  if (data.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        No categories found
      </div>
    );
  }

  return (
    <table className="w-full">
      <thead className="sticky top-0 bg-muted z-10">
        <tr className="border-b">
          <th className="h-10 px-4 text-left text-sm font-medium text-muted-foreground">
            Category
          </th>
          <th className="h-10 px-4 text-left text-sm font-medium text-muted-foreground w-[120px]">
            Patterns
          </th>
          <th className="h-10 px-4 text-left text-sm font-medium text-muted-foreground w-[120px]">
            Partners
          </th>
          <th className="h-10 px-4 text-left text-sm font-medium text-muted-foreground w-[120px]">
            Transactions
          </th>
        </tr>
      </thead>
      <tbody>
        {data.map((category) => (
          <tr
            key={category.id}
            data-category-id={category.id}
            onClick={() => onRowClick?.(category)}
            className={cn(
              "border-b cursor-pointer transition-colors hover:bg-muted/50",
              selectedRowId === category.id && "bg-primary/10"
            )}
          >
            <td className="px-4 py-3">
              <div className="flex items-start gap-3">
                <Tag className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{category.name}</p>
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {category.helperText}
                  </p>
                </div>
              </div>
            </td>
            <td className="px-4 py-3">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm">{category.learnedPatterns.length}</span>
              </div>
            </td>
            <td className="px-4 py-3">
              <span className="text-sm">{category.matchedPartnerIds.length}</span>
            </td>
            <td className="px-4 py-3">
              <div className="flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm">{category.transactionCount}</span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
