"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Transaction } from "@/types/transaction";
import { TransactionSource } from "@/types/source";
import { TransactionDetails } from "./transaction-details";
import { FileUploadZone } from "./file-upload-zone";
import { ReceiptList } from "./receipt-list";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TransactionDetailSheetProps {
  transaction: Transaction | null;
  source?: TransactionSource;
  open: boolean;
  onClose: () => void;
  onUpdate: (updates: Partial<Transaction>) => Promise<void>;
}

export function TransactionDetailSheet({
  transaction,
  source,
  open,
  onClose,
  onUpdate,
}: TransactionDetailSheetProps) {
  if (!transaction) return null;

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent className="w-[500px] sm:w-[540px] p-0">
        <ScrollArea className="h-full">
          <div className="p-6">
            <SheetHeader>
              <SheetTitle>Transaction Details</SheetTitle>
            </SheetHeader>

            <div className="mt-6 space-y-6">
              {/* Transaction Information */}
              <TransactionDetails transaction={transaction} source={source} onUpdate={onUpdate} />

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
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
