"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { X, Building2, Globe, CreditCard, FileText, Pencil, Trash2, ExternalLink, Receipt, Sparkles, ChevronRight, Ban, Mail, File, UserCheck, Loader2, Check, AlertCircle } from "lucide-react";
import { UserPartner, PartnerFormData } from "@/types/partner";
import { Transaction } from "@/types/transaction";
import { TaxFile } from "@/types/file";
import { usePartners } from "@/hooks/use-partners";
import { useEmailIntegrations } from "@/hooks/use-email-integrations";
import { formatIban } from "@/lib/import/deduplication";
import { useState, useEffect, useMemo, useCallback } from "react";
import { AddPartnerDialog } from "./add-partner-dialog";
import { EmailPatternsSection } from "./email-patterns-section";
import { collection, query, where, orderBy, limit, getDocs, documentId } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { format } from "date-fns";
import Link from "next/link";
import { removeEmailPatternFromPartner, mergePartnerIntoUserData, reextractFilesForPartner, unmarkPartnerAsMe } from "@/lib/operations";
import { useUserData } from "@/hooks/use-user-data";

const MOCK_USER_ID = "dev-user-123";

interface PartnerDetailPanelProps {
  partner: UserPartner;
  onClose: () => void;
}

interface FeedbackMessage {
  type: "success" | "info" | "error";
  text: string;
}

