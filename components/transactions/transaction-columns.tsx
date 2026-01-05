"use client";

import { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import {
  Paperclip,
  CheckCircle2,
  ArrowUpDown,
  Building2,
} from "lucide-react";
import { Transaction } from "@/types/transaction";
import { TransactionSource } from "@/types/source";
import { UserPartner, GlobalPartner, PartnerMatchResult } from "@/types/partner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function getTransactionColumns(
  sources: TransactionSource[],
  userPartners: UserPartner[] = [],
  globalPartners: GlobalPartner[] = [],
  patternSuggestions?: Map<string, PartnerMatchResult>
): ColumnDef<Transaction>[] {
  const sourceMap = new Map(sources.map((s) => [s.id, s]));
  const userPartnerMap = new Map(userPartners.map((p) => [p.id, p]));
  const globalPartnerMap = new Map(globalPartners.map((p) => [p.id, p]));

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
          <span className="text-sm whitespace-nowrap">
            {format(date.toDate(), "MMM d, yyyy")}
          </span>
        );
      },
    },
    {
      accessorKey: "name",
      header: "Description",
      cell: ({ row }) => (
        <div className="max-w-[220px]">
          <p className="text-sm truncate">{row.original.partner || "—"}</p>
          <p className="text-sm text-muted-foreground truncate">
            {row.getValue("name")}
          </p>
        </div>
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
              "text-sm tabular-nums whitespace-nowrap",
              amount < 0 ? "text-red-600" : "text-green-600"
            )}
          >
            {formatted}
          </span>
        );
      },
    },
    {
      id: "assignedPartner",
      header: "Partner",
      cell: ({ row }) => {
        const { partnerId, partnerType, id: txId } = row.original;

        // Show assigned partner if exists
        if (partnerId) {
          const partner = partnerType === "global"
            ? globalPartnerMap.get(partnerId)
            : userPartnerMap.get(partnerId);
          return (
            <span className="text-sm truncate block max-w-[180px]">
              {partner?.name || partnerId.slice(0, 8) + "..."}
            </span>
          );
        }

        // Show pattern suggestion if available
        const suggestion = patternSuggestions?.get(txId);
        if (suggestion) {
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className="text-xs cursor-pointer hover:bg-primary/10 border-dashed"
                >
                  {suggestion.partnerName}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Pattern match: {suggestion.confidence}%</p>
                <p className="text-xs text-muted-foreground">Click row to confirm</p>
              </TooltipContent>
            </Tooltip>
          );
        }

        return <span className="text-sm text-muted-foreground">—</span>;
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
        );
      },
    },
  ];
}
