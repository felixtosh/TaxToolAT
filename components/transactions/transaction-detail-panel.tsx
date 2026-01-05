"use client";

import { useCallback, useState, useEffect } from "react";
import { format } from "date-fns";
import { X, ChevronUp, ChevronDown, Pencil, Check } from "lucide-react";
import { Transaction } from "@/types/transaction";
import { TransactionSource } from "@/types/source";
import { TransactionDetails } from "@/components/sidebar/transaction-details";
import { CompactFileUploadZone } from "@/components/sidebar/compact-file-upload-zone";
import { ReceiptList } from "@/components/sidebar/receipt-list";
import { TransactionHistory } from "@/components/sidebar/transaction-history";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserPartner, GlobalPartner, PartnerFormData } from "@/types/partner";
import { cn } from "@/lib/utils";

// Consistent field row component
function FieldRow({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4", className)}>
      <span className="text-sm text-muted-foreground shrink-0 sm:w-32">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  );
}

interface TransactionDetailPanelProps {
  transaction: Transaction;
  source?: TransactionSource;
  onClose: () => void;
  onUpdate: (updates: Partial<Transaction>) => Promise<void>;
  onNavigatePrevious?: () => void;
  onNavigateNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  partners: UserPartner[];
  globalPartners: GlobalPartner[];
  onAssignPartner: (transactionId: string, partnerId: string, partnerType: "global" | "user", matchedBy: "manual" | "suggestion", confidence?: number) => Promise<void>;
  onRemovePartner: (transactionId: string) => Promise<void>;
  onCreatePartner: (data: PartnerFormData) => Promise<string>;
}

export function TransactionDetailPanel({
  transaction,
  source,
  onClose,
  onUpdate,
  onNavigatePrevious,
  onNavigateNext,
  hasPrevious = false,
  hasNext = false,
  partners,
  globalPartners,
  onAssignPartner,
  onRemovePartner,
  onCreatePartner,
}: TransactionDetailPanelProps) {

  // Cost description editing state
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [description, setDescription] = useState(transaction.description || "");
  const [isSaving, setIsSaving] = useState(false);

  // Update local state when transaction changes
  useEffect(() => {
    setDescription(transaction.description || "");
    setIsEditingDescription(false);
  }, [transaction.id, transaction.description]);

  const handleSaveDescription = async () => {
    setIsSaving(true);
    try {
      const trimmedDescription = description.trim() || null;
      await onUpdate({
        description: trimmedDescription,
        isComplete: transaction.receiptIds.length > 0 && !!trimmedDescription,
      });
      setIsEditingDescription(false);
    } finally {
      setIsSaving(false);
    }
  };

  // Handler for assigning a partner to the transaction
  const handleAssignPartner = useCallback(
    async (
      partnerId: string,
      partnerType: "global" | "user",
      matchedBy: "manual" | "suggestion",
      confidence?: number
    ) => {
      await onAssignPartner(transaction.id, partnerId, partnerType, matchedBy, confidence);
    },
    [onAssignPartner, transaction.id]
  );

  // Handler for removing a partner from the transaction
  const handleRemovePartner = useCallback(async () => {
    await onRemovePartner(transaction.id);
  }, [onRemovePartner, transaction.id]);

  // Handler for creating a new partner
  const handleCreatePartner = useCallback(
    async (data: PartnerFormData): Promise<string> => {
      return onCreatePartner(data);
    },
    [onCreatePartner]
  );

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Header with navigation and close button */}
      <div className="flex items-center justify-between py-3 border-b px-2">
        <h2 className="text-lg font-semibold pl-2">Transaction Details</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onNavigatePrevious}
            disabled={!hasPrevious}
            className="h-8 w-8"
          >
            <ChevronUp className="h-4 w-4" />
            <span className="sr-only">Previous transaction</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onNavigateNext}
            disabled={!hasNext}
            className="h-8 w-8"
          >
            <ChevronDown className="h-4 w-4" />
            <span className="sr-only">Next transaction</span>
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

      {/* Scrollable content */}
      <ScrollArea className="flex-1">
        <div className="px-4 py-6 space-y-3">
          {/* Transaction Information */}
          <TransactionDetails
            transaction={transaction}
            source={source}
            userPartners={partners}
            globalPartners={globalPartners}
            onAssignPartner={handleAssignPartner}
            onRemovePartner={handleRemovePartner}
            onCreatePartner={handleCreatePartner}
          />

          {/* Receipt Section */}
          <div className="border-t pt-3 mt-3 -mx-4 px-4 space-y-3">
            <h3 className="text-sm font-medium mb-2">Receipt</h3>

            <FieldRow label="Files" className="sm:items-start">
              <div className="flex-1 space-y-2">
                {/* Show receipts list if there are files */}
                {transaction.receiptIds.length > 0 && (
                  <ReceiptList
                    receiptIds={transaction.receiptIds}
                    transactionId={transaction.id}
                  />
                )}

                {/* Always show the compact upload dropzone */}
                <CompactFileUploadZone
                  transactionId={transaction.id}
                  onUploadComplete={(receipt) => {
                    console.log("Upload complete:", receipt);
                  }}
                />
              </div>
            </FieldRow>

          {/* Cost Description */}
          {isEditingDescription ? (
            <div className="space-y-2">
              <FieldRow label="Cost Desc.">
                <div className="flex-1 flex gap-2 items-center">
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="For tax purposes..."
                    className="h-7 text-sm"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    onClick={handleSaveDescription}
                    disabled={isSaving}
                    className="h-7 px-2"
                  >
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDescription(transaction.description || "");
                      setIsEditingDescription(false);
                    }}
                    disabled={isSaving}
                    className="h-7 px-2"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </FieldRow>
            </div>
          ) : (
            <FieldRow label="Cost Desc.">
              {transaction.description ? (
                <span className="inline-flex items-center gap-2">
                  {transaction.description}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditingDescription(true)}
                    className="h-5 px-1 text-muted-foreground"
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                </span>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditingDescription(true)}
                  className="h-7 px-3"
                >
                  <Pencil className="h-3 w-3 mr-1" />
                  Add
                </Button>
              )}
            </FieldRow>
          )}
          </div>

          {/* Metadata Section */}
          <div className="border-t pt-3 mt-3 -mx-4 px-4 space-y-3">
            <h3 className="text-sm font-medium mb-2">Metadata</h3>

            {transaction.reference && (
              <FieldRow label="Reference">
                {transaction.reference}
              </FieldRow>
            )}

            {transaction.partnerIban && (
              <FieldRow label="Partner IBAN">
                {transaction.partnerIban}
              </FieldRow>
            )}

            <FieldRow label="Dedupe Hash">
              <span className="truncate max-w-[200px]" title={transaction.dedupeHash}>
                {transaction.dedupeHash.slice(0, 16)}...
              </span>
            </FieldRow>

            {transaction.importJobId && (
              <FieldRow label="Import Job">
                {transaction.importJobId.slice(0, 8)}...
              </FieldRow>
            )}

            <FieldRow label="Created">
              {format(transaction.createdAt.toDate(), "MMM d, yyyy HH:mm")}
            </FieldRow>

            <FieldRow label="Updated">
              {format(transaction.updatedAt.toDate(), "MMM d, yyyy HH:mm")}
            </FieldRow>
          </div>

          {/* Edit History Section - at the bottom */}
          <div className="border-t pt-3 mt-3 -mx-4 px-4">
            <TransactionHistory
              transactionId={transaction.id}
              onRollback={() => {
                // Trigger a refresh of the transaction data
              }}
            />
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
