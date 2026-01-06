"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import {
  X,
  ChevronUp,
  ChevronDown,
  Download,
  Trash2,
  Plus,
} from "lucide-react";
import { TaxFile, TransactionSuggestion } from "@/types/file";
import { UserPartner, GlobalPartner, PartnerSuggestion } from "@/types/partner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { FilePreview } from "./file-preview";
import { FileViewerDialog } from "./file-viewer-dialog";
import { FileExtractedInfo } from "./file-extracted-info";
import { FileConnectionsList } from "./file-connections-list";
import { FileTransactionSuggestions } from "./file-transaction-suggestions";
import { ConnectTransactionDialog } from "./connect-transaction-dialog";
import { AddPartnerDialog } from "@/components/partners/add-partner-dialog";
import { PartnerPill } from "@/components/partners/partner-pill";
import {
  OperationsContext,
  disconnectFileFromTransaction,
  connectFileToTransaction,
  assignPartnerToFile,
  removePartnerFromFile,
  acceptTransactionSuggestion,
  dismissTransactionSuggestion,
} from "@/lib/operations";
import { useFilePartnerSuggestions, PartnerSuggestionWithDetails } from "@/hooks/use-partner-suggestions";
import { shouldAutoApply } from "@/lib/matching/partner-matcher";
import { db } from "@/lib/firebase/config";
import { cn } from "@/lib/utils";

const MOCK_USER_ID = "dev-user-123";

// Consistent field row component (matching transaction-details.tsx)
function FieldRow({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4", className)}>
      <span className="text-sm text-muted-foreground shrink-0 sm:w-28">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  );
}

interface FileDetailPanelProps {
  file: TaxFile;
  onClose: () => void;
  onNavigatePrevious?: () => void;
  onNavigateNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  onDelete?: () => void;
  userPartners: UserPartner[];
  globalPartners: GlobalPartner[];
  onCreatePartner: (data: { name: string; aliases?: string[]; vatId?: string; ibans?: string[]; website?: string; country?: string; notes?: string }) => Promise<string>;
}

