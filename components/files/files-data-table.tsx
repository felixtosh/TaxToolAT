"use client";

import * as React from "react";
import { forwardRef, ReactNode } from "react";
import { ColumnDef, SortingState } from "@tanstack/react-table";
import { TaxFile } from "@/types/file";
import {
  ResizableDataTable,
  DataTableHandle,
} from "@/components/ui/data-table";

interface FilesDataTableProps {
  columns: ColumnDef<TaxFile, unknown>[];
  data: TaxFile[];
  onRowClick?: (row: TaxFile) => void;
  selectedRowId?: string | null;
  // Multi-select props
  enableMultiSelect?: boolean;
  selectedRowIds?: Set<string>;
  onSelectionChange?: (selectedIds: Set<string>) => void;
  /** Custom empty state component */
  emptyState?: ReactNode;
}

export interface FilesDataTableHandle {
  scrollToIndex: (index: number) => void;
}

// Default column sizes for files table
const DEFAULT_FILE_COLUMN_SIZES: Record<string, number> = {
  extractedDate: 110,
  extractedAmount: 90,
  extractedVatPercent: 55,
  fileName: 190,
  sourceType: 80,
  uploadedAt: 115,
  assignedPartner: 140,
  connections: 100,
};

// Default sorting - matches Firestore query orderBy("uploadedAt", "desc")
const DEFAULT_SORTING: SortingState = [{ id: "uploadedAt", desc: true }];

function FilesDataTableInner(
  {
    columns,
    data,
    onRowClick,
    selectedRowId,
    enableMultiSelect,
    selectedRowIds,
    onSelectionChange,
    emptyState,
  }: FilesDataTableProps,
  ref: React.ForwardedRef<FilesDataTableHandle>
) {
  // Get row className based on status
  const getRowClassName = React.useCallback(
    (row: TaxFile, isSelected: boolean) => {
      // Deleted files - strikethrough and faded (keep even when selected)
      if (row.deletedAt) {
        return "opacity-50 line-through";
      }

      // Not invoice files - greyed out but preserve selection state
      if (row.isNotInvoice && !isSelected) {
        return "opacity-60 bg-gray-50/50 dark:bg-gray-900/30";
      }
      if (row.isNotInvoice && isSelected) {
        return "opacity-75"; // Slightly faded but keep selected bg
      }

      // Connected files - green highlight
      const hasConnections = row.transactionIds.length > 0;
      if (hasConnections && !isSelected) {
        return "bg-green-50/70 hover:bg-green-100/70 dark:bg-green-950/20 dark:hover:bg-green-950/30";
      }

      return "";
    },
    []
  );

  // Get data attributes for row
  const getRowDataAttributes = React.useCallback((row: TaxFile) => {
    return { "file-id": row.id };
  }, []);

  return (
    <ResizableDataTable
      ref={ref as React.Ref<DataTableHandle>}
      columns={columns}
      data={data}
      onRowClick={onRowClick}
      selectedRowId={selectedRowId}
      defaultColumnSizes={DEFAULT_FILE_COLUMN_SIZES}
      initialSorting={DEFAULT_SORTING}
      getRowClassName={getRowClassName}
      getRowDataAttributes={getRowDataAttributes}
      emptyState={emptyState}
      emptyMessage="No files found."
      enableMultiSelect={enableMultiSelect}
      selectedRowIds={selectedRowIds}
      onSelectionChange={onSelectionChange}
    />
  );
}

export const FilesDataTable = forwardRef(FilesDataTableInner);
