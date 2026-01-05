"use client";

import * as React from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Transaction } from "@/types/transaction";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  onRowClick?: (row: TData) => void;
  selectedRowId?: string | null;
}

export function DataTable<TData extends { id: string }, TValue>({
  columns,
  data,
  onRowClick,
  selectedRowId,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      sorting,
      columnFilters,
    },
  });

  // Type guard to check if row has receipt info
  const isTransactionRow = (row: TData): row is TData & Transaction => {
    return "receiptIds" in row && "description" in row;
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-card">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent border-b">
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} className="h-10 bg-muted/50 first:pl-4 last:pr-4">
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => {
              const original = row.original;
              const isComplete =
                isTransactionRow(original) &&
                original.receiptIds.length > 0 &&
                !!original.description;

              return (
                <TableRow
                  key={row.id}
                  data-transaction-id={original.id}
                  data-state={
                    selectedRowId === original.id ? "selected" : undefined
                  }
                  onClick={() => onRowClick?.(original)}
                  className={cn(
                    "cursor-pointer transition-colors",
                    isComplete &&
                      "bg-green-50/70 hover:bg-green-100/70 dark:bg-green-950/20 dark:hover:bg-green-950/30",
                    selectedRowId === original.id && "bg-primary/10"
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-2.5 first:pl-4 last:pr-4">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No transactions found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
