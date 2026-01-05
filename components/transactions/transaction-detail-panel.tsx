"use client";

import { useCallback } from "react";
import { X, ChevronUp, ChevronDown } from "lucide-react";
import { Transaction } from "@/types/transaction";
import { TransactionSource } from "@/types/source";
import { TransactionDetails } from "@/components/sidebar/transaction-details";
import { FileUploadZone } from "@/components/sidebar/file-upload-zone";
import { ReceiptList } from "@/components/sidebar/receipt-list";
import { TransactionHistory } from "@/components/sidebar/transaction-history";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { usePartners } from "@/hooks/use-partners";
import { useGlobalPartners } from "@/hooks/use-global-partners";
import { PartnerFormData } from "@/types/partner";

interface TransactionDetailPanelProps {
  transaction: Transaction;
  source?: TransactionSource;
  onClose: () => void;
  onUpdate: (updates: Partial<Transaction>) => Promise<void>;
  onNavigatePrevious?: () => void;
  onNavigateNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
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
}: TransactionDetailPanelProps) {
  // Load partner data
  const { partners, createPartner, assignToTransaction, removeFromTransaction } = usePartners();
  const { globalPartners } = useGlobalPartners();

  // Handler for assigning a partner to the transaction
  const handleAssignPartner = useCallback(
    async (
      partnerId: string,
      partnerType: "global" | "user",
      matchedBy: "manual" | "suggestion",
      confidence?: number
    ) => {
      await assignToTransaction(transaction.id, partnerId, partnerType, matchedBy, confidence);
    },
    [assignToTransaction, transaction.id]
  );

  // Handler for removing a partner from the transaction
  const handleRemovePartner = useCallback(async () => {
    await removeFromTransaction(transaction.id);
  }, [removeFromTransaction, transaction.id]);

  // Handler for creating a new partner
  const handleCreatePartner = useCallback(
    async (data: PartnerFormData): Promise<string> => {
      return createPartner(data);
    },
    [createPartner]
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
        <div className="px-4 py-6 space-y-6">
          {/* Transaction Information */}
          <TransactionDetails
            transaction={transaction}
            source={source}
            userPartners={partners}
            globalPartners={globalPartners}
            onUpdate={onUpdate}
            onAssignPartner={handleAssignPartner}
            onRemovePartner={handleRemovePartner}
            onCreatePartner={handleCreatePartner}
          />

          <Separator />

          {/* Receipt Section */}
          <div>
            <h3 className="text-sm font-semibold mb-4">Attached Files</h3>

            {/* Existing receipts */}
            {transaction.receiptIds.length > 0 && (
              <ReceiptList
                receiptIds={transaction.receiptIds}
                transactionId={transaction.id}
              />
            )}

            {/* Upload zone */}
            <FileUploadZone
              transactionId={transaction.id}
              onUploadComplete={(receipt) => {
                console.log("Upload complete:", receipt);
              }}
            />
          </div>

          <Separator />

          {/* Edit History Section */}
          <div>
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