export function FileDetailPanel({
  file,
  onClose,
  onNavigatePrevious,
  onNavigateNext,
  hasPrevious = false,
  hasNext = false,
  onDelete,
  userPartners,
  globalPartners,
  onCreatePartner,
}: FileDetailPanelProps) {
  const router = useRouter();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [isAddPartnerOpen, setIsAddPartnerOpen] = useState(false);
  const [isAssigningPartner, setIsAssigningPartner] = useState(false);
  const [isConnectTransactionOpen, setIsConnectTransactionOpen] = useState(false);

  const ctx: OperationsContext = useMemo(
    () => ({ db, userId: MOCK_USER_ID }),
    []
  );

  // Find assigned partner from lists
  const assignedPartner = useMemo(() => {
    if (!file.partnerId) return null;
    if (file.partnerType === "user") {
      return userPartners.find((p) => p.id === file.partnerId) || null;
    }
    if (file.partnerType === "global") {
      return globalPartners.find((p) => p.id === file.partnerId) || null;
    }
    return null;
  }, [file.partnerId, file.partnerType, userPartners, globalPartners]);

  // Get partner suggestions based on extracted data
  const suggestions = useFilePartnerSuggestions(file, userPartners, globalPartners);

  // Track which files have been auto-applied to prevent repeated auto-applies
  const autoAppliedRef = useRef<Set<string>>(new Set());

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleAssignPartner = useCallback(
    async (
      partnerId: string,
      partnerType: "user" | "global",
      matchedBy: "manual" | "suggestion" | "auto",
      confidence?: number
    ) => {
      setIsAssigningPartner(true);
      try {
        await assignPartnerToFile(ctx, file.id, partnerId, partnerType, matchedBy, confidence);
      } finally {
        setIsAssigningPartner(false);
      }
    },
    [ctx, file.id]
  );

  // Auto-apply high-confidence suggestions (>= 89%)
  // Uses "auto" matchedBy because this is automatic, not user-initiated
  useEffect(() => {
    if (assignedPartner || isAssigningPartner) return;
    if (autoAppliedRef.current.has(file.id)) return;

    const highConfidenceSuggestion = suggestions.find(
      (s) => shouldAutoApply(s.confidence)
    );

    if (highConfidenceSuggestion) {
      autoAppliedRef.current.add(file.id);
      handleAssignPartner(
        highConfidenceSuggestion.partnerId,
        highConfidenceSuggestion.partnerType,
        "auto",
        highConfidenceSuggestion.confidence
      ).catch((error) => {
        console.error("Failed to auto-apply partner to file:", error);
        autoAppliedRef.current.delete(file.id);
      });
    }
  }, [file.id, assignedPartner, suggestions, isAssigningPartner, handleAssignPartner]);

  const handleRemovePartner = useCallback(async () => {
    setIsAssigningPartner(true);
    try {
      // Add to autoAppliedRef BEFORE removal to prevent auto-apply from re-assigning
      autoAppliedRef.current.add(file.id);
      await removePartnerFromFile(ctx, file.id);
    } catch (error) {
      // If removal failed, allow auto-apply again
      autoAppliedRef.current.delete(file.id);
      throw error;
    } finally {
      setIsAssigningPartner(false);
    }
  }, [ctx, file.id]);

  const handleAddPartner = useCallback(
    async (data: { name: string; aliases?: string[]; vatId?: string; ibans?: string[]; website?: string; country?: string; notes?: string }) => {
      const partnerId = await onCreatePartner(data);
      await handleAssignPartner(partnerId, "user", "manual", 100);
      return partnerId;
    },
    [onCreatePartner, handleAssignPartner]
  );

  const handleSelectExistingPartner = useCallback(
    async (partnerId: string, partnerType: "user" | "global") => {
      await handleAssignPartner(partnerId, partnerType, "manual", 100);
    },
    [handleAssignPartner]
  );

  const handleSelectSuggestion = useCallback(
    async (suggestion: { partnerId: string; partnerType: "user" | "global"; confidence: number }) => {
      await handleAssignPartner(
        suggestion.partnerId,
        suggestion.partnerType,
        "suggestion",
        suggestion.confidence
      );
    },
    [handleAssignPartner]
  );

  const handleNavigateToPartner = useCallback(() => {
    if (file.partnerId) {
      router.push(`/partners?id=${file.partnerId}`);
    }
  }, [router, file.partnerId]);

  const handleDisconnect = useCallback(
    async (transactionId: string) => {
      await disconnectFileFromTransaction(ctx, file.id, transactionId);
    },
    [ctx, file.id]
  );

  const handleConnectTransactions = useCallback(
    async (transactionIds: string[]) => {
      // Connect all selected transactions
      await Promise.all(
        transactionIds.map((transactionId) =>
          connectFileToTransaction(ctx, file.id, transactionId, "manual")
        )
      );
    },
    [ctx, file.id]
  );

  const handleAcceptTransactionSuggestion = useCallback(
    async (suggestion: TransactionSuggestion) => {
      await acceptTransactionSuggestion(
        ctx,
        file.id,
        suggestion.transactionId,
        suggestion.confidence,
        suggestion.matchSources
      );
    },
    [ctx, file.id]
  );

  const handleDismissTransactionSuggestion = useCallback(
    async (transactionId: string) => {
      await dismissTransactionSuggestion(ctx, file.id, transactionId);
    },
    [ctx, file.id]
  );

  return (
    <>
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between py-3 border-b px-2">
          <h2 className="text-lg font-semibold pl-2 truncate">{file.fileName}</h2>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={onNavigatePrevious}
              disabled={!hasPrevious}
              className="h-8 w-8"
            >
              <ChevronUp className="h-4 w-4" />
              <span className="sr-only">Previous file</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onNavigateNext}
              disabled={!hasNext}
              className="h-8 w-8"
            >
              <ChevronDown className="h-4 w-4" />
              <span className="sr-only">Next file</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </Button>
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-6">
            {/* Preview thumbnail - 25% width, click to open viewer */}
            <div className="flex gap-4">
              <div className="w-1/4 flex-shrink-0">
                <FilePreview
                  downloadUrl={file.downloadUrl}
                  fileType={file.fileType}
                  fileName={file.fileName}
                  onClick={() => setViewerOpen(true)}
                />
                <p className="text-xs text-muted-foreground text-center mt-1">
                  Click to view
                </p>
              </div>
              <div className="flex-1 space-y-2">
                {/* Quick file info */}
                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Uploaded</span>
                    <span>{format(file.uploadedAt.toDate(), "MMM d, yyyy")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Size</span>
                    <span>{formatFileSize(file.fileSize)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type</span>
                    <span className="truncate ml-2">{file.fileType.split("/")[1].toUpperCase()}</span>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Extracted Info */}
            <FileExtractedInfo file={file} />

            <Separator />

            {/* Partner Assignment Section */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Partner</h3>

              <FieldRow label="Connect">
                {assignedPartner ? (
                  <PartnerPill
                    name={assignedPartner.name}
                    confidence={file.partnerMatchConfidence ?? undefined}
                    partnerType={file.partnerType ?? undefined}
                    onClick={handleNavigateToPartner}
                    onRemove={handleRemovePartner}
                  />
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsAddPartnerOpen(true)}
                    className="h-7 px-3"
                    disabled={isAssigningPartner}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                )}
              </FieldRow>

              {/* Partner suggestions when no match */}
              {!assignedPartner && suggestions.length > 0 && (
                <FieldRow label="Suggestions">
                  <div className="flex flex-col gap-1.5">
                    {suggestions.map((suggestion) => (
                      <PartnerPill
                        key={suggestion.partnerId}
                        name={suggestion.partner.name}
                        confidence={suggestion.confidence}
                        variant="suggestion"
                        partnerType={suggestion.partnerType}
                        onClick={() => handleSelectSuggestion(suggestion)}
                        disabled={isAssigningPartner}
                      />
                    ))}
                  </div>
                </FieldRow>
              )}
            </div>

            <Separator />

            {/* Connected Transactions */}
            <FileConnectionsList
              file={file}
              onDisconnect={handleDisconnect}
              onConnectClick={() => setIsConnectTransactionOpen(true)}
            />

            {/* Transaction Suggestions */}
            {file.transactionSuggestions && file.transactionSuggestions.length > 0 && (
              <>
                <Separator />
                <FileTransactionSuggestions
                  file={file}
                  onAccept={handleAcceptTransactionSuggestion}
                  onDismiss={handleDismissTransactionSuggestion}
                />
              </>
            )}
          </div>
        </ScrollArea>

        {/* Footer actions */}
        <div className="p-4 border-t flex gap-2">
          <Button variant="outline" className="flex-1" asChild>
            <a href={file.downloadUrl} download={file.fileName}>
              <Download className="h-4 w-4 mr-2" />
              Download
            </a>
          </Button>
          {onDelete && (
            <Button
              variant="outline"
              className="flex-1 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Full viewer dialog */}
      <FileViewerDialog
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        downloadUrl={file.downloadUrl}
        fileType={file.fileType}
        fileName={file.fileName}
        extractedFields={file.extractedFields}
      />

      {/* Add Partner Dialog */}
      <AddPartnerDialog
        open={isAddPartnerOpen}
        onClose={() => setIsAddPartnerOpen(false)}
        onAdd={handleAddPartner}
        onSelectPartner={handleSelectExistingPartner}
        onSelectSuggestion={handleSelectSuggestion}
        suggestions={suggestions}
        userPartners={userPartners}
        globalPartners={globalPartners}
        initialData={{
          name: file.extractedPartner || undefined,
          vatId: file.extractedVatId || undefined,
          ibans: file.extractedIban ? [file.extractedIban] : undefined,
          address: file.extractedAddress ? { street: file.extractedAddress, country: "" } : undefined,
        }}
      />

      {/* Connect Transaction Dialog */}
      <ConnectTransactionDialog
        open={isConnectTransactionOpen}
        onClose={() => setIsConnectTransactionOpen(false)}
        onSelect={handleConnectTransactions}
        connectedTransactionIds={file.transactionIds}
        fileInfo={{
          fileName: file.fileName,
          extractedDate: file.extractedDate?.toDate() || null,
          extractedAmount: file.extractedAmount,
          extractedCurrency: file.extractedCurrency,
          extractedPartner: file.extractedPartner,
          extractedIban: file.extractedIban,
          extractedText: file.extractedText,
          partnerId: file.partnerId,
        }}
        suggestions={file.transactionSuggestions}
      />
    </>
  );
}
