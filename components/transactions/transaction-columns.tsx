"use client";

import { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import {
  FileText,
  Tag,
  Loader2,
} from "lucide-react";
import { Transaction } from "@/types/transaction";
import { TransactionSource } from "@/types/source";
import { UserPartner, GlobalPartner } from "@/types/partner";
import { UserNoReceiptCategory, CategorySuggestion } from "@/types/no-receipt-category";
import { PipelineId } from "@/types/automation";
import { getCategoryTemplate } from "@/lib/data/no-receipt-category-templates";
import { Pill } from "@/components/ui/pill";
import { AmountMatchDisplay } from "@/components/ui/amount-match-display";
import { SortableHeader, AutomationHeader } from "@/components/ui/data-table";
import { PartnerPill } from "@/components/partners/partner-pill";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface FileAmountData {
  totalAmount: number;
  fileCount: number;
  amounts: Array<{ amount: number; currency: string }>;
  hasExtractingFiles: boolean;
}

export interface TransactionColumnOptions {
  sources: TransactionSource[];
  userPartners?: UserPartner[];
  globalPartners?: GlobalPartner[];
  categories?: UserNoReceiptCategory[];
  categorySuggestions?: Map<string, CategorySuggestion>;
  fileAmountsMap?: Map<string, FileAmountData>;
  searchingTransactionIds?: Set<string>;
  onAutomationClick?: (pipelineId: PipelineId) => void;
}

export function getTransactionColumns(
  sources: TransactionSource[],
  userPartners: UserPartner[] = [],
  globalPartners: GlobalPartner[] = [],
  categories: UserNoReceiptCategory[] = [],
  categorySuggestions?: Map<string, CategorySuggestion>,
  fileAmountsMap?: Map<string, FileAmountData>,
  onAutomationClick?: (pipelineId: PipelineId) => void,
  searchingTransactionIds?: Set<string>
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
        <SortableHeader column={column}>Date</SortableHeader>
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
        <SortableHeader column={column}>Amount</SortableHeader>
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
              amount < 0 ? "text-amount-negative" : "text-amount-positive"
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
      header: () =>
        onAutomationClick ? (
          <AutomationHeader
            label="Partner"
            pipelineId="find-partner"
            onAutomationClick={onAutomationClick}
          />
        ) : (
          "Partner"
        ),
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
              matchedBy={row.original.partnerMatchedBy}
            />
          );
        }

        // Get top server suggestion with partner lookup
        const serverSuggestions = row.original.partnerSuggestions || [];
        let topSuggestion: { name: string; confidence: number } | null = null;
        for (const s of serverSuggestions) {
          const partner = s.partnerType === "global"
            ? globalPartnerMap.get(s.partnerId)
            : userPartnerMap.get(s.partnerId);
          if (partner) {
            topSuggestion = { name: partner.name, confidence: s.confidence };
            break; // First one is highest confidence (already sorted server-side)
          }
        }

        if (topSuggestion) {
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <PartnerPill
                  name={topSuggestion.name}
                  confidence={topSuggestion.confidence}
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
      header: () =>
        onAutomationClick ? (
          <AutomationHeader
            label="File"
            pipelineId="find-file"
            onAutomationClick={onAutomationClick}
          />
        ) : (
          "File"
        ),
      cell: ({ row }) => {
        const fileCount = row.original.fileIds?.length || 0;
        const hasFile = fileCount > 0;
        const categoryTemplateId = row.original.noReceiptCategoryTemplateId;
        const hasNoReceiptCategory = !!categoryTemplateId;
        const txId = row.original.id;
        const isSearching = searchingTransactionIds?.has(txId);

        // Show loading spinner when precision search is in progress
        if (isSearching && !hasFile) {
          return (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span className="text-xs">Searching...</span>
            </div>
          );
        }

        if (hasFile) {
          const fileData = fileAmountsMap?.get(txId);
          // Use transaction/payment date for currency conversion
          const txDate = row.original.date?.toDate?.();
          return (
            <AmountMatchDisplay
              count={fileCount}
              countType="file"
              primaryAmount={row.original.amount}
              primaryCurrency={row.original.currency || "EUR"}
              secondaryAmounts={fileData?.amounts || []}
              conversionDate={txDate}
              isExtracting={fileData?.hasExtractingFiles}
            />
          );
        }

        if (hasNoReceiptCategory) {
          const template = getCategoryTemplate(categoryTemplateId);
          const label = template?.name || "No receipt";
          const categoryConfidence = row.original.noReceiptCategoryConfidence;
          const categoryMatchedBy = row.original.noReceiptCategoryMatchedBy;
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Pill
                    label={label}
                    icon={Tag}
                    confidence={categoryConfidence ?? undefined}
                    matchedBy={categoryMatchedBy}
                  />
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
                  <Pill
                    label={label}
                    icon={Tag}
                    variant="suggestion"
                    confidence={catSuggestion.confidence}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Click row to assign</p>
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
              <span className="text-sm truncate block">{source.name}</span>
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
