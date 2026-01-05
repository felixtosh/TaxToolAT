"use client";

import * as React from "react";
import { memo } from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  Row,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import { Transaction } from "@/types/transaction";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  onRowClick?: (row: TData) => void;
  selectedRowId?: string | null;
}

// Memoized row component to prevent unnecessary re-renders
interface VirtualRowProps<TData extends { id: string }> {
  row: Row<TData>;
  isSelected: boolean;
  isComplete: boolean;
  onClick: (row: TData) => void;
  virtualStart: number;
  virtualSize: number;
  columnWidths: string[];
}

const VirtualRow = memo(
  function VirtualRow<TData extends { id: string }>({
    row,
    isSelected,
    isComplete,
    onClick,
    virtualStart,
    virtualSize,
    columnWidths,
  }: VirtualRowProps<TData>) {
    const handleClick = React.useCallback(() => {
      onClick(row.original);
    }, [onClick, row.original]);

    return (
      <tr
        data-transaction-id={row.original.id}
        data-state={isSelected ? "selected" : undefined}
        onClick={handleClick}
        className={cn(
          "cursor-pointer transition-colors border-b hover:bg-muted/50",
          isComplete &&
            "bg-green-50/70 hover:bg-green-100/70 dark:bg-green-950/20 dark:hover:bg-green-950/30",
          isSelected && "bg-primary/10"
        )}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          minWidth: "800px",
          height: virtualSize,
          transform: `translateY(${virtualStart}px)`,
          display: "table",
          tableLayout: "fixed",
        }}
      >
        {row.getVisibleCells().map((cell, index) => (
          <td
            key={cell.id}
            className={cn(
              "px-2 py-2.5",
              index === 0 && "pl-4",
              index === row.getVisibleCells().length - 1 && "pr-4"
            )}
            style={{ width: columnWidths[index] }}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        ))}
      </tr>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison - re-render if row data, selection, or position changes
    const prevOriginal = prevProps.row.original as Record<string, unknown>;
    const nextOriginal = nextProps.row.original as Record<string, unknown>;
    return (
      prevProps.row.id === nextProps.row.id &&
      prevProps.isSelected === nextProps.isSelected &&
      prevProps.isComplete === nextProps.isComplete &&
      prevProps.virtualStart === nextProps.virtualStart &&
      prevProps.virtualSize === nextProps.virtualSize &&
      // Check if row data changed (partnerId, updatedAt, etc.)
      prevOriginal.partnerId === nextOriginal.partnerId &&
      prevOriginal.updatedAt === nextOriginal.updatedAt
    );
  }
) as <TData extends { id: string }>(props: VirtualRowProps<TData>) => React.ReactElement;

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

  const parentRef = React.useRef<HTMLDivElement>(null);
  const rows = table.getRowModel().rows;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64, // Two lines of text + padding
    overscan: 10,
  });

  // Type guard to check if row has receipt info
  const isTransactionRow = (row: TData): row is TData & Transaction => {
    return "receiptIds" in row && "description" in row;
  };

  // Column min-widths - must match the number of columns (memoized to prevent re-renders)
  const columnWidths = React.useMemo(() => ["110px", "220px", "110px", "180px", "50px", "130px"], []);

  // Stable click handler
  const handleRowClick = React.useCallback((row: TData) => {
    onRowClick?.(row);
  }, [onRowClick]);

  return (
    <div ref={parentRef} className="flex-1 overflow-auto">
      <table className="w-full border-collapse min-w-[800px]" style={{ tableLayout: "fixed" }}>
        <colgroup>
          {columnWidths.map((width, i) => (
            <col key={i} style={{ width }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-muted/50">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b">
              {headerGroup.headers.map((header, index) => (
                <th
                  key={header.id}
                  className={cn(
                    "h-10 px-2 text-left text-sm font-medium text-muted-foreground",
                    index === 0 && "pl-4",
                    index === headerGroup.headers.length - 1 && "pr-4"
                  )}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="relative" style={{ height: virtualizer.getTotalSize() }}>
          {rows.length ? (
            virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];
              const original = row.original;
              const isComplete =
                isTransactionRow(original) &&
                original.receiptIds.length > 0 &&
                !!original.description;

              return (
                <VirtualRow
                  key={row.id}
                  row={row}
                  isSelected={selectedRowId === original.id}
                  isComplete={isComplete}
                  onClick={handleRowClick}
                  virtualStart={virtualRow.start}
                  virtualSize={virtualRow.size}
                  columnWidths={columnWidths}
                />
              );
            })
          ) : (
            <tr>
              <td colSpan={columns.length} className="h-24 text-center">
                No transactions found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
