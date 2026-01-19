"use client";

import { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
// Note: SortableHeader expects `children` prop instead of `title`
import { SortableHeader } from "@/components/ui/data-table/sortable-header";
import { cn } from "@/lib/utils";

// ============================================================================
// DATE COLUMN
// ============================================================================

interface DateColumnOptions<TData> {
  /** Column header text */
  header?: string;
  /** Accessor function to get the date value */
  accessor: (row: TData) => Date | null | undefined;
  /** Column ID (default: "date") */
  id?: string;
  /** Show time if not midnight (default: true) */
  showTime?: boolean;
  /** Default width */
  size?: number;
  /** Enable sorting (default: true) */
  sortable?: boolean;
}

/**
 * Creates a date column with consistent formatting.
 * Shows time only if it's not midnight (00:00).
 *
 * @example
 * const columns = [
 *   dateColumn({
 *     accessor: (row) => row.date ? new Date(row.date) : null,
 *   }),
 * ];
 */
export function dateColumn<TData>({
  header = "Date",
  accessor,
  id = "date",
  showTime = true,
  size = 100,
  sortable = true,
}: DateColumnOptions<TData>): ColumnDef<TData> {
  return {
    id,
    accessorFn: (row) => accessor(row),
    header: sortable
      ? ({ column }) => <SortableHeader column={column}>{header}</SortableHeader>
      : header,
    cell: ({ row }) => {
      const date = accessor(row.original);
      if (!date) return <span className="text-muted-foreground">—</span>;

      const dateStr = format(date, "MMM d");
      const timeStr = format(date, "HH:mm");
      const showTimeDisplay = showTime && timeStr !== "00:00";

      return (
        <div className="text-sm text-muted-foreground">
          {dateStr}
          {showTimeDisplay && (
            <span className="text-xs ml-1 opacity-60">{timeStr}</span>
          )}
        </div>
      );
    },
    size,
    sortingFn: "datetime",
  };
}

// ============================================================================
// CURRENCY AMOUNT COLUMN
// ============================================================================

interface CurrencyColumnOptions<TData> {
  /** Column header text */
  header?: string;
  /** Accessor function to get the amount in cents */
  amountAccessor: (row: TData) => number | null | undefined;
  /** Accessor function to get the currency code (default: "EUR") */
  currencyAccessor?: (row: TData) => string;
  /** Column ID (default: "amount") */
  id?: string;
  /** Default width */
  size?: number;
  /** Enable sorting (default: true) */
  sortable?: boolean;
  /** Show colors (red for negative, green for positive) */
  colorize?: boolean;
  /** Locale for formatting (default: "de-DE") */
  locale?: string;
}

/**
 * Creates a currency amount column with consistent formatting.
 * Amounts are expected in cents and converted to decimal display.
 *
 * @example
 * const columns = [
 *   currencyColumn({
 *     amountAccessor: (row) => row.amountCents,
 *     currencyAccessor: (row) => row.currency || "EUR",
 *     colorize: true,
 *   }),
 * ];
 */
export function currencyColumn<TData>({
  header = "Amount",
  amountAccessor,
  currencyAccessor = () => "EUR",
  id = "amount",
  size = 100,
  sortable = true,
  colorize = true,
  locale = "de-DE",
}: CurrencyColumnOptions<TData>): ColumnDef<TData> {
  return {
    id,
    accessorFn: (row) => amountAccessor(row),
    header: sortable
      ? ({ column }) => <SortableHeader column={column}>{header}</SortableHeader>
      : header,
    cell: ({ row }) => {
      const amount = amountAccessor(row.original);
      if (amount === null || amount === undefined) {
        return <span className="text-muted-foreground">—</span>;
      }

      const currency = currencyAccessor(row.original);
      const formatted = new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
      }).format(Math.abs(amount) / 100);

      const isNegative = amount < 0;
      const colorClass = colorize
        ? isNegative
          ? "text-red-600"
          : "text-green-600"
        : "";

      return (
        <span className={cn("text-sm tabular-nums font-medium", colorClass)}>
          {isNegative ? "-" : "+"}
          {formatted}
        </span>
      );
    },
    size,
    sortingFn: "basic",
  };
}

// ============================================================================
// TEXT COLUMN
// ============================================================================

