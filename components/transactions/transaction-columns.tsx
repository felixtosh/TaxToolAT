"use client";

import { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import {
  Paperclip,
  ArrowUpDown,
  FileText,
  Tag,
} from "lucide-react";
import { Transaction } from "@/types/transaction";
import { TransactionSource } from "@/types/source";
import { UserPartner, GlobalPartner, PartnerMatchResult } from "@/types/partner";
import { UserNoReceiptCategory, CategorySuggestion } from "@/types/no-receipt-category";
import { getCategoryTemplate } from "@/lib/data/no-receipt-category-templates";
import { Button } from "@/components/ui/button";
import { PartnerPill } from "@/components/partners/partner-pill";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Pill component for file/category display (matches PartnerPill styling exactly)
function FilePill({
  label,
  icon: Icon,
  variant = "default",
}: {
  label: string;
  icon: React.ElementType;
  variant?: "default" | "suggestion";
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center h-7 px-3 gap-2 rounded-md border text-sm max-w-[160px]",
        variant === "suggestion"
          ? "bg-info border-info-border text-info-foreground"
          : "bg-background border-input"
      )}
    >
      <Icon
        className={cn(
          "h-3.5 w-3.5 flex-shrink-0",
          variant === "suggestion" ? "text-info-foreground" : "text-muted-foreground"
        )}
      />
      <span className="truncate flex-1">{label}</span>
    </div>
  );
}

export function getTransactionColumns(
  sources: TransactionSource[],
  userPartners: UserPartner[] = [],
  globalPartners: GlobalPartner[] = [],
  patternSuggestions?: Map<string, PartnerMatchResult>,
  categories: UserNoReceiptCategory[] = [],
  categorySuggestions?: Map<string, CategorySuggestion>,
  fileAmountsMap?: Map<string, { amount: number; currency: string }>
): ColumnDef<Transaction>[] {
  const sourceMap = new Map(sources.map((s) => [s.id, s]));
  const userPartnerMap = new Map(userPartners.map((p) => [p.id, p]));
  const globalPartnerMap = new Map(globalPartners.map((p) => [p.id, p]));
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  return [
    {
      accessorKey: "date",
      size: 100,
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
        const dateObj = date.toDate();
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
      accessorKey: "name",
      header: "Description",
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="text-sm truncate">{row.original.partner || "—"}</p>
          <p className="text-sm text-muted-foreground truncate">
            {row.getValue("name")}
          </p>
        </div>
      ),
    },
    {
      id: "assignedPartner",
      header: "Partner",
      cell: ({ row }) => {
        const { partnerId, partnerType, partnerMatchConfidence, id: txId } = row.original;

        // Show assigned partner if exists (styled like transaction detail)
        if (partnerId) {
          const partner = partnerType === "global"
            ? globalPartnerMap.get(partnerId)
            : userPartnerMap.get(partnerId);
          return (
            <PartnerPill
              name={partner?.name || partnerId.slice(0, 8) + "..."}
              confidence={partnerMatchConfidence ?? undefined}
            />
          );
        }

        // Show pattern suggestion if available
        const suggestion = patternSuggestions?.get(txId);
        if (suggestion) {
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <PartnerPill
                  name={suggestion.partnerName}
                  confidence={suggestion.confidence}
                  variant="suggestion"
                />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Click row to confirm</p>
              </TooltipContent>
            </Tooltip>
          );
        }

        return <span className="text-sm text-muted-foreground">—</span>;
      },
    },
    {
      id: "file",
      header: "File",
      cell: ({ row }) => {
        const fileCount = row.original.fileIds?.length || 0;
        const hasFile = fileCount > 0;
        const categoryTemplateId = row.original.noReceiptCategoryTemplateId;
        const hasNoReceiptCategory = !!categoryTemplateId;
        const txId = row.original.id;

        if (hasFile) {
          // Show file amount if available, otherwise show count
          const fileAmount = fileAmountsMap?.get(txId);
          if (fileAmount) {
            const formatted = new Intl.NumberFormat("de-DE", {
              style: "currency",
              currency: fileAmount.currency || "EUR",
            }).format(fileAmount.amount / 100);
            return <FilePill label={formatted} icon={FileText} />;
          }
          const label = fileCount === 1 ? "1 file" : `${fileCount} files`;
          return <FilePill label={label} icon={FileText} />;
        }

        if (hasNoReceiptCategory) {
          const template = getCategoryTemplate(categoryTemplateId);
          const label = template?.name || "No receipt";
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <FilePill label={label} icon={Tag} />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">{template?.helperText || "No receipt required"}</p>
              </TooltipContent>
            </Tooltip>
          );
        }

        // Check for category suggestion
        const catSuggestion = categorySuggestions?.get(txId);
        if (catSuggestion) {
          const category = categoryMap.get(catSuggestion.categoryId);
          const label = category?.name || "Category";
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <FilePill label={label} icon={Tag} variant="suggestion" />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">
                  Suggested: {catSuggestion.confidence}% match
                </p>
                <p className="text-xs text-muted-foreground">Click row to assign</p>
              </TooltipContent>
            </Tooltip>
          );
        }

        return (
          <span className="text-sm text-muted-foreground">—</span>
        );
      },
    },
    {
      accessorKey: "sourceId",
      size: 120,
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
              <span className="text-sm truncate">{source.name}</span>
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
