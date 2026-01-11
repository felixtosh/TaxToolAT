"use client";

import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { Search, Receipt, Check, Link2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Transaction } from "@/types/transaction";
import { TransactionSuggestion, TaxFile } from "@/types/file";
import { useTransactions } from "@/hooks/use-transactions";
import { cn } from "@/lib/utils";
import {
  getTransactionMatchSourceLabel,
  scoreTransactionMatch,
  toTransactionSuggestion,
  TRANSACTION_MATCH_CONFIG,
} from "@/lib/matching/transaction-matcher";
import { Timestamp } from "firebase/firestore";

interface ConnectTransactionDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (transactionIds: string[]) => Promise<void>;
  /** Transaction IDs that are already connected (to show as disabled) */
  connectedTransactionIds?: string[];
  /** File info for display and real-time matching */
  fileInfo?: {
    fileName: string;
    extractedDate?: Date | null;
    extractedAmount?: number | null;
    extractedCurrency?: string | null;
    extractedPartner?: string | null;
    extractedIban?: string | null;
    extractedText?: string | null;
    partnerId?: string | null;
  };
  /** Pre-computed transaction suggestions from file matching (optional, will compute if not provided) */
  suggestions?: TransactionSuggestion[];
}

export function ConnectTransactionDialog({
  open,
  onClose,
  onSelect,
  connectedTransactionIds = [],
  fileInfo,
  suggestions = [],
}: ConnectTransactionDialogProps) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewTransaction, setPreviewTransaction] = useState<Transaction | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const { transactions, loading } = useTransactions();

  // Compute real-time suggestions if not provided or empty
  // This ensures users always see recommended transactions even for older files
  const computedSuggestions = useMemo(() => {
    // If we have pre-computed suggestions, use them
    if (suggestions && suggestions.length > 0) {
      return suggestions;
    }

    // Otherwise, compute in real-time if we have file info
    if (!fileInfo || !transactions.length) {
      return [];
    }

    // Build a minimal TaxFile object for scoring
    const fileForScoring: TaxFile = {
      id: "",
      userId: "",
      fileName: fileInfo.fileName,
      fileType: "",
      fileSize: 0,
      storagePath: "",
      downloadUrl: "",
      transactionIds: connectedTransactionIds || [],
      extractionComplete: true,
      uploadedAt: Timestamp.now(),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      extractedDate: fileInfo.extractedDate ? Timestamp.fromDate(fileInfo.extractedDate) : null,
      extractedAmount: fileInfo.extractedAmount ?? null,
      extractedCurrency: fileInfo.extractedCurrency ?? null,
      extractedPartner: fileInfo.extractedPartner ?? null,
      extractedIban: fileInfo.extractedIban ?? null,
      extractedText: fileInfo.extractedText ?? null,
      partnerId: fileInfo.partnerId ?? null,
    };

    // Filter out already connected transactions
    const connectedSet = new Set(connectedTransactionIds || []);
    const candidates = transactions.filter((tx) => !connectedSet.has(tx.id));

    // Score and filter
    const scored = candidates
      .map((tx) => scoreTransactionMatch(fileForScoring, tx))
      .filter((m) => m.confidence >= TRANSACTION_MATCH_CONFIG.SUGGESTION_THRESHOLD)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10)
      .map(toTransactionSuggestion);

    return scored;
  }, [suggestions, fileInfo, transactions, connectedTransactionIds]);

  // Create a map of suggestion info by transaction ID
  const suggestionMap = useMemo(() => {
    const map = new Map<string, TransactionSuggestion>();
    for (const s of computedSuggestions) {
      map.set(s.transactionId, s);
    }
    return map;
  }, [computedSuggestions]);

  // Parse amount from search string
  // Supports: "123.45", "123,45", "-123.45", "€123", "123€", "123 EUR"
  const parseSearchAmount = (searchStr: string): number | null => {
    if (!searchStr) return null;

    // Remove currency symbols and common words
    let cleaned = searchStr
      .replace(/[€$£]/g, "")
      .replace(/\s*(EUR|USD|GBP|CHF)\s*/gi, "")
      .trim();

    // Handle European format (comma as decimal separator)
    // If there's a comma followed by exactly 2 digits at the end, treat as decimal
    if (/,\d{2}$/.test(cleaned)) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      // Remove thousand separators (commas or dots not followed by 2 digits)
      cleaned = cleaned.replace(/,/g, "");
    }

    const parsed = parseFloat(cleaned);
    if (isNaN(parsed)) return null;

    // Convert to cents
    return Math.round(parsed * 100);
  };

  // Check if an amount matches the search amount (with tolerance)
  const amountMatches = (transactionAmount: number, searchAmount: number): boolean => {
    const absTransaction = Math.abs(transactionAmount);
    const absSearch = Math.abs(searchAmount);

    // Exact match
    if (absTransaction === absSearch) return true;

    // Within 5% tolerance (for rounding differences)
    const tolerance = absSearch * 0.05;
    return Math.abs(absTransaction - absSearch) <= Math.max(tolerance, 100); // At least 1€ tolerance
  };

  // Filter and sort transactions - suggestions first, then by search
  const filteredTransactions = useMemo(() => {
    let filtered = transactions;

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase().trim();
      const searchAmount = parseSearchAmount(search);

      filtered = filtered.filter((t) => {
        // Text matches
        const textMatch =
          t.name.toLowerCase().includes(searchLower) ||
          (t.partner?.toLowerCase() || "").includes(searchLower) ||
          (t.reference?.toLowerCase() || "").includes(searchLower);

        // Amount match
        const amountMatch = searchAmount !== null && amountMatches(t.amount, searchAmount);

        return textMatch || amountMatch;
      });

      // If searching by amount, sort by amount match quality first
      if (searchAmount !== null) {
        filtered = filtered.sort((a, b) => {
          const aAmountMatch = amountMatches(a.amount, searchAmount);
          const bAmountMatch = amountMatches(b.amount, searchAmount);

          // Exact/close amount matches first
          if (aAmountMatch && !bAmountMatch) return -1;
          if (bAmountMatch && !aAmountMatch) return 1;

          // Among amount matches, prefer exact matches
          if (aAmountMatch && bAmountMatch) {
            const aDiff = Math.abs(Math.abs(a.amount) - Math.abs(searchAmount));
            const bDiff = Math.abs(Math.abs(b.amount) - Math.abs(searchAmount));
            if (aDiff !== bDiff) return aDiff - bDiff;
          }

          // Fall back to suggestion sorting
          const aSuggestion = suggestionMap.get(a.id);
          const bSuggestion = suggestionMap.get(b.id);
          if (aSuggestion && bSuggestion) return bSuggestion.confidence - aSuggestion.confidence;
          if (aSuggestion) return -1;
          if (bSuggestion) return 1;

          return b.date.toMillis() - a.date.toMillis();
        });

        return filtered;
      }
    }

    // Sort: suggested transactions first (by confidence), then by date
    return filtered.sort((a, b) => {
      const aSuggestion = suggestionMap.get(a.id);
      const bSuggestion = suggestionMap.get(b.id);

      // Both are suggestions - sort by confidence
      if (aSuggestion && bSuggestion) {
        return bSuggestion.confidence - aSuggestion.confidence;
      }

      // Only one is a suggestion - it goes first
      if (aSuggestion) return -1;
      if (bSuggestion) return 1;

      // Neither is a suggestion - sort by date (newest first)
      return b.date.toMillis() - a.date.toMillis();
    });
  }, [transactions, search, suggestionMap]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSearch("");
      setSelectedIds(new Set());
      setPreviewTransaction(null);
      setIsConnecting(false);
    }
  }, [open]);

  const toggleSelection = (transaction: Transaction) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(transaction.id)) {
        next.delete(transaction.id);
      } else {
        next.add(transaction.id);
      }
      return next;
    });
    setPreviewTransaction(transaction);
  };

  const handleConnect = async () => {
    if (selectedIds.size === 0) return;

    setIsConnecting(true);
    try {
      await onSelect(Array.from(selectedIds));
      onClose();
    } catch (error) {
      console.error("Failed to connect transactions:", error);
    } finally {
      setIsConnecting(false);
    }
  };

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: currency || "EUR",
    }).format(amount / 100);
  };

  const formatFileAmount = (amount: number | null | undefined, currency: string | null | undefined) => {
    if (amount == null) return null;
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: currency || "EUR",
    }).format(amount / 100);
  };

  const isTransactionConnected = (transactionId: string) =>
    connectedTransactionIds.includes(transactionId);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-[900px] h-[700px] p-0 gap-0 flex flex-col">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>Connect Transaction to File</DialogTitle>
          {fileInfo && (
            <p className="text-sm text-muted-foreground">
              {fileInfo.fileName}
              {fileInfo.extractedDate && (
                <> &middot; {format(fileInfo.extractedDate, "MMM d, yyyy")}</>
              )}
              {fileInfo.extractedAmount != null && (
                <>
                  {" "}
                  &middot;{" "}
                  <span className={fileInfo.extractedAmount < 0 ? "text-red-600" : "text-green-600"}>
                    {formatFileAmount(fileInfo.extractedAmount, fileInfo.extractedCurrency)}
                  </span>
                </>
              )}
            </p>
          )}
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Left column: Transaction search and list */}
          <div className="w-[350px] border-r flex flex-col">
            {/* Search */}
            <div className="p-4 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or amount (e.g. 123,45)"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Transaction list */}
            <ScrollArea className="flex-1">
              {loading ? (
                <div className="p-4 text-sm text-muted-foreground text-center">
                  Loading transactions...
                </div>
              ) : filteredTransactions.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center">
                  {search ? "No transactions match your search" : "No transactions found"}
                </div>
              ) : (
                <TooltipProvider>
                  <div className="p-2 space-y-1">
                    {filteredTransactions.map((transaction) => {
                      const isConnected = isTransactionConnected(transaction.id);
                      const isSelected = selectedIds.has(transaction.id);
                      const isPreviewing = previewTransaction?.id === transaction.id;
                      const suggestion = suggestionMap.get(transaction.id);

                      return (
                        <button
                          key={transaction.id}
                          type="button"
                          disabled={isConnected}
                          onClick={() => toggleSelection(transaction)}
                          className={cn(
                            "w-full flex items-start gap-3 p-3 rounded-md text-left transition-colors",
                            isSelected && "bg-primary/10",
                            isPreviewing && "ring-1 ring-primary",
                            !isSelected && !isConnected && "hover:bg-muted",
                            isConnected && "opacity-50 cursor-not-allowed",
                            suggestion && !isSelected && !isConnected && "bg-amber-50 dark:bg-amber-950/20"
                          )}
                        >
                          {/* Checkbox */}
                          <div className={cn(
                            "flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5",
                            isSelected
                              ? "bg-primary border-primary"
                              : "border-muted-foreground/30",
                            isConnected && "bg-muted border-muted"
                          )}>
                            {(isSelected || isConnected) && (
                              <Check className={cn(
                                "h-3 w-3",
                                isSelected ? "text-primary-foreground" : "text-muted-foreground"
                              )} />
                            )}
                          </div>

                          {/* Transaction info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate">
                                {transaction.partner || transaction.name}
                              </p>
                              {isConnected && (
                                <Badge variant="secondary" className="text-xs">
                                  <Link2 className="h-3 w-3 mr-1" />
                                  Connected
                                </Badge>
                              )}
                              {suggestion && !isConnected && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge
                                      variant="outline"
                                      className="text-xs bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900 dark:text-amber-200 dark:border-amber-700"
                                    >
                                      <Sparkles className="h-3 w-3 mr-1" />
                                      {suggestion.confidence}%
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent side="right" className="text-xs">
                                    <p className="font-medium mb-1">Suggested match</p>
                                    <p className="text-muted-foreground">
                                      {suggestion.matchSources
                                        .map((s) => getTransactionMatchSourceLabel(s))
                                        .join(", ")}
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{format(transaction.date.toDate(), "MMM d, yyyy")}</span>
                              <span>&middot;</span>
                              <span
                                className={cn(
                                  "font-medium",
                                  transaction.amount < 0 ? "text-red-600" : "text-green-600"
                                )}
                              >
                                {formatAmount(transaction.amount, transaction.currency)}
                              </span>
                            </div>
                            {transaction.name && transaction.partner && (
                              <p className="text-xs text-muted-foreground truncate mt-0.5">
                                {transaction.name}
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </TooltipProvider>
              )}
            </ScrollArea>
          </div>

          {/* Right column: Transaction preview */}
          <div className="flex-1 flex flex-col">
            {previewTransaction ? (
              <>
                {/* Transaction details */}
                <div className="flex-1 p-6 overflow-auto">
                  <h3 className="text-lg font-semibold mb-4">Transaction Details</h3>

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Date</p>
                        <p className="font-medium">
                          {format(previewTransaction.date.toDate(), "MMMM d, yyyy")}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Amount</p>
                        <p
                          className={cn(
                            "font-medium text-lg",
                            previewTransaction.amount < 0 ? "text-red-600" : "text-green-600"
                          )}
                        >
                          {formatAmount(previewTransaction.amount, previewTransaction.currency)}
                        </p>
                      </div>
                    </div>

                    {previewTransaction.partner && (
                      <div>
                        <p className="text-sm text-muted-foreground">Counterparty</p>
                        <p className="font-medium">{previewTransaction.partner}</p>
                      </div>
                    )}

                    <div>
                      <p className="text-sm text-muted-foreground">Description</p>
                      <p className="font-medium">{previewTransaction.name}</p>
                    </div>

                    {previewTransaction.reference && (
                      <div>
                        <p className="text-sm text-muted-foreground">Reference</p>
                        <p className="font-mono text-sm">{previewTransaction.reference}</p>
                      </div>
                    )}

                    {previewTransaction.partnerIban && (
                      <div>
                        <p className="text-sm text-muted-foreground">IBAN</p>
                        <p className="font-mono text-sm">{previewTransaction.partnerIban}</p>
                      </div>
                    )}

                    {/* Already connected files info */}
                    {previewTransaction.fileIds && previewTransaction.fileIds.length > 0 && (
                      <div className="pt-4 border-t">
                        <p className="text-sm text-muted-foreground mb-2">
                          Already connected files: {previewTransaction.fileIds.length}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Selection summary */}
                {selectedIds.size > 0 && (
                  <div className="border-t p-4 bg-muted/30">
                    <h4 className="font-medium text-sm mb-1">
                      {selectedIds.size} transaction{selectedIds.size !== 1 ? "s" : ""} selected
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Click transactions to add or remove from selection
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Receipt className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Click transactions to select</p>
                  <p className="text-xs mt-1">You can select multiple</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t p-4 flex justify-between items-center">
          <div className="text-sm text-muted-foreground">
            {selectedIds.size > 0 && (
              <span>{selectedIds.size} selected</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleConnect}
              disabled={selectedIds.size === 0 || isConnecting}
            >
              {isConnecting
                ? "Connecting..."
                : selectedIds.size === 0
                ? "Select Transactions"
                : `Connect ${selectedIds.size} Transaction${selectedIds.size !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
