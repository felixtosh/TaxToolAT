"use client";

import * as React from "react";
import { Column } from "@tanstack/react-table";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SortableHeaderProps<TData, TValue> {
  column: Column<TData, TValue>;
  children: React.ReactNode;
  className?: string;
}

export function SortableHeader<TData, TValue>({
  column,
  children,
  className,
}: SortableHeaderProps<TData, TValue>) {
  const isSorted = column.getIsSorted();

  return (
    <Button
      variant="ghost"
      onClick={() => column.toggleSorting(isSorted === "asc")}
      className={cn(
        "h-8 -mx-2 px-2 w-[calc(100%+1rem)] justify-between font-medium",
        className
      )}
    >
      <span className="truncate">{children}</span>
      <span className="flex-shrink-0 ml-2">
        {isSorted === "asc" ? (
          <ArrowUp className="h-4 w-4" />
        ) : isSorted === "desc" ? (
          <ArrowDown className="h-4 w-4" />
        ) : (
          <ArrowUpDown className="h-4 w-4 text-muted-foreground/50" />
        )}
      </span>
    </Button>
  );
}
