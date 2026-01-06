"use client";

import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { Search, Receipt, Check, Link2 } from "lucide-react";
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
import { Transaction } from "@/types/transaction";
import { useTransactions } from "@/hooks/use-transactions";
import { cn } from "@/lib/utils";

interface ConnectTransactionDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (transactionIds: string[]) => Promise<void>;
  /** Transaction IDs that are already connected (to show as disabled) */
  connectedTransactionIds?: string[];
  /** File info for display */
  fileInfo?: {
    fileName: string;
    extractedDate?: Date | null;
    extractedAmount?: number | null;
    extractedCurrency?: string | null;
    extractedPartner?: string | null;
  };
}

export function ConnectTransactionDialog({
  open,
  onClose,
  onSelect,
  connectedTransactionIds = [],
  fileInfo,
}: ConnectTransactionDialogProps) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewTransaction, setPreviewTransaction] = useState<Transaction | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const { transactions, loading } = useTransactions();

  // Filter transactions by search
  const filteredTransactions = useMemo(() => {
    if (!search) return transactions;
    const searchLower = search.toLowerCase();
    return transactions.filter(
      (t) =>
        t.name.toLowerCase().includes(searchLower) ||
        (t.partner?.toLowerCase() || "").includes(searchLower) ||
        (t.reference?.toLowerCase() || "").includes(searchLower)
    );
  }, [transactions, search]);

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
                  placeholder="Search transactions..."
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
                <div className="p-2 space-y-1">
                  {filteredTransactions.map((transaction) => {
                    const isConnected = isTransactionConnected(transaction.id);
                    const isSelected = selectedIds.has(transaction.id);
                    const isPreviewing = previewTransaction?.id === transaction.id;

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
                          isConnected && "opacity-50 cursor-not-allowed"
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
