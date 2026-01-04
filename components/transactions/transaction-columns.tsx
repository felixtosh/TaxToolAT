"use client";

import { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import {
  Paperclip,
  CheckCircle2,
  ArrowUpDown,
  MoreHorizontal,
  Building2,
} from "lucide-react";
import { Transaction } from "@/types/transaction";
import { TransactionSource } from "@/types/source";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function getTransactionColumns(
  sources: TransactionSource[]
): ColumnDef<Transaction>[] {
  const sourceMap = new Map(sources.map((s) => [s.id, s]));

  return [
    {
      accessorKey: "date",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-8 px-2 -ml-2"
        >
          Date
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const date = row.getValue("date") as { toDate: () => Date };
        return (
          <span className="text-sm font-medium whitespace-nowrap">
            {format(date.toDate(), "MMM d, yyyy")}
          </span>
        );
      },
    },
    {
      accessorKey: "sourceId",
      header: "Account",
      cell: ({ row }) => {
        const sourceId = row.getValue("sourceId") as string | undefined;
        if (!sourceId) {
          return <span className="text-muted-foreground">—</span>;
        }
        const source = sourceMap.get(sourceId);
        if (!source) {
          return <span className="text-muted-foreground text-xs">{sourceId.slice(0, 8)}...</span>;
        }
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 max-w-[120px]">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm truncate">{source.name}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-medium">{source.name}</p>
                <p className="text-xs text-muted-foreground font-mono">{source.iban}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      },
    },
    {
      accessorKey: "name",
      header: "Description",
      cell: ({ row }) => (
        <div className="max-w-[300px]">
          <p className="font-medium truncate">{row.getValue("name")}</p>
          {row.original.description && (
            <p className="text-sm text-muted-foreground truncate">
              {row.original.description}
            </p>
          )}
        </div>
      ),
    },
    {
      accessorKey: "partner",
      header: "Partner/Vendor",
      cell: ({ row }) => (
        <span className="text-sm">{row.getValue("partner") || "-"}</span>
      ),
    },
    {
      accessorKey: "amount",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-8 px-2 -ml-2"
        >
          Amount
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const amount = row.getValue("amount") as number;
        const currency = row.original.currency;
        const formatted = new Intl.NumberFormat("de-DE", {
          style: "currency",
          currency: currency || "EUR",
        }).format(amount / 100);

        return (
          <span
            className={cn(
              "font-medium tabular-nums whitespace-nowrap",
              amount < 0 ? "text-red-600" : "text-green-600"
            )}
          >
            {formatted}
          </span>
        );
      },
    },
    {
      accessorKey: "categoryId",
      header: "Category",
      cell: ({ row }) => {
        const categoryId = row.getValue("categoryId") as string | null;
        return categoryId ? (
          <Badge variant="secondary" className="whitespace-nowrap">
            {categoryId}
          </Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        );
      },
    },
    {
      id: "receipt",
      header: () => (
        <div className="flex justify-center">
          <Paperclip className="h-4 w-4" />
        </div>
      ),
      cell: ({ row }) => {
        const hasReceipt = row.original.receiptIds.length > 0;
        return (
          <div className="flex justify-center">
            {hasReceipt ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <Paperclip className="h-4 w-4 text-muted-foreground/50" />
            )}
          </div>
        );
      },
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>Edit</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];
}