interface TextColumnOptions<TData> {
  /** Column header text */
  header: string;
  /** Accessor function to get the text value */
  accessor: (row: TData) => string | null | undefined;
  /** Column ID */
  id: string;
  /** Default width */
  size?: number;
  /** Enable sorting (default: true) */
  sortable?: boolean;
  /** Truncate text with ellipsis */
  truncate?: boolean;
  /** Muted text styling */
  muted?: boolean;
  /** Custom cell renderer */
  cell?: (value: string | null | undefined, row: TData) => React.ReactNode;
}

/**
 * Creates a simple text column.
 *
 * @example
 * const columns = [
 *   textColumn({
 *     id: "description",
 *     header: "Description",
 *     accessor: (row) => row.description,
 *     truncate: true,
 *   }),
 * ];
 */
export function textColumn<TData>({
  header,
  accessor,
  id,
  size = 150,
  sortable = true,
  truncate = false,
  muted = false,
  cell: customCell,
}: TextColumnOptions<TData>): ColumnDef<TData> {
  return {
    id,
    accessorFn: (row) => accessor(row),
    header: sortable
      ? ({ column }) => <SortableHeader column={column}>{header}</SortableHeader>
      : header,
    cell: ({ row }) => {
      const value = accessor(row.original);

      if (customCell) {
        return customCell(value, row.original);
      }

      if (!value) {
        return <span className="text-muted-foreground">—</span>;
      }

      return (
        <span
          className={cn(
            "text-sm",
            truncate && "truncate block",
            muted && "text-muted-foreground"
          )}
        >
          {value}
        </span>
      );
    },
    size,
  };
}

// ============================================================================
// ACTIONS COLUMN
// ============================================================================

interface ActionItem<TData> {
  label: string;
  icon?: React.ReactNode;
  onClick: (row: TData) => void;
  destructive?: boolean;
  dividerBefore?: boolean;
  disabled?: boolean | ((row: TData) => boolean);
}

interface ActionsColumnOptions<TData> {
  /** Column ID (default: "actions") */
  id?: string;
  /** Column width (default: 50) */
  size?: number;
  /** Action items to show in dropdown */
  actions: ActionItem<TData>[];
}

/**
 * Creates an actions column with dropdown menu.
 *
 * @example
 * const columns = [
 *   actionsColumn({
 *     actions: [
 *       { label: "Edit", icon: <Pencil />, onClick: (row) => handleEdit(row) },
 *       { label: "Delete", icon: <Trash2 />, onClick: (row) => handleDelete(row), destructive: true, dividerBefore: true },
 *     ],
 *   }),
 * ];
 */
export function actionsColumn<TData>({
  id = "actions",
  size = 50,
  actions,
}: ActionsColumnOptions<TData>): ColumnDef<TData> {
  return {
    id,
    header: "",
    cell: ({ row }) => {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {actions.map((action, index) => {
              const isDisabled =
                typeof action.disabled === "function"
                  ? action.disabled(row.original)
                  : action.disabled;

              return (
                <div key={action.label}>
                  {action.dividerBefore && <DropdownMenuSeparator />}
                  <DropdownMenuItem
                    onClick={() => action.onClick(row.original)}
                    className={action.destructive ? "text-destructive" : ""}
                    disabled={isDisabled}
                  >
                    {action.icon && (
                      <span className="mr-2 h-4 w-4">{action.icon}</span>
                    )}
                    {action.label}
                  </DropdownMenuItem>
                </div>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
    size,
    enableSorting: false,
    enableResizing: false,
  };
}

// ============================================================================
// CHECKBOX COLUMN
// ============================================================================

interface CheckboxColumnOptions {
  /** Column ID (default: "select") */
  id?: string;
  /** Column width (default: 40) */
  size?: number;
}

/**
 * Creates a selection checkbox column.
 * Note: Selection state is managed by the table, not this column.
 */
export function checkboxColumn({
  id = "select",
  size = 40,
}: CheckboxColumnOptions = {}): ColumnDef<unknown> {
  return {
    id,
    header: ({ table }) => (
      <input
        type="checkbox"
        checked={table.getIsAllPageRowsSelected()}
        onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
        className="h-4 w-4 rounded border border-primary"
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        checked={row.getIsSelected()}
        onChange={(e) => row.toggleSelected(e.target.checked)}
        className="h-4 w-4 rounded border border-primary"
      />
    ),
    size,
    enableSorting: false,
    enableResizing: false,
  };
}
