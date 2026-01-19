"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PanelHeader, SectionHeader } from "@/components/ui/detail-panel-primitives";
import {
  Tag,
  Sparkles,
  Receipt,
  ChevronRight,
  Plus,
  Trash2,
  Building2,
  Ban,
  X,
} from "lucide-react";
import { UserNoReceiptCategory, CategoryLearnedPattern } from "@/types/no-receipt-category";
import { Transaction } from "@/types/transaction";
import { UserPartner } from "@/types/partner";
import { useNoReceiptCategories } from "@/hooks/use-no-receipt-categories";
import { usePartners } from "@/hooks/use-partners";
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import Link from "next/link";
import { useAuth } from "@/components/auth";

interface CategoryDetailPanelProps {
  category: UserNoReceiptCategory;
  onClose: () => void;
}

export function CategoryDetailPanel({ category, onClose }: CategoryDetailPanelProps) {
  const { userId } = useAuth();
  const { updateCategory, clearRemoval } = useNoReceiptCategories();
  const { partners: allPartners } = usePartners();
  const [manualTransactions, setManualTransactions] = useState<Transaction[]>([]);
  const [autoTransactions, setAutoTransactions] = useState<Transaction[]>([]);
  const [manualRemovalTransactions, setManualRemovalTransactions] = useState<Transaction[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  const [newPattern, setNewPattern] = useState("");
  const [isAddingPattern, setIsAddingPattern] = useState(false);

  // Get partner details for matched partners
  const matchedPartners = allPartners.filter((p) =>
    category.matchedPartnerIds.includes(p.id)
  );

  // Fetch connected transactions, separated by match type
  useEffect(() => {
    async function fetchTransactions() {
      setIsLoadingTransactions(true);
      try {
        const q = query(
          collection(db, "transactions"),
          where("userId", "==", userId),
          where("noReceiptCategoryId", "==", category.id),
          orderBy("date", "desc"),
          limit(50)
        );
        const snapshot = await getDocs(q);
        const txs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Transaction[];

        // Separate manual vs auto/suggestion connections
        const manual = txs.filter(tx => tx.noReceiptCategoryMatchedBy === "manual");
        const auto = txs.filter(tx => tx.noReceiptCategoryMatchedBy !== "manual");

        setManualTransactions(manual.slice(0, 10));
        setAutoTransactions(auto.slice(0, 10));
        setTotalCount(txs.length);
      } catch (error) {
        console.error("Failed to fetch transactions:", error);
      } finally {
        setIsLoadingTransactions(false);
      }
    }
    fetchTransactions();
  }, [category.id, userId]);

  // Fetch manual removal transactions (for displaying details)
  useEffect(() => {
    async function fetchManualRemovalTransactions() {
      if (category.manualRemovals && category.manualRemovals.length > 0) {
        const uniqueRemovalIds = [...new Set(category.manualRemovals.map(r => r.transactionId))];
        // Fetch in batches of 10 (Firestore limit for 'in' queries)
        const transactionIds = uniqueRemovalIds.slice(0, 10);
        if (transactionIds.length > 0) {
          try {
            const q = query(
              collection(db, "transactions"),
              where("userId", "==", userId),
              where("__name__", "in", transactionIds)
            );
            const snapshot = await getDocs(q);
            const txs = snapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            })) as Transaction[];
            setManualRemovalTransactions(txs);
          } catch (error) {
            console.error("Failed to fetch manual removal transactions:", error);
          }
        }
      } else {
        setManualRemovalTransactions([]);
      }
    }
    fetchManualRemovalTransactions();
  }, [category.id, category.manualRemovals, userId]);

  const handleAddPattern = async () => {
    if (!newPattern.trim()) return;

    const pattern = newPattern.trim();
    // Format as glob pattern if not already
    const formattedPattern = pattern.startsWith("*") ? pattern : `*${pattern}*`;

    const newPatternObj: CategoryLearnedPattern = {
      pattern: formattedPattern,
      confidence: 80,
      createdAt: Timestamp.now(),
      sourceTransactionIds: [],
    };

    await updateCategory(category.id, {
      learnedPatterns: [...category.learnedPatterns, newPatternObj],
    });

    setNewPattern("");
    setIsAddingPattern(false);
  };

  const handleRemovePattern = async (patternToRemove: string) => {
    const updatedPatterns = category.learnedPatterns.filter(
      (p) => p.pattern !== patternToRemove
    );
    await updateCategory(category.id, {
      learnedPatterns: updatedPatterns,
    });
  };

  const handleRemovePartner = async (partnerId: string) => {
    const updatedPartnerIds = category.matchedPartnerIds.filter(
      (id) => id !== partnerId
    );
    await updateCategory(category.id, {
      matchedPartnerIds: updatedPartnerIds,
    });
  };

  const handleClearManualRemoval = async (transactionId: string) => {
    await clearRemoval(category.id, transactionId);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <PanelHeader
        title={category.name}
        icon={<Tag className="h-5 w-5 text-muted-foreground" />}
        onClose={onClose}
      />

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Description */}
        <div>
          <SectionHeader className="mb-2">Description</SectionHeader>
          <p className="text-sm">{category.description}</p>
          <p className="text-sm text-muted-foreground mt-1">{category.helperText}</p>
        </div>

        {/* Learned Patterns */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <SectionHeader>
              <Sparkles className="h-3 w-3 inline mr-1" />
              Learned Patterns ({category.learnedPatterns.length})
            </SectionHeader>
            {!isAddingPattern && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setIsAddingPattern(true)}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            )}
          </div>

          {isAddingPattern && (
            <div className="flex items-center gap-2 mb-3">
              <Input
                value={newPattern}
                onChange={(e) => setNewPattern(e.target.value)}
                placeholder="Enter pattern (e.g., *stripe* or *paypal*)"
                className="h-8 text-sm flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddPattern();
                  if (e.key === "Escape") {
                    setIsAddingPattern(false);
                    setNewPattern("");
                  }
                }}
                autoFocus
              />
              <Button size="sm" className="h-8" onClick={handleAddPattern}>
                Add
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => {
                  setIsAddingPattern(false);
                  setNewPattern("");
                }}
              >
                Cancel
              </Button>
            </div>
          )}

          {category.learnedPatterns.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No patterns learned yet. Patterns are automatically created when you manually assign transactions to this category.
            </p>
          ) : (
            <div className="space-y-1.5">
              {category.learnedPatterns.map((pattern, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 group"
                >
                  <code className="text-xs bg-muted px-2 py-1 rounded font-mono flex-1 truncate">
                    {pattern.pattern}
                  </code>
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {pattern.confidence}%
                  </Badge>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {pattern.sourceTransactionIds.length} tx
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleRemovePattern(pattern.pattern)}
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Matched Partners */}
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            <Building2 className="h-3 w-3 inline mr-1" />
            Matched Partners ({matchedPartners.length})
          </h3>
          {matchedPartners.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No partners linked yet. Partners are automatically linked when you assign their transactions to this category.
            </p>
          ) : (
            <div className="space-y-1">
              {matchedPartners.map((partner) => (
                <div
                  key={partner.id}
                  className="flex items-center justify-between gap-2 p-2 -mx-2 rounded hover:bg-muted/50 transition-colors group"
                >
                  <Link
                    href={`/partners?id=${partner.id}`}
                    className="flex items-center gap-2 min-w-0 flex-1"
                  >
                    <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm truncate">{partner.name}</span>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleRemovePartner(partner.id)}
                  >
                    <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Connected Transactions */}
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            <Receipt className="h-3 w-3 inline mr-1" />
            Connected Transactions
            {!isLoadingTransactions && (
              <span className="ml-1 text-foreground">({totalCount})</span>
            )}
          </h3>
          {isLoadingTransactions ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : manualTransactions.length === 0 && autoTransactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions connected yet</p>
          ) : (
            <div className="space-y-1">
              {/* Manual connections */}
              {manualTransactions.length > 0 && (
                <>
                  <p className="text-xs text-muted-foreground font-medium mt-2 mb-1">
                    Manually connected ({manualTransactions.length})
                  </p>
                  {manualTransactions.map((tx) => (
                    <Link
                      key={tx.id}
                      href={`/transactions?id=${tx.id}`}
                      className="flex items-center justify-between gap-2 p-2 -mx-2 rounded hover:bg-muted/50 transition-colors group"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate">{tx.partner || tx.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {tx.date?.toDate ? format(tx.date.toDate(), "MMM d, yyyy") : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-sm font-medium tabular-nums ${
                            tx.amount < 0 ? "text-red-600" : "text-green-600"
                          }`}
                        >
                          {new Intl.NumberFormat("de-DE", {
                            style: "currency",
                            currency: tx.currency || "EUR",
                          }).format(tx.amount / 100)}
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </Link>
                  ))}
                </>
              )}

              {/* Auto-matched connections */}
              {autoTransactions.length > 0 && (
                <>
                  <p className="text-xs text-muted-foreground font-medium mt-3 mb-1 pt-2 border-t">
                    Auto-matched ({autoTransactions.length})
                  </p>
                  {autoTransactions.map((tx) => (
                    <Link
                      key={tx.id}
                      href={`/transactions?id=${tx.id}`}
                      className="flex items-center justify-between gap-2 p-2 -mx-2 rounded hover:bg-muted/50 transition-colors group"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate">{tx.partner || tx.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {tx.date?.toDate ? format(tx.date.toDate(), "MMM d, yyyy") : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-sm font-medium tabular-nums ${
                            tx.amount < 0 ? "text-red-600" : "text-green-600"
                          }`}
                        >
                          {new Intl.NumberFormat("de-DE", {
                            style: "currency",
                            currency: tx.currency || "EUR",
                          }).format(tx.amount / 100)}
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </Link>
                  ))}
                </>
              )}

              {totalCount > 20 && (
                <Link
                  href={`/transactions?categoryId=${category.id}`}
                  className="text-xs text-primary hover:underline block mt-2"
                >
                  View all {totalCount} transactions
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Manual Removals (False Positives) */}
        {category.manualRemovals && category.manualRemovals.length > 0 && (() => {
          // Deduplicate by transactionId (can have duplicates from repeated remove attempts)
          const uniqueRemovals = category.manualRemovals.filter(
            (removal, index, self) =>
              index === self.findIndex((r) => r.transactionId === removal.transactionId)
          );
          return (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                <Ban className="h-3 w-3 inline mr-1" />
                Manual Removals
                <span className="ml-1 text-foreground">({uniqueRemovals.length})</span>
              </h3>
              <p className="text-xs text-muted-foreground mb-2">
                Transactions you removed from this category. Used to improve pattern learning.
              </p>
              <div className="space-y-1">
                {uniqueRemovals.slice(0, 10).map((removal) => {
                  // Find the actual transaction data for date and amount
                  const tx = manualRemovalTransactions.find(t => t.id === removal.transactionId);
                  const transactionId = tx?.id || removal.transactionId;
                  return (
                    <div
                      key={transactionId}
                      className="flex items-center justify-between gap-2 p-2 -mx-2 rounded hover:bg-muted/50 transition-colors group"
                    >
                      <Link
                        href={`/transactions?id=${transactionId}`}
                        className="min-w-0 flex-1"
                      >
                        <p className="text-sm truncate">{tx?.name || removal.name || removal.partner || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">
                          {tx?.date?.toDate ? format(tx.date.toDate(), "MMM d, yyyy") : ""}
                        </p>
                      </Link>
                      <div className="flex items-center gap-2 shrink-0">
                        {tx && (
                          <span className={`text-sm font-medium tabular-nums ${tx.amount < 0 ? "text-red-600" : "text-green-600"}`}>
                            {new Intl.NumberFormat("de-DE", { style: "currency", currency: tx.currency || "EUR" }).format(tx.amount / 100)}
                          </span>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleClearManualRemoval(transactionId)}
                          title="Allow this transaction to be auto-matched again"
                        >
                          <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {uniqueRemovals.length > 10 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    +{uniqueRemovals.length - 10} more
                  </p>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
