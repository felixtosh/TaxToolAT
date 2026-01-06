"use client";

import { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { ArrowUpDown, Link2 } from "lucide-react";
import { TaxFile } from "@/types/file";
import { UserPartner, GlobalPartner } from "@/types/partner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PartnerPill } from "@/components/partners/partner-pill";
import { cn } from "@/lib/utils";

export function getFileColumns(
  userPartners: UserPartner[] = [],
  globalPartners: GlobalPartner[] = []
): ColumnDef<TaxFile>[] {
  const userPartnerMap = new Map(userPartners.map((p) => [p.id, p]));
  const globalPartnerMap = new Map(globalPartners.map((p) => [p.id, p]));

  return [
    {
      accessorKey: "extractedDate",
      size: 100,
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-8 px-2 -ml-2"
        >
          Inv. Date
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const extractedDate = row.original.extractedDate;

        if (!extractedDate) {
          return <span className="text-sm text-muted-foreground">—</span>;
        }

        const dateObj = extractedDate.toDate();
        const timeStr = format(dateObj, "HH:mm");
        const showTime = timeStr !== "00:00";

        return (
          <div>
            <p className="text-sm whitespace-nowrap">
              {format(dateObj, "MMM d, yyyy")}
            </p>
            {showTime && (
              <p className="text-sm text-muted-foreground">
                {timeStr}
              </p>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "extractedAmount",
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
        const amount = row.getValue("extractedAmount") as number | null | undefined;
        const currency = row.original.extractedCurrency || "EUR";

        if (amount == null) {
          return <span className="text-sm text-muted-foreground">—</span>;
        }

        const formatted = new Intl.NumberFormat("de-DE", {
          style: "currency",
          currency,
        }).format(amount / 100);

        return (
          <span
            className={cn(
              "text-sm tabular-nums whitespace-nowrap",
              amount < 0 ? "text-red-600" : "text-foreground"
            )}
          >
            {formatted}
          </span>
        );
      },
    },
    {
      accessorKey: "extractedVatPercent",
      size: 70,
      header: "VAT%",
      cell: ({ row }) => {
        const vatPercent = row.getValue("extractedVatPercent") as number | null | undefined;

        if (vatPercent == null) {
          return <span className="text-sm text-muted-foreground">—</span>;
        }

        return <span className="text-sm">{vatPercent}%</span>;
      },
    },
    {
      accessorKey: "fileName",
      header: "Filename",
      cell: ({ row }) => {
        const fileName = row.getValue("fileName") as string;

        return (
          <div className="min-w-0">
            <p className="text-sm truncate">{fileName}</p>
          </div>
        );
      },
    },
    {
      accessorKey: "uploadedAt",
      size: 100,
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-8 px-2 -ml-2"
        >
          Upload Date
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const uploadedAt = row.getValue("uploadedAt") as { toDate: () => Date };
        const dateObj = uploadedAt.toDate();
        const timeStr = format(dateObj, "HH:mm");
        const showTime = timeStr !== "00:00";

        return (
          <div>
            <p className="text-sm whitespace-nowrap">
              {format(dateObj, "MMM d, yyyy")}
            </p>
            {showTime && (
              <p className="text-sm text-muted-foreground">
                {timeStr}
              </p>
            )}
          </div>
        );
      },
    },
    {
      id: "assignedPartner",
      header: "Partner",
      cell: ({ row }) => {
        const { partnerId, partnerType, partnerMatchConfidence } = row.original;

        // Show assigned partner if exists
        if (partnerId) {
          const partner = partnerType === "global"
            ? globalPartnerMap.get(partnerId)
            : userPartnerMap.get(partnerId);
          return (
            <div className="min-w-0 overflow-hidden">
              <PartnerPill
                name={partner?.name || partnerId.slice(0, 8) + "..."}
                confidence={partnerMatchConfidence ?? undefined}
                partnerType={partnerType ?? undefined}
                className="max-w-full"
              />
            </div>
          );
        }

        return <span className="text-sm text-muted-foreground">—</span>;
      },
    },
    {
      id: "connections",
      size: 100,
      header: "Transactions",
      cell: ({ row }) => {
        const count = row.original.transactionIds.length;

        if (count === 0) {
          return <span className="text-sm text-muted-foreground">—</span>;
        }

        return (
          <Badge variant="secondary" className="gap-1">
            <Link2 className="h-3 w-3" />
            {count}
          </Badge>
        );
      },
    },
  ];
}