export function PartnerDetailPanel({ partner, onClose }: PartnerDetailPanelProps) {
  const { updatePartner, deletePartner } = usePartners();
  const { integrations } = useEmailIntegrations();
  const { isPartnerMarkedAsMe } = useUserData();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isMarkingAsMe, setIsMarkingAsMe] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null);

  // Check if this partner is marked as "my company"
  const isMarkedAsMe = isPartnerMarkedAsMe(partner.id);

  // Create operations context
  const ctx = useMemo(() => ({ db, userId: MOCK_USER_ID }), []);

  const integrationLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const integration of integrations) {
      map.set(
        integration.id,
        integration.displayName || integration.email || integration.provider
      );
    }
    return map;
  }, [integrations]);

  const gmailFilePatterns = useMemo(() => {
    return (partner.fileSourcePatterns || [])
      .filter((pattern) => pattern.sourceType === "gmail")
      .sort((a, b) => {
        if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
        return b.confidence - a.confidence;
      });
  }, [partner.fileSourcePatterns]);

  // Clear feedback after 4 seconds
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  // Transaction state
  const [manualTransactions, setManualTransactions] = useState<Transaction[]>([]);
  const [autoTransactions, setAutoTransactions] = useState<Transaction[]>([]);
  const [manualRemovalTransactions, setManualRemovalTransactions] = useState<Transaction[]>([]);
  const [totalTransactionCount, setTotalTransactionCount] = useState(0);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);

  // File state
  const [manualFiles, setManualFiles] = useState<TaxFile[]>([]);
  const [autoFiles, setAutoFiles] = useState<TaxFile[]>([]);
  const [manualRemovalFiles, setManualRemovalFiles] = useState<TaxFile[]>([]);
  const [totalFileCount, setTotalFileCount] = useState(0);
  const [isLoadingFiles, setIsLoadingFiles] = useState(true);

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
        setTotalTransactionCount(transactions.length);

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

  // Fetch connected files, separated by match type
  useEffect(() => {
    async function fetchFiles() {
      setIsLoadingFiles(true);
      try {
        // Fetch all connected files
        const q = query(
          collection(db, "files"),
          where("userId", "==", MOCK_USER_ID),
          where("partnerId", "==", partner.id),
          orderBy("uploadedAt", "desc"),
          limit(50)
        );
        const snapshot = await getDocs(q);
        const files = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as TaxFile[];

        // Separate manual vs auto/suggestion connections
        const manual = files.filter((f) => f.partnerMatchedBy === "manual");
        const auto = files.filter((f) => f.partnerMatchedBy !== "manual");

        setManualFiles(manual.slice(0, 10));
        setAutoFiles(auto.slice(0, 10));
        setTotalFileCount(files.length);

        // Fetch manual file removal files (to show filename)
        if (partner.manualFileRemovals && partner.manualFileRemovals.length > 0) {
          const uniqueFileIds = [...new Set(partner.manualFileRemovals.map((r) => r.fileId))];
          const batchSize = 30;
          const removalFiles: TaxFile[] = [];

          for (let i = 0; i < uniqueFileIds.length && i < 30; i += batchSize) {
            const batch = uniqueFileIds.slice(i, i + batchSize);
            const removalQuery = query(
              collection(db, "files"),
              where("userId", "==", MOCK_USER_ID),
              where(documentId(), "in", batch)
            );
            const removalSnapshot = await getDocs(removalQuery);
            removalFiles.push(
              ...(removalSnapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
              })) as TaxFile[])
            );
          }

          setManualRemovalFiles(removalFiles);
        }
      } catch (error) {
        console.error("Failed to fetch files:", error);
      } finally {
        setIsLoadingFiles(false);
      }
    }
    fetchFiles();
  }, [partner.id, partner.manualFileRemovals]);

  const handleEdit = async (data: PartnerFormData) => {
    await updatePartner(partner.id, data);
  };

  const handleDelete = async () => {
    if (confirm("Are you sure you want to delete this partner?")) {
      await deletePartner(partner.id);
      onClose();
    }
  };

  const handleRemoveEmailPattern = async (patternIndex: number) => {
    await removeEmailPatternFromPartner(ctx, partner.id, patternIndex);
  };

  const handleMarkAsMe = async () => {
    setIsMarkingAsMe(true);
    setFeedback(null);
    try {
      // 1. Add partner info to user data
      const result = await mergePartnerIntoUserData(ctx, {
        partnerId: partner.id,
        name: partner.name,
        vatId: partner.vatId,
        ibans: partner.ibans,
      });

      // 2. Re-extract all files connected to this partner
      // This will recalculate counterparties now that we know this partner is "me"
      const reextractResult = await reextractFilesForPartner(ctx, partner.id);

      // Build description of what was added
      const added: string[] = [];
      if (result.aliasAdded) added.push("name");
      if (result.vatIdAdded) added.push("VAT ID");
      if (result.ibansAdded > 0) added.push(`${result.ibansAdded} IBAN${result.ibansAdded > 1 ? "s" : ""}`);

      if (added.length > 0 || reextractResult.queuedCount > 0) {
        const parts: string[] = [];
        if (added.length > 0) {
          parts.push(`Added ${added.join(", ")} to your identity.`);
        }
        if (reextractResult.queuedCount > 0) {
          parts.push(`Re-extracting ${reextractResult.queuedCount} file${reextractResult.queuedCount > 1 ? "s" : ""}.`);
        }
        setFeedback({
          type: "success",
          text: parts.join(" "),
        });
      } else {
        setFeedback({
          type: "info",
          text: "This partner's info is already in your user data. No files to update.",
        });
      }
    } catch (error) {
      console.error("Failed to mark partner as me:", error);
      setFeedback({
        type: "error",
        text: "Failed to add partner to your identity.",
      });
    } finally {
      setIsMarkingAsMe(false);
    }
  };

  const handleUnmarkAsMe = async () => {
    setIsMarkingAsMe(true);
    setFeedback(null);
    try {
      const removed = await unmarkPartnerAsMe(ctx, partner.id);
      if (removed) {
        setFeedback({
          type: "success",
          text: "Removed from your companies.",
        });
      }
    } catch (error) {
      console.error("Failed to unmark partner:", error);
      setFeedback({
        type: "error",
        text: "Failed to remove from your companies.",
      });
    } finally {
      setIsMarkingAsMe(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            <h2 className="font-semibold truncate">{partner.name}</h2>
          </div>
          {isMarkedAsMe && (
            <span className="text-xs text-primary ml-7">My Company</span>
          )}
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

        {/* Email Search Patterns */}
        <EmailPatternsSection
          partner={partner}
          onRemovePattern={handleRemoveEmailPattern}
        />

        {/* Tabbed Interface for Files and Transactions */}
        <Tabs defaultValue="transactions" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="transactions" className="flex items-center gap-1.5">
              <Receipt className="h-3.5 w-3.5" />
              Transactions ({totalTransactionCount})
            </TabsTrigger>
            <TabsTrigger value="files" className="flex items-center gap-1.5">
              <File className="h-3.5 w-3.5" />
              Files ({totalFileCount})
            </TabsTrigger>
          </TabsList>

          {/* Transactions Tab */}
          <TabsContent value="transactions" className="space-y-4 mt-4">
            {/* Transaction Matching Criteria */}
            <div className="p-3 bg-muted/50 rounded-lg space-y-3">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" />
                Transaction Matching Criteria
              </h3>

              {/* IBANs for matching */}
              {partner.ibans.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">
                    <CreditCard className="h-3 w-3 inline mr-1" />
                    IBAN Match <Badge variant="secondary" className="text-[10px] ml-1">100%</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {partner.ibans.map((iban, idx) => (
                      <code key={idx} className="text-[10px] bg-background px-1.5 py-0.5 rounded font-mono">
                        {formatIban(iban)}
                      </code>
                    ))}
                  </div>
                </div>
              )}

              {/* Website for matching */}
              {partner.website && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">
                    <Globe className="h-3 w-3 inline mr-1" />
                    Website Match <Badge variant="secondary" className="text-[10px] ml-1">90%</Badge>
                  </div>
                  <code className="text-[10px] bg-background px-1.5 py-0.5 rounded font-mono">
                    *{partner.website}*
                  </code>
                </div>
              )}

              {/* Glob patterns in aliases */}
              {partner.aliases.some(a => a.includes("*")) && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">
                    Manual Patterns <Badge variant="secondary" className="text-[10px] ml-1">90%</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {partner.aliases.filter(a => a.includes("*")).map((alias, idx) => (
                      <code key={idx} className="text-[10px] bg-background px-1.5 py-0.5 rounded font-mono">
                        {alias}
                      </code>
                    ))}
                  </div>
                </div>
              )}

              {/* Learned patterns (globs from manual assignments/removals) */}
              {partner.learnedPatterns && partner.learnedPatterns.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">
                    Learned Globs
                  </div>
                  <div className="space-y-1">
                    {partner.learnedPatterns.map((pattern, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <code className="text-[10px] bg-background px-1.5 py-0.5 rounded font-mono flex-1 truncate">
                          {pattern.pattern}
                        </code>
                        <Badge variant="secondary" className="text-[10px]">
                          {pattern.confidence}%
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Name/Aliases for fuzzy matching */}
              <div>
                <div className="text-xs text-muted-foreground mb-1">
                  Name Match <Badge variant="outline" className="text-[10px] ml-1">60-90%</Badge>
                </div>
                <div className="flex flex-wrap gap-1">
                  <code className="text-[10px] bg-background px-1.5 py-0.5 rounded font-mono">
                    {partner.name}
                  </code>
                  {partner.aliases.filter(a => !a.includes("*")).map((alias, idx) => (
                    <code key={idx} className="text-[10px] bg-background px-1.5 py-0.5 rounded font-mono">
                      {alias}
                    </code>
                  ))}
                </div>
              </div>
            </div>

            {/* Connected Transactions Section */}
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Connected Transactions
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

                  {totalTransactionCount > 20 && (
                    <Link
                      href={`/transactions?partnerId=${partner.id}`}
                      className="text-xs text-primary hover:underline block mt-2"
                    >
                      View all {totalTransactionCount} transactions
                    </Link>
                  )}
                </div>
              )}
            </div>

            {/* Manual Removals Section for Transactions */}
            {partner.manualRemovals && partner.manualRemovals.length > 0 && (() => {
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
                      const tx = manualRemovalTransactions.find((t) => t.id === removal.transactionId);
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
          </TabsContent>

          {/* Files Tab */}
          <TabsContent value="files" className="space-y-4 mt-4">
            {/* File Matching Criteria */}
            <div className="p-3 bg-muted/50 rounded-lg space-y-3">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <File className="h-3 w-3" />
                File Matching Criteria
              </h3>

              {/* IBANs for matching (extracted from invoices) */}
              {partner.ibans.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">
                    <CreditCard className="h-3 w-3 inline mr-1" />
                    IBAN Match <Badge variant="secondary" className="text-[10px] ml-1">100%</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {partner.ibans.map((iban, idx) => (
                      <code key={idx} className="text-[10px] bg-background px-1.5 py-0.5 rounded font-mono">
                        {formatIban(iban)}
                      </code>
                    ))}
                  </div>
                </div>
              )}

              {/* VAT ID for matching */}
              {partner.vatId && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">
                    <FileText className="h-3 w-3 inline mr-1" />
                    VAT ID Match <Badge variant="secondary" className="text-[10px] ml-1">95%</Badge>
                  </div>
                  <code className="text-[10px] bg-background px-1.5 py-0.5 rounded font-mono">
                    {partner.vatId}
                  </code>
                </div>
              )}

              {/* Email Domains (learned from Gmail files) */}
              {partner.emailDomains && partner.emailDomains.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">
                    <Mail className="h-3 w-3 inline mr-1" />
                    Email Domain Match <Badge variant="secondary" className="text-[10px] ml-1">90%</Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground mb-1 italic">
                    Learned from matched Gmail invoices
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {partner.emailDomains.map((domain, idx) => (
                      <code key={idx} className="text-[10px] bg-background px-1.5 py-0.5 rounded font-mono">
                        @{domain}
                      </code>
                    ))}
                  </div>
                </div>
              )}

              {/* Gmail search patterns */}
              {gmailFilePatterns.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">
                    <Mail className="h-3 w-3 inline mr-1" />
                    Gmail Search Patterns <Badge variant="secondary" className="text-[10px] ml-1">{gmailFilePatterns.length}</Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground mb-1 italic">
                    Learned searches and accounts used to find invoices
                  </p>
                  <div className="space-y-1">
                    {gmailFilePatterns.map((pattern, index) => {
                      const label = pattern.integrationId
                        ? integrationLabels.get(pattern.integrationId) || pattern.integrationId
                        : "Any account";

                      return (
                        <div key={`${pattern.pattern}-${index}`} className="flex items-center gap-1.5">
                          <code className="text-[10px] bg-background px-1.5 py-0.5 rounded font-mono flex-1 truncate">
                            {pattern.pattern}
                          </code>
                          <Badge variant="secondary" className="text-[10px]">
                            {label}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {pattern.confidence}%
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Website for matching */}
              {partner.website && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">
                    <Globe className="h-3 w-3 inline mr-1" />
                    Website/Domain Match <Badge variant="secondary" className="text-[10px] ml-1">90%</Badge>
                  </div>
                  <code className="text-[10px] bg-background px-1.5 py-0.5 rounded font-mono">
                    {partner.website}
                  </code>
                </div>
              )}

              {/* Name/Aliases for fuzzy matching on extractedPartner */}
              <div>
                <div className="text-xs text-muted-foreground mb-1">
                  Extracted Partner Name Match <Badge variant="outline" className="text-[10px] ml-1">60-90%</Badge>
                </div>
                <div className="flex flex-wrap gap-1">
                  <code className="text-[10px] bg-background px-1.5 py-0.5 rounded font-mono">
                    {partner.name}
                  </code>
                  {partner.aliases.filter(a => !a.includes("*")).map((alias, idx) => (
                    <code key={idx} className="text-[10px] bg-background px-1.5 py-0.5 rounded font-mono">
                      {alias}
                    </code>
                  ))}
                </div>
              </div>
            </div>

            {/* Connected Files Section */}
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Connected Files
              </h3>
              {isLoadingFiles ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : manualFiles.length === 0 && autoFiles.length === 0 ? (
                <p className="text-sm text-muted-foreground">No files connected yet</p>
              ) : (
                <div className="space-y-1">
                  {/* Manual connections */}
                  {manualFiles.length > 0 && (
                    <>
                      <p className="text-xs text-muted-foreground font-medium mt-2 mb-1">
                        Manually connected ({manualFiles.length})
                      </p>
                      {manualFiles.map((file) => (
                        <Link
                          key={file.id}
                          href={`/files?id=${file.id}`}
                          className="flex items-center justify-between gap-2 p-2 -mx-2 rounded hover:bg-muted/50 transition-colors group"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm truncate">{file.fileName}</p>
                            <p className="text-xs text-muted-foreground">
                              {file.uploadedAt?.toDate ? format(file.uploadedAt.toDate(), "MMM d, yyyy") : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {file.extractedAmount && (
                              <span className="text-sm font-medium tabular-nums">
                                {new Intl.NumberFormat("de-DE", {
                                  style: "currency",
                                  currency: file.extractedCurrency || "EUR",
                                }).format(file.extractedAmount / 100)}
                              </span>
                            )}
                            <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </Link>
                      ))}
                    </>
                  )}

                  {/* Auto-matched files */}
                  {autoFiles.length > 0 && (
                    <>
                      <p className="text-xs text-muted-foreground font-medium mt-3 mb-1 pt-2 border-t">
                        Auto-matched ({autoFiles.length})
                      </p>
                      {autoFiles.map((file) => (
                        <Link
                          key={file.id}
                          href={`/files?id=${file.id}`}
                          className="flex items-center justify-between gap-2 p-2 -mx-2 rounded hover:bg-muted/50 transition-colors group"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm truncate">{file.fileName}</p>
                            <p className="text-xs text-muted-foreground">
                              {file.uploadedAt?.toDate ? format(file.uploadedAt.toDate(), "MMM d, yyyy") : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {file.extractedAmount && (
                              <span className="text-sm font-medium tabular-nums">
                                {new Intl.NumberFormat("de-DE", {
                                  style: "currency",
                                  currency: file.extractedCurrency || "EUR",
                                }).format(file.extractedAmount / 100)}
                              </span>
                            )}
                            <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </Link>
                      ))}
                    </>
                  )}

                  {totalFileCount > 20 && (
                    <Link
                      href={`/files?partnerId=${partner.id}`}
                      className="text-xs text-primary hover:underline block mt-2"
                    >
                      View all {totalFileCount} files
                    </Link>
                  )}
                </div>
              )}
            </div>

            {/* Manual File Removals Section */}
            {partner.manualFileRemovals && partner.manualFileRemovals.length > 0 && (() => {
              const uniqueRemovals = partner.manualFileRemovals.filter(
                (removal, index, self) =>
                  index === self.findIndex((r) => r.fileId === removal.fileId)
              );
              return (
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    <Ban className="h-3 w-3 inline mr-1" />
                    Manual Removals
                    <span className="ml-1 text-foreground">({uniqueRemovals.length})</span>
                  </h3>
                  <p className="text-xs text-muted-foreground mb-2">
                    Files you removed from this partner. Used to improve file matching.
                  </p>
                  <div className="space-y-1">
                    {uniqueRemovals.slice(0, 10).map((removal) => {
                      const file = manualRemovalFiles.find((f) => f.id === removal.fileId);
                      return (
                        <Link
                          key={removal.fileId}
                          href={`/files?id=${removal.fileId}`}
                          className="flex items-center justify-between gap-2 p-2 -mx-2 rounded hover:bg-muted/50 transition-colors group"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm truncate">{file?.fileName || removal.fileName || "Unknown file"}</p>
                            <p className="text-xs text-muted-foreground">
                              {file?.uploadedAt?.toDate ? format(file.uploadedAt.toDate(), "MMM d, yyyy") : ""}
                            </p>
                          </div>
                          <X className="h-4 w-4 text-muted-foreground" />
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
          </TabsContent>
        </Tabs>
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t space-y-2">
        {/* Feedback message */}
        {feedback && (
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${
              feedback.type === "success"
                ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                : feedback.type === "error"
                ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                : "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
            }`}
          >
            {feedback.type === "success" ? (
              <Check className="h-4 w-4 flex-shrink-0" />
            ) : feedback.type === "error" ? (
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}
        {/* Mark as Me / Unmark button */}
        <Button
          variant={isMarkedAsMe ? "secondary" : "outline"}
          className="w-full"
          onClick={isMarkedAsMe ? handleUnmarkAsMe : handleMarkAsMe}
          disabled={isMarkingAsMe}
        >
          {isMarkingAsMe ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <UserCheck className="h-4 w-4 mr-2" />
          )}
          {isMarkedAsMe ? "Remove from my companies" : "This is my company"}
        </Button>
        {/* Edit and Delete buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => setIsEditDialogOpen(true)}>
            <Pencil className="h-4 w-4 mr-2" />
            Edit
          </Button>
        </div>
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
