"use client";

import * as React from "react";
import { memo, forwardRef, useImperativeHandle } from "react";
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
import { TaxFile } from "@/types/file";

interface FilesDataTableProps {
  columns: ColumnDef<TaxFile, unknown>[];
  data: TaxFile[];
  onRowClick?: (row: TaxFile) => void;
  selectedRowId?: string | null;
}

export interface FilesDataTableHandle {
  scrollToIndex: (index: number) => void;
}

// Memoized row component to prevent unnecessary re-renders
interface VirtualRowProps {
  row: Row<TaxFile>;
  isSelected: boolean;
  hasConnections: boolean;
  onClick: (row: TaxFile) => void;
  virtualStart: number;
  virtualSize: number;
  columnWidths: string[];
}

const VirtualRow = memo(
  function VirtualRow({
    row,
    isSelected,
    hasConnections,
    onClick,
    virtualStart,
    virtualSize,
    columnWidths,
  }: VirtualRowProps) {
    const handleClick = React.useCallback(() => {
      onClick(row.original);
    }, [onClick, row.original]);

    return (
      <tr
        data-file-id={row.original.id}
        data-state={isSelected ? "selected" : undefined}
        onClick={handleClick}
        className={cn(
          "cursor-pointer transition-colors border-b hover:bg-muted/50",
          hasConnections &&
            !isSelected &&
            "bg-green-50/70 hover:bg-green-100/70 dark:bg-green-950/20 dark:hover:bg-green-950/30",
          isSelected && "bg-primary/10 hover:bg-primary/15"
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
            style={{ width: columnWidths[index], minWidth: columnWidths[index] }}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        ))}
      </tr>
    );
  },
  (prevProps, nextProps) => {
    // Compare all fields that affect rendering
    return (
      prevProps.row.id === nextProps.row.id &&
      prevProps.isSelected === nextProps.isSelected &&
      prevProps.hasConnections === nextProps.hasConnections &&
      prevProps.virtualStart === nextProps.virtualStart &&
      prevProps.virtualSize === nextProps.virtualSize &&
      prevProps.row.original.updatedAt === nextProps.row.original.updatedAt &&
      prevProps.row.original.transactionIds.length === nextProps.row.original.transactionIds.length &&
      prevProps.row.original.partnerId === nextProps.row.original.partnerId
    );
  }
);

function FilesDataTableInner(
  {
    columns,
    data,
    onRowClick,
    selectedRowId,
  }: FilesDataTableProps,
  ref: React.ForwardedRef<FilesDataTableHandle>
) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);

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
    estimateSize: () => 64,
    overscan: 10,
  });

  useImperativeHandle(ref, () => ({
    scrollToIndex: (index: number) => {
      virtualizer.scrollToIndex(index, { align: "center" });
    },
  }), [virtualizer]);

  // Column widths - Inv. Date, Amount, VAT%, Filename, Upload Date, Partner, Transactions
  const columnWidths = React.useMemo(() => ["110px", "90px", "55px", "190px", "115px", "140px", "100px"], []);

  const handleRowClick = React.useCallback((row: TaxFile) => {
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
        <thead className="sticky top-0 z-10 bg-muted">
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
              const hasConnections = row.original.transactionIds.length > 0;

              return (
                <VirtualRow
                  key={row.id}
                  row={row}
                  isSelected={selectedRowId === row.original.id}
                  hasConnections={hasConnections}
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
                No files found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export const FilesDataTable = forwardRef(FilesDataTableInner);
