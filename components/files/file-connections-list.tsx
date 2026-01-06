"use client";

import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { Plus, X, Loader2 } from "lucide-react";
import { TaxFile } from "@/types/file";
import { Transaction } from "@/types/transaction";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import Link from "next/link";

function formatAmount(amount: number, currency: string = "EUR") {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: currency || "EUR",
  }).format(amount / 100);
}

interface TransactionRowProps {
  transaction: Transaction;
  onRemove?: () => void;
  disabled?: boolean;
}

function TransactionRow({ transaction, onRemove, disabled }: TransactionRowProps) {
  return (
    <div className="flex items-center justify-between gap-2 p-2 -mx-2 rounded hover:bg-muted/50 transition-colors group">
      <Link
        href={`/transactions?id=${transaction.id}`}
        className="min-w-0 flex-1 hover:underline"
      >
        <p className="text-sm truncate">{transaction.name}</p>
        <p className="text-xs text-muted-foreground">
          {transaction.date?.toDate ? format(transaction.date.toDate(), "MMM d, yyyy") : ""}
        </p>
      </Link>
      <div className="flex items-center gap-2 shrink-0">
        <span className={cn(
          "text-sm font-medium tabular-nums",
          transaction.amount < 0 ? "text-red-600" : "text-green-600"
        )}>
          {formatAmount(transaction.amount, transaction.currency)}
        </span>
        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRemove();
            }}
            disabled={disabled}
            className="p-1 rounded hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
          </button>
        )}
      </div>
    </div>
  );
}

interface FileConnectionsListProps {
  file: TaxFile;
  onDisconnect?: (transactionId: string) => Promise<void>;
  onConnectClick?: () => void;
}

export function FileConnectionsList({
  file,
  onDisconnect,
  onConnectClick,
}: FileConnectionsListProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  // Fetch connected transactions
  useEffect(() => {
    if (file.transactionIds.length === 0) {
      setTransactions([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const q = query(
      collection(db, "transactions"),
      where("fileIds", "array-contains", file.id)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Transaction[];
        setTransactions(data);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching connected transactions:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [file.id, file.transactionIds]);

  const handleDisconnect = async (transactionId: string) => {
    if (!onDisconnect) return;
    setDisconnecting(transactionId);
    try {
      await onDisconnect(transactionId);
    } finally {
      setDisconnecting(null);
    }
  };

  // Calculate totals
  const { totalAmount, openAmount } = useMemo(() => {
    const total = transactions.reduce((sum, tx) => sum + tx.amount, 0);
    const fileAmount = file.extractedAmount || 0;
    // Open = file amount - total connected (use absolute values for comparison)
    const open = fileAmount ? fileAmount - Math.abs(total) : 0;
    return { totalAmount: total, openAmount: open };
  }, [transactions, file.extractedAmount]);

  const currency = file.extractedCurrency || transactions[0]?.currency || "EUR";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Transactions</h3>
        {!loading && transactions.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={onConnectClick}
            className="h-7 px-3"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      ) : transactions.length > 0 ? (
        <>
          <div className="space-y-0.5">
            {transactions.map((tx) => (
              <TransactionRow
                key={tx.id}
                transaction={tx}
                onRemove={onDisconnect ? () => handleDisconnect(tx.id) : undefined}
                disabled={disconnecting === tx.id}
              />
            ))}
          </div>
          {/* Footer with Open and Total */}
          <div className="flex items-center justify-between pt-2 border-t text-sm">
            {file.extractedAmount != null ? (
              <span className={cn(
                "text-muted-foreground",
                openAmount === 0 && "text-green-600"
              )}>
                Open: <span className="tabular-nums">{formatAmount(openAmount, currency)}</span>
              </span>
            ) : (
              <span />
            )}
            <span className={cn(
              "tabular-nums",
              totalAmount < 0 ? "text-red-600" : "text-green-600"
            )}>
              Total: {formatAmount(totalAmount, currency)}
            </span>
          </div>
        </>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={onConnectClick}
          className="h-8 w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Connect Transaction
        </Button>
      )}
    </div>
  );
}
