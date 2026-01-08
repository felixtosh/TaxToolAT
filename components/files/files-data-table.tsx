"use client";

import * as React from "react";
import { forwardRef } from "react";
import { ColumnDef } from "@tanstack/react-table";
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
  uploadedAt: 115,
  assignedPartner: 140,
  connections: 100,
};

function FilesDataTableInner(
  { columns, data, onRowClick, selectedRowId }: FilesDataTableProps,
  ref: React.ForwardedRef<FilesDataTableHandle>
) {
  // Get row className based on connections
  const getRowClassName = React.useCallback(
    (row: TaxFile, isSelected: boolean) => {
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
      getRowClassName={getRowClassName}
      getRowDataAttributes={getRowDataAttributes}
      emptyMessage="No files found."
    />
  );
}

export const FilesDataTable = forwardRef(FilesDataTableInner);
