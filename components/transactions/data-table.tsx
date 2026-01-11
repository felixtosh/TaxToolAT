"use client";

import * as React from "react";
import { forwardRef } from "react";
import { ColumnDef, SortingState } from "@tanstack/react-table";
import { Transaction } from "@/types/transaction";
import {
  ResizableDataTable,
  DataTableHandle,
} from "@/components/ui/data-table";

interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  onRowClick?: (row: TData) => void;
  selectedRowId?: string | null;
}

export type { DataTableHandle };

// Default column sizes for transaction table
const DEFAULT_TRANSACTION_COLUMN_SIZES: Record<string, number> = {
  date: 110,
  amount: 100,
  name: 220,
  assignedPartner: 240,
  file: 140,
  sourceId: 120,
};

// Default sorting - matches Firestore query orderBy("date", "desc")
const DEFAULT_SORTING: SortingState = [{ id: "date", desc: true }];

function DataTableInner<TData extends { id: string }>(
  { columns, data, onRowClick, selectedRowId }: DataTableProps<TData>,
  ref: React.ForwardedRef<DataTableHandle>
) {
  // Type guard to check if row is a transaction
  const isTransactionRow = (row: TData): row is TData & Transaction => {
    return "description" in row || "isComplete" in row;
  };

  // Get row className based on completion status
  const getRowClassName = React.useCallback(
    (row: TData, isSelected: boolean) => {
      if (isTransactionRow(row) && row.isComplete && !isSelected) {
        return "bg-green-50/70 hover:bg-green-100/70 dark:bg-green-950/20 dark:hover:bg-green-950/30";
      }
      return "";
    },
    []
  );

  // Get data attributes for row
  const getRowDataAttributes = React.useCallback((row: TData) => {
    return { "transaction-id": row.id };
  }, []);

  return (
    <ResizableDataTable
      ref={ref}
      columns={columns}
      data={data}
      onRowClick={onRowClick}
      selectedRowId={selectedRowId}
      defaultColumnSizes={DEFAULT_TRANSACTION_COLUMN_SIZES}
      initialSorting={DEFAULT_SORTING}
      getRowClassName={getRowClassName}
      getRowDataAttributes={getRowDataAttributes}
      emptyMessage="No transactions found."
    />
  );
}

// Export with forwardRef - using type assertion for generic component with ref
export const DataTable = forwardRef(DataTableInner) as <
  TData extends { id: string }
>(
  props: DataTableProps<TData> & { ref?: React.Ref<DataTableHandle> }
) => React.ReactElement;
