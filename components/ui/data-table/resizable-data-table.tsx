"use client";

import * as React from "react";
import { forwardRef, useImperativeHandle, useDeferredValue } from "react";
import {
  ColumnFiltersState,
  SortingState,
  ColumnSizingState,
  Header,
  Row,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import { ResizableDataTableProps, DataTableHandle, DataTableSection } from "./types";
import { ResizeHandle } from "./resize-handle";
import { VirtualRow } from "./virtual-row";

const DEFAULT_MIN_COLUMN_WIDTH = 60;
const DEFAULT_ESTIMATE_ROW_SIZE = 64;
const DEFAULT_SECTION_HEADER_HEIGHT = 48;
const DEFAULT_OVERSCAN = 10;

/**
 * Virtual list item - either a section header or a data row
 */
type VirtualItem<TData> =
  | { type: "header"; sectionId: string; title: React.ReactNode; className?: string }
  | { type: "row"; data: TData; sectionId: string; rowClassName?: string };

function ResizableDataTableInner<TData extends { id: string }>(
  {
    columns,
    data,
    sections,
    onRowClick,
    selectedRowId,
    defaultColumnSizes,
    minColumnWidth = DEFAULT_MIN_COLUMN_WIDTH,
    getRowClassName,
    getRowDataAttributes,
    estimateRowSize = DEFAULT_ESTIMATE_ROW_SIZE,
    sectionHeaderHeight = DEFAULT_SECTION_HEADER_HEIGHT,
    overscan = DEFAULT_OVERSCAN,
    emptyMessage = "No data found.",
  }: ResizableDataTableProps<TData>,
  ref: React.ForwardedRef<DataTableHandle>
) {
  // Build virtual items list from sections or flat data
  const { virtualItems, flatData, itemToRowIndex } = React.useMemo(() => {
    const items: VirtualItem<TData>[] = [];
    const allData: TData[] = [];
    const indexMap = new Map<number, number>(); // virtualIndex -> rowIndex

    if (sections && sections.length > 0) {
      let rowIndex = 0;
      sections.forEach((section) => {
        // Only add header if section has data
        if (section.data.length > 0) {
          items.push({
            type: "header",
            sectionId: section.id,
            title: section.title,
            className: section.headerClassName,
          });
          section.data.forEach((item) => {
            const virtualIndex = items.length;
            indexMap.set(virtualIndex, rowIndex);
            items.push({
              type: "row",
              data: item,
              sectionId: section.id,
              rowClassName: section.rowClassName,
            });
            allData.push(item);
            rowIndex++;
          });
        }
      });
    } else if (data) {
      data.forEach((item, index) => {
        indexMap.set(index, index);
        items.push({ type: "row", data: item, sectionId: "default" });
        allData.push(item);
      });
    }

    return { virtualItems: items, flatData: allData, itemToRowIndex: indexMap };
  }, [sections, data]);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>({});
  // Track which columns have been manually resized by user
  const [userResizedColumns, setUserResizedColumns] = React.useState<
    Set<string>
  >(new Set());
  // Container width for proportional scaling
  const [containerWidth, setContainerWidth] = React.useState<number | null>(
    null
  );
  // Flag to track if we're auto-scaling (to avoid marking as user-resized)
  const isAutoScalingRef = React.useRef(false);

  const table = useReactTable({
    data: flatData,
    columns,
    defaultColumn: {
      minSize: minColumnWidth,
      size: 150,
    },
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    onColumnSizingChange: (updater) => {
      const newSizing =
        typeof updater === "function" ? updater(columnSizing) : updater;
      setColumnSizing(newSizing);
      // Only mark as user-resized if not auto-scaling
      if (!isAutoScalingRef.current) {
        const changedColumns = Object.keys(newSizing).filter(
          (colId) => newSizing[colId] !== columnSizing[colId]
        );
        if (changedColumns.length > 0) {
          setUserResizedColumns((prev) => {
            const next = new Set(prev);
            changedColumns.forEach((col) => next.add(col));
            return next;
          });
        }
      }
    },
    columnResizeMode: "onChange",
    state: {
      sorting,
      columnFilters,
      columnSizing,
    },
  });

  const parentRef = React.useRef<HTMLDivElement>(null);
  const rows = table.getRowModel().rows;

  // Create a map from data id to row for quick lookup
  const rowByIdMap = React.useMemo(() => {
    const map = new Map<string, Row<TData>>();
    rows.forEach((row) => {
      map.set(row.original.id, row);
    });
    return map;
  }, [rows]);

  const virtualizer = useVirtualizer({
    count: virtualItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const item = virtualItems[index];
      return item?.type === "header" ? sectionHeaderHeight : estimateRowSize;
    },
    overscan,
  });

  // Defer total size to avoid flushSync warning during render
  const totalSize = useDeferredValue(virtualizer.getTotalSize());

  // Expose scrollToIndex method via ref
  useImperativeHandle(
    ref,
    () => ({
      scrollToIndex: (index: number) => {
        virtualizer.scrollToIndex(index, { align: "center" });
      },
    }),
    [virtualizer]
  );

  // Get column sizes from table state, using defaults
  const columnSizes = React.useMemo(() => {
    return table.getAllColumns().map((col) => {
      const defaultSize = defaultColumnSizes[col.id] || 150;
      return columnSizing[col.id] ?? defaultSize;
    });
  }, [table, columnSizing, defaultColumnSizes]);

  // Calculate total table width
  const totalTableWidth = columnSizes.reduce((sum, w) => sum + w, 0);

  // Observe container width changes (debounced - only after resize ends)
  React.useEffect(() => {
    if (!parentRef.current) return;

    let resizeTimeout: NodeJS.Timeout | null = null;

    const observer = new ResizeObserver((entries) => {
      // Debounce - wait for resize to settle
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        const entry = entries[0];
        if (entry) {
          setContainerWidth(entry.contentRect.width);
        }
      }, 150); // Wait 150ms after last resize event
    });

    observer.observe(parentRef.current);
    // Set initial width
    setContainerWidth(parentRef.current.clientWidth);

    return () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      observer.disconnect();
    };
  }, []);

  // Track previous container width to detect actual container resizes
  const prevContainerWidthRef = React.useRef<number | null>(null);

  // Auto-scale columns proportionally when container size changes (not on column resize)
  React.useEffect(() => {
    if (containerWidth === null) return;

    // Skip if this is not a container resize (first render or same width)
    const isFirstRender = prevContainerWidthRef.current === null;
    const containerSizeChanged = prevContainerWidthRef.current !== containerWidth;
    prevContainerWidthRef.current = containerWidth;

    // Only auto-scale on actual container resize, not on initial render with existing sizes
    if (!containerSizeChanged && !isFirstRender) return;

    const allColumns = table.getAllColumns();

    // Calculate default total width
    const defaultTotalWidth = allColumns.reduce((sum, col) => {
      return sum + (defaultColumnSizes[col.id] || 150);
    }, 0);

    // Only scale if container is larger than default total
    if (containerWidth <= defaultTotalWidth) return;

    // Calculate scale factor
    const scaleFactor = containerWidth / defaultTotalWidth;

    // Build new column sizes - scale all columns proportionally
    const newSizing: ColumnSizingState = {};
    allColumns.forEach((col) => {
      const defaultSize = defaultColumnSizes[col.id] || 150;
      newSizing[col.id] = Math.round(defaultSize * scaleFactor);
    });

    // Set flag to prevent marking these as user-resized
    isAutoScalingRef.current = true;
    setColumnSizing(newSizing);
    // Also clear user-resized set on container resize
    setUserResizedColumns(new Set());
    // Reset flag after state update
    requestAnimationFrame(() => {
      isAutoScalingRef.current = false;
    });
  }, [containerWidth, table, defaultColumnSizes]);

  // Get column size helper
  const getColumnSize = React.useCallback(
    (colId: string) => {
      return columnSizing[colId] ?? (defaultColumnSizes[colId] || 150);
    },
    [columnSizing, defaultColumnSizes]
  );

  // Get last column ID
  const lastColumnId = React.useMemo(() => {
    const allColumns = table.getAllColumns();
    return allColumns[allColumns.length - 1]?.id || "";
  }, [table]);

  // Reset column to default size (and adjust last column to compensate)
  const resetColumnToDefault = React.useCallback(
    (columnId: string) => {
      const defaultSize = defaultColumnSizes[columnId] || 150;
      const currentSize = columnSizing[columnId] ?? defaultSize;
      const delta = currentSize - defaultSize;

      if (columnId === lastColumnId) {
        // If resetting last column, just set to default
        setColumnSizing((prev) => ({
          ...prev,
          [columnId]: defaultSize,
        }));
      } else {
        // Adjust last column to compensate
        const lastColCurrentSize =
          columnSizing[lastColumnId] ?? (defaultColumnSizes[lastColumnId] || 150);
        setColumnSizing((prev) => ({
          ...prev,
          [columnId]: defaultSize,
          [lastColumnId]: lastColCurrentSize + delta,
        }));
      }
      // Remove from user-resized set
      setUserResizedColumns((prev) => {
        const next = new Set(prev);
        next.delete(columnId);
        return next;
      });
    },
    [columnSizing, lastColumnId, defaultColumnSizes]
  );

  // Stable click handler
  const handleRowClick = React.useCallback(
    (row: TData) => {
      onRowClick?.(row);
    },
    [onRowClick]
  );

  return (
    <div ref={parentRef} className="flex-1 overflow-auto">
      <table
        className="border-collapse"
        style={{ width: totalTableWidth, tableLayout: "fixed" }}
      >
        <colgroup>
          {table.getAllColumns().map((col, i) => (
            <col key={col.id} style={{ width: columnSizes[i] }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-muted">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b">
              {headerGroup.headers.map((header, index) => (
                <th
                  key={header.id}
                  className={cn(
                    "h-10 px-2 text-left text-sm font-medium text-muted-foreground relative",
                    index === 0 && "pl-4",
                    index === headerGroup.headers.length - 1 && "pr-4"
                  )}
                  style={{ width: columnSizes[index] }}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                  {/* Custom resize handle with double-click reset */}
                  {header.column.getCanResize() && (
                    <ResizeHandle
                      header={header as Header<unknown, unknown>}
                      onResetToDefault={() => resetColumnToDefault(header.column.id)}
                      lastColumnId={lastColumnId}
                      getColumnSize={getColumnSize}
                      minColumnWidth={minColumnWidth}
                    />
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="relative" style={{ height: totalSize }}>
          {virtualItems.length ? (
            virtualizer.getVirtualItems().map((virtualRow) => {
              const item = virtualItems[virtualRow.index];

              // Render section header
              if (item.type === "header") {
                return (
                  <tr
                    key={`header-${item.sectionId}`}
                    className={cn("hover:bg-transparent", item.className)}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <td
                      colSpan={columns.length}
                      className="py-3 px-4"
                      style={{ width: totalTableWidth }}
                    >
                      {item.title}
                    </td>
                  </tr>
                );
              }

              // Render data row
              const row = rowByIdMap.get(item.data.id);
              if (!row) return null;

              const original = row.original;
              const isSelected = selectedRowId === original.id;
              const baseClassName = getRowClassName?.(original, isSelected);
              const sectionClassName = item.rowClassName;
              const combinedClassName = cn(baseClassName, sectionClassName);
              const dataAttributes = getRowDataAttributes?.(original);

              return (
                <VirtualRow
                  key={row.id}
                  row={row}
                  isSelected={isSelected}
                  onClick={handleRowClick}
                  virtualStart={virtualRow.start}
                  virtualSize={virtualRow.size}
                  columnSizes={columnSizes}
                  className={combinedClassName}
                  dataAttributes={dataAttributes}
                />
              );
            })
          ) : (
            <tr>
              <td colSpan={columns.length} className="h-24 text-center">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// Export with forwardRef - using type assertion for generic component with ref
export const ResizableDataTable = forwardRef(ResizableDataTableInner) as <
  TData extends { id: string }
>(
  props: ResizableDataTableProps<TData> & { ref?: React.Ref<DataTableHandle> }
) => React.ReactElement;
