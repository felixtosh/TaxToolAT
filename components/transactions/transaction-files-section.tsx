"use client";

import { useState, useMemo, useEffect } from "react";
import { format } from "date-fns";
import {
  Loader2,
  ChevronRight,
  Tag,
  X,
  Plus,
  Sparkles,
  Check,
} from "lucide-react";
import { Transaction } from "@/types/transaction";
import { TaxFile } from "@/types/file";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConnectFileDialog } from "@/components/files/connect-file-dialog";
import { NoReceiptCategoryPopover } from "./no-receipt-category-popover";
import { ReceiptLostDialog } from "./receipt-lost-dialog";
import { useTransactionFiles, useFiles } from "@/hooks/use-files";
import { useNoReceiptCategories } from "@/hooks/use-no-receipt-categories";
import { matchTransactionToCategories, shouldAutoApplyCategory } from "@/lib/matching/category-matcher";
import { cn } from "@/lib/utils";
import Link from "next/link";

// Consistent field row component (matches transaction-details.tsx)
function FieldRow({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4",
        className
      )}
    >
      <span className="text-sm text-muted-foreground shrink-0 sm:w-32">
        {label}
      </span>
      <span className="text-sm">{children}</span>
    </div>
  );
}

interface TransactionFilesSectionProps {
  transaction: Transaction;
}

function formatAmount(
  amount: number | null | undefined,
  currency: string | null | undefined
) {
  if (amount == null) return null;
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: currency || "EUR",
  }).format(amount / 100);
}

interface FileRowProps {
  file: TaxFile;
  onDisconnect: () => void;
  disconnecting: boolean;
}

function FileRow({ file, onDisconnect, disconnecting }: FileRowProps) {
  return (
    <Link
      href={`/files?id=${file.id}`}
      className="flex items-center justify-between gap-2 p-2 -mx-2 rounded hover:bg-muted/50 transition-colors group overflow-hidden"
    >
      <div className="min-w-0 flex-1 overflow-hidden w-0">
        <p className="text-sm truncate">{file.fileName}</p>
        <p className="text-xs text-muted-foreground">
          {file.extractedDate
            ? format(file.extractedDate.toDate(), "MMM d, yyyy")
            : format(file.uploadedAt.toDate(), "MMM d, yyyy")}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {file.extractedAmount != null && (
          <span className="text-sm font-medium tabular-nums text-foreground">
            {formatAmount(file.extractedAmount, file.extractedCurrency)}
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDisconnect();
          }}
          disabled={disconnecting}
          className="p-1 rounded hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          {disconnecting ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
          )}
        </button>
        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </Link>
  );
}

