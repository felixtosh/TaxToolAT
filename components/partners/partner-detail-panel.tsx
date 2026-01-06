"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Building2, Globe, CreditCard, FileText, Pencil, Trash2, ExternalLink, Receipt, Sparkles, ChevronRight, Ban } from "lucide-react";
import { UserPartner, PartnerFormData } from "@/types/partner";
import { Transaction } from "@/types/transaction";
import { usePartners } from "@/hooks/use-partners";
import { formatIban } from "@/lib/import/deduplication";
import { useState, useEffect } from "react";
import { AddPartnerDialog } from "./add-partner-dialog";
import { collection, query, where, orderBy, limit, getDocs, documentId } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { format } from "date-fns";
import Link from "next/link";

const MOCK_USER_ID = "dev-user-123";

interface PartnerDetailPanelProps {
  partner: UserPartner;
  onClose: () => void;
}

export function PartnerDetailPanel({ partner, onClose }: PartnerDetailPanelProps) {
  const { updatePartner, deletePartner } = usePartners();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [manualTransactions, setManualTransactions] = useState<Transaction[]>([]);
  const [autoTransactions, setAutoTransactions] = useState<Transaction[]>([]);
  const [manualRemovalTransactions, setManualRemovalTransactions] = useState<Transaction[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);

  // Fetch connected transactions, separated by match type
  useEffect(() => {
    async function fetchTransactions() {
      setIsLoadingTransactions(true);
      try {
        // Fetch all connected transactions (we need to categorize them)
        const q = query(
          collection(db, "transactions"),
          where("userId", "==", MOCK_USER_ID),
          where("partnerId", "==", partner.id),
          orderBy("date", "desc"),
          limit(50) // Fetch more to properly categorize
        );
        const snapshot = await getDocs(q);
        const transactions = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Transaction[];

        // Separate manual vs auto/suggestion connections
        const manual = transactions.filter(tx => tx.partnerMatchedBy === "manual");
        const auto = transactions.filter(tx => tx.partnerMatchedBy !== "manual");

        setManualTransactions(manual.slice(0, 10));
        setAutoTransactions(auto.slice(0, 10));
        setTotalCount(transactions.length);

        // Fetch manual removal transactions (to show date and amount)
        if (partner.manualRemovals && partner.manualRemovals.length > 0) {
          const uniqueRemovalIds = [...new Set(partner.manualRemovals.map(r => r.transactionId))];
          // Firestore 'in' queries are limited to 30 items
          const batchSize = 30;
          const removalTransactions: Transaction[] = [];

          for (let i = 0; i < uniqueRemovalIds.length && i < 30; i += batchSize) {
            const batch = uniqueRemovalIds.slice(i, i + batchSize);
            const removalQuery = query(
              collection(db, "transactions"),
              where("userId", "==", MOCK_USER_ID),
              where(documentId(), "in", batch)
            );
            const removalSnapshot = await getDocs(removalQuery);
            removalTransactions.push(...removalSnapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            })) as Transaction[]);
          }

          setManualRemovalTransactions(removalTransactions);
        }
      } catch (error) {
        console.error("Failed to fetch transactions:", error);
      } finally {
        setIsLoadingTransactions(false);
      }
    }
    fetchTransactions();
  }, [partner.id, partner.manualRemovals]);

  const handleEdit = async (data: PartnerFormData) => {
    await updatePartner(partner.id, data);
  };

  const handleDelete = async () => {
    if (confirm("Are you sure you want to delete this partner?")) {
      await deletePartner(partner.id);
      onClose();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          <Building2 className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          <h2 className="font-semibold truncate">{partner.name}</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="flex-shrink-0">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Aliases */}
        {partner.aliases.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Also known as
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {partner.aliases.map((alias, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs">
                  {alias}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* VAT ID */}
        {partner.vatId && (
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              <FileText className="h-3 w-3 inline mr-1" />
              VAT ID
            </h3>
            <p className="text-sm font-mono">{partner.vatId}</p>
          </div>
        )}

        {/* IBANs */}
        {partner.ibans.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              <CreditCard className="h-3 w-3 inline mr-1" />
              Bank Accounts
            </h3>
            <div className="space-y-1">
              {partner.ibans.map((iban, idx) => (
                <p key={idx} className="text-sm font-mono">{formatIban(iban)}</p>
              ))}
            </div>
          </div>
        )}

        {/* Website */}
        {partner.website && (
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              <Globe className="h-3 w-3 inline mr-1" />
              Website
            </h3>
            <a
              href={`https://${partner.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              {partner.website}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}

        {/* Address */}
        {partner.address && (
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Address
            </h3>
            <div className="text-sm space-y-0.5">
              {partner.address.street && (
                <p className="whitespace-pre-line">{partner.address.street}</p>
              )}
              {(partner.address.postalCode || partner.address.city) && (
                <p>
                  {[partner.address.postalCode, partner.address.city]
                    .filter(Boolean)
                    .join(" ")}
                </p>
              )}
              {partner.address.country && <p>{partner.address.country}</p>}
            </div>
          </div>
        )}

        {/* Notes */}
        {partner.notes && (
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Notes
            </h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{partner.notes}</p>
          </div>
        )}

        {/* Global Partner Link */}
        {partner.globalPartnerId && (
          <div>
            <Badge variant="outline" className="text-xs">
              Linked to Global Partner
            </Badge>
          </div>
        )}

        {/* Learned Patterns */}
        {partner.learnedPatterns && partner.learnedPatterns.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              <Sparkles className="h-3 w-3 inline mr-1" />
              Learned Patterns
            </h3>
            <div className="space-y-1.5">
              {partner.learnedPatterns.map((pattern, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <code className="text-xs bg-muted px-2 py-1 rounded font-mono flex-1 truncate">
                    {pattern.pattern}
                  </code>
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {pattern.confidence}%
                  </Badge>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {pattern.field}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

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
                        <p className="text-sm truncate">{tx.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {tx.date?.toDate ? format(tx.date.toDate(), "MMM d, yyyy") : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-sm font-medium tabular-nums ${tx.amount < 0 ? "text-red-600" : "text-green-600"}`}>
                          {new Intl.NumberFormat("de-DE", { style: "currency", currency: tx.currency || "EUR" }).format(tx.amount / 100)}
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
                        <p className="text-sm truncate">{tx.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {tx.date?.toDate ? format(tx.date.toDate(), "MMM d, yyyy") : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-sm font-medium tabular-nums ${tx.amount < 0 ? "text-red-600" : "text-green-600"}`}>
                          {new Intl.NumberFormat("de-DE", { style: "currency", currency: tx.currency || "EUR" }).format(tx.amount / 100)}
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </Link>
                  ))}
                </>
              )}

              {totalCount > 20 && (
                <Link
                  href={`/transactions?partnerId=${partner.id}`}
                  className="text-xs text-primary hover:underline block mt-2"
                >
                  View all {totalCount} transactions
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Manual Removals (False Positives) */}
        {partner.manualRemovals && partner.manualRemovals.length > 0 && (() => {
          // Deduplicate by transactionId (can have duplicates from repeated remove attempts)
          const uniqueRemovals = partner.manualRemovals.filter(
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
                Transactions you removed from this partner. Used to improve pattern learning.
              </p>
              <div className="space-y-1">
                {uniqueRemovals.slice(0, 10).map((removal) => {
                  // Find the actual transaction data for date and amount
                  const tx = manualRemovalTransactions.find(t => t.id === removal.transactionId);
                  const transactionId = tx?.id || removal.transactionId;
                  return (
                    <Link
                      key={transactionId}
                      href={`/transactions?id=${transactionId}`}
                      className="flex items-center justify-between gap-2 p-2 -mx-2 rounded hover:bg-muted/50 transition-colors group"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate">{tx?.name || removal.name || removal.partner || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">
                          {tx?.date?.toDate ? format(tx.date.toDate(), "MMM d, yyyy") : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {tx && (
                          <span className={`text-sm font-medium tabular-nums ${tx.amount < 0 ? "text-red-600" : "text-green-600"}`}>
                            {new Intl.NumberFormat("de-DE", { style: "currency", currency: tx.currency || "EUR" }).format(tx.amount / 100)}
                          </span>
                        )}
                        <X className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </Link>
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

      {/* Footer Actions */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-t bg-muted/30">
        <Button
          variant="outline"
          size="sm"
          onClick={handleDelete}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </Button>
        <Button size="sm" onClick={() => setIsEditDialogOpen(true)}>
          <Pencil className="h-4 w-4 mr-2" />
          Edit
        </Button>
      </div>

      {/* Edit Dialog */}
      <AddPartnerDialog
        open={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        onAdd={handleEdit}
        initialData={{
          name: partner.name,
          aliases: partner.aliases,
          vatId: partner.vatId || "",
          ibans: partner.ibans,
          website: partner.website || "",
          address: partner.address,
          notes: partner.notes || "",
        }}
        mode="edit"
      />
    </div>
  );
}
