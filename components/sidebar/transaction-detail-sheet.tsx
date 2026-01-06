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
import { TransactionFilesSection } from "@/components/transactions/transaction-files-section";
import { TransactionHistory } from "./transaction-history";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TransactionDetailSheetProps {
  transaction: Transaction | null;
  source?: TransactionSource;
  open: boolean;
  onClose: () => void;
}

export function TransactionDetailSheet({
  transaction,
  source,
  open,
  onClose,
}: TransactionDetailSheetProps) {
  // Always render the Sheet - just control open state
  // This avoids expensive mount/unmount cycles with 500+ transactions
  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent className="w-[500px] sm:w-[540px] p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>Transaction Details</SheetTitle>
        </SheetHeader>
        {transaction && (
          <ScrollArea className="h-full">
            <div className="p-6">
              <h2 className="text-lg font-semibold">Transaction Details</h2>

              <div className="mt-6 space-y-6">
                {/* Transaction Information */}
                <TransactionDetails
                  transaction={transaction}
                  source={source}
                  userPartners={[]}
                  globalPartners={[]}
                  onAssignPartner={async () => {}}
                  onRemovePartner={async () => {}}
                  onCreatePartner={async () => ""}
                />

                <Separator />

                {/* Files Section */}
                <TransactionFilesSection transaction={transaction} />

                <Separator />

                {/* Edit History Section */}
                <div>
                  <TransactionHistory
                    transactionId={transaction.id}
                    onRollback={() => {
                      // Trigger a refresh of the transaction data
                      // The parent component will handle this via its own update mechanism
                    }}
                  />
                </div>
              </div>
            </div>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
}