export function TransactionFilesSection({
  transaction,
}: TransactionFilesSectionProps) {
  const [isFileDialogOpen, setIsFileDialogOpen] = useState(false);
  const [isReceiptLostDialogOpen, setIsReceiptLostDialogOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const { files, loading: filesLoading, connectFile, disconnectFile } =
    useTransactionFiles(transaction.id);
  const { files: allFiles, loading: allFilesLoading } = useFiles();
  const {
    categories,
    loading: categoriesLoading,
    assignToTransaction,
    removeFromTransaction,
    assignReceiptLost,
    getCategoryById,
  } = useNoReceiptCategories();

  // Check if transaction has a no-receipt category assigned
  const hasCategory = !!transaction.noReceiptCategoryId;
  const assignedCategory = hasCategory
    ? getCategoryById(transaction.noReceiptCategoryId!)
    : null;

  // Check if transaction has files
  const hasFiles = files.length > 0;

  // Compute category suggestions when no category assigned and no files
  const categorySuggestions = useMemo(() => {
    if (hasCategory || hasFiles || categories.length === 0) {
      return [];
    }
    return matchTransactionToCategories(transaction, categories).slice(0, 3);
  }, [transaction, categories, hasCategory, hasFiles]);

  // Auto-assign category when confidence > 89% and no files attached
  useEffect(() => {
    if (hasCategory || hasFiles || categorySuggestions.length === 0) {
      return;
    }

    const topSuggestion = categorySuggestions[0];
    if (topSuggestion && shouldAutoApplyCategory(topSuggestion.confidence)) {
      // Auto-assign the category (from suggestion with high confidence)
      console.log(`[Category Auto-Assign] Applying ${topSuggestion.categoryId} with ${topSuggestion.confidence}% confidence`);
      assignToTransaction(transaction.id, topSuggestion.categoryId, "suggestion", topSuggestion.confidence);
    }
  }, [transaction.id, hasCategory, hasFiles, categorySuggestions, assignToTransaction]);

  // Compute file suggestions - files that have this transaction in their transactionSuggestions
  const fileSuggestions = useMemo(() => {
    if (hasFiles || hasCategory || allFilesLoading) {
      return [];
    }
    const connectedFileIds = new Set(files.map(f => f.id));
    return allFiles
      .filter(file => {
        // Skip already connected files
        if (connectedFileIds.has(file.id)) return false;
        // Check if file has this transaction in suggestions
        return file.transactionSuggestions?.some(
          s => s.transactionId === transaction.id
        );
      })
      .map(file => {
        const suggestion = file.transactionSuggestions?.find(
          s => s.transactionId === transaction.id
        );
        return {
          file,
          confidence: suggestion?.confidence || 0,
          matchSources: suggestion?.matchSources || [],
        };
      })
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);
  }, [allFiles, allFilesLoading, files, hasFiles, hasCategory, transaction.id]);

  const handleConnectFile = async (fileId: string) => {
    await connectFile(fileId);
    // If connecting a file, remove any no-receipt category
    if (hasCategory) {
      await removeFromTransaction(transaction.id);
    }
  };

  const handleDisconnectFile = async (fileId: string) => {
    setDisconnecting(fileId);
    try {
      await disconnectFile(fileId);
    } finally {
      setDisconnecting(null);
    }
  };

  const handleSelectCategory = async (categoryId: string) => {
    const category = getCategoryById(categoryId);
    if (category?.templateId === "receipt-lost") {
      // Open receipt lost dialog
      setIsReceiptLostDialogOpen(true);
    } else {
      await assignToTransaction(transaction.id, categoryId, "manual");
    }
  };

  const handleSelectSuggestion = async (categoryId: string, confidence: number) => {
    const category = getCategoryById(categoryId);
    if (category?.templateId === "receipt-lost") {
      setIsReceiptLostDialogOpen(true);
    } else {
      await assignToTransaction(transaction.id, categoryId, "suggestion", confidence);
    }
  };

  const handleReceiptLostSubmit = async (
    reason: string,
    description: string
  ) => {
    await assignReceiptLost(transaction.id, reason, description);
    setIsReceiptLostDialogOpen(false);
  };

  const handleRemoveCategory = async () => {
    await removeFromTransaction(transaction.id);
  };

  const loading = filesLoading || categoriesLoading;

  return (
    <TooltipProvider>
      <div className="space-y-3">
        {/* Section Header */}
        <h3 className="text-sm font-medium">File</h3>

        {/* Receipt Section */}
        <div className={cn("space-y-2", hasCategory && "opacity-50 pointer-events-none")}>
          {loading ? (
            <FieldRow label="Receipt">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </FieldRow>
          ) : hasFiles ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Receipt</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsFileDialogOpen(true)}
                  className="h-7 px-3"
                  disabled={hasCategory}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </div>
              <div className="space-y-0.5">
                {files.map((file) => (
                  <FileRow
                    key={file.id}
                    file={file}
                    onDisconnect={() => handleDisconnectFile(file.id)}
                    disconnecting={disconnecting === file.id}
                  />
                ))}
              </div>
            </>
          ) : (
            <FieldRow label="Receipt">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsFileDialogOpen(true)}
                className="h-7 px-3"
                disabled={hasCategory}
              >
                <Plus className="h-3 w-3 mr-1" />
                Connect
              </Button>
            </FieldRow>
          )}
        </div>

        {/* File Suggestions - shown when no files and no category */}
        {!hasFiles && !hasCategory && fileSuggestions.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-sm text-muted-foreground">Suggested</span>
            </div>
            <div className="space-y-1">
              {fileSuggestions.map(({ file, confidence }) => (
                <div
                  key={file.id}
                  className="flex items-center gap-2 p-2 -mx-2 rounded bg-muted/30 border border-dashed"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{file.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {file.extractedDate
                        ? format(file.extractedDate.toDate(), "MMM d, yyyy")
                        : format(file.uploadedAt.toDate(), "MMM d, yyyy")}
                      {file.extractedAmount != null && (
                        <> · {formatAmount(file.extractedAmount, file.extractedCurrency)}</>
                      )}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "shrink-0 text-xs px-1.5 py-0",
                      confidence >= 85
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        : confidence >= 70
                        ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                        : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
                    )}
                  >
                    {confidence}%
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 hover:bg-green-100 hover:text-green-700"
                    onClick={() => handleConnectFile(file.id)}
                  >
                    <Check className="h-4 w-4" />
                    <span className="sr-only">Connect</span>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No Receipt Row */}
        <FieldRow
          label="No Receipt"
          className={cn(hasFiles && "opacity-50 pointer-events-none")}
        >
          {hasCategory && assignedCategory ? (
            <Link
              href={`/categories?id=${assignedCategory.id}`}
              className="inline-flex items-center h-7 px-3 gap-2 rounded-md border text-sm max-w-[280px] bg-background border-input cursor-pointer hover:bg-accent"
            >
              <Tag className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
              <span className="truncate flex-1">{assignedCategory.name}</span>
              {transaction.receiptLostEntry && (
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  ({transaction.receiptLostEntry.reason})
                </span>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleRemoveCategory();
                }}
                className="flex-shrink-0 p-0.5 -mr-1 rounded hover:bg-destructive/10"
              >
                <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
              </button>
            </Link>
          ) : (
            <NoReceiptCategoryPopover
              categories={categories}
              transaction={transaction}
              onSelect={handleSelectCategory}
              disabled={hasFiles}
            />
          )}
        </FieldRow>

        {/* Category Suggestions - shown when no category assigned and no files */}
        {!hasCategory && !hasFiles && categorySuggestions.length > 0 && (
          <FieldRow label="Suggestions" className="mt-1">
            <div className="flex flex-wrap gap-1.5">
              {categorySuggestions.map((suggestion) => {
                const category = getCategoryById(suggestion.categoryId);
                if (!category) return null;
                return (
                  <button
                    key={suggestion.categoryId}
                    type="button"
                    onClick={() => handleSelectSuggestion(suggestion.categoryId, suggestion.confidence)}
                    className="inline-flex items-center h-7 px-3 gap-2 rounded-md border text-sm bg-info border-info-border text-info-foreground cursor-pointer hover:bg-info/80 transition-colors"
                  >
                    <Sparkles className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate max-w-[120px]">{category.name}</span>
                    <span className="text-xs opacity-75">{suggestion.confidence}%</span>
                  </button>
                );
              })}
            </div>
          </FieldRow>
        )}

        {/* Connect file dialog */}
        <ConnectFileDialog
          open={isFileDialogOpen}
          onClose={() => setIsFileDialogOpen(false)}
          onSelect={handleConnectFile}
          connectedFileIds={files.map((f) => f.id)}
          transactionInfo={{
            date: transaction.date.toDate(),
            amount: transaction.amount,
            currency: transaction.currency,
            partner: transaction.partner || undefined,
            name: transaction.name || undefined,
            reference: transaction.reference || undefined,
            partnerIban: transaction.partnerIban || undefined,
            partnerId: transaction.partnerId || undefined,
            transactionId: transaction.id,
          }}
        />

        {/* Receipt lost dialog */}
        <ReceiptLostDialog
          open={isReceiptLostDialogOpen}
          onClose={() => setIsReceiptLostDialogOpen(false)}
          onConfirm={handleReceiptLostSubmit}
          transaction={transaction}
        />
      </div>
    </TooltipProvider>
  );
}
