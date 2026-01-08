import { ColumnDef, Row } from "@tanstack/react-table";
import { ReactNode } from "react";

/**
 * Section definition for grouped data tables
 */
export interface DataTableSection<TData> {
  /** Unique section identifier */
  id: string;
  /** Section header content (ReactNode for flexibility) */
  title: ReactNode;
  /** Data items in this section */
  data: TData[];
  /** Optional className for the section header row */
  headerClassName?: string;
  /** Optional className for data rows in this section */
  rowClassName?: string;
}

export interface ResizableDataTableProps<TData extends { id: string }> {
  columns: ColumnDef<TData, unknown>[];
  /** Flat data array (use this OR sections, not both) */
  data?: TData[];
  /** Sectioned data with headers (use this OR data, not both) */
  sections?: DataTableSection<TData>[];
  onRowClick?: (row: TData) => void;
  selectedRowId?: string | null;
  defaultColumnSizes: Record<string, number>;
  minColumnWidth?: number;
  getRowClassName?: (row: TData, isSelected: boolean) => string;
  getRowDataAttributes?: (row: TData) => Record<string, string>;
  estimateRowSize?: number;
  /** Height for section header rows (default: 48) */
  sectionHeaderHeight?: number;
  overscan?: number;
  emptyMessage?: string;
}

export interface DataTableHandle {
  scrollToIndex: (index: number) => void;
}

export interface VirtualRowProps<TData extends { id: string }> {
  row: Row<TData>;
  isSelected: boolean;
  onClick: (row: TData) => void;
  virtualStart: number;
  virtualSize: number;
  columnSizes: number[];
  className?: string;
  dataAttributes?: Record<string, string>;
}
