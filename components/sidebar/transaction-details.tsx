"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import Link from "next/link";
import { Transaction } from "@/types/transaction";
import { TransactionSource } from "@/types/source";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Check, X, Calendar, Building2, DollarSign, Landmark, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface TransactionDetailsProps {
  transaction: Transaction;
  source?: TransactionSource;
  onUpdate: (updates: Partial<Transaction>) => Promise<void>;
}

export function TransactionDetails({
  transaction,
  source,
  onUpdate,
}: TransactionDetailsProps) {
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [description, setDescription] = useState(transaction.description || "");
  const [isSaving, setIsSaving] = useState(false);

  // Update local state when transaction changes
  useEffect(() => {
    setDescription(transaction.description || "");
  }, [transaction.description]);

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

  const formattedAmount = new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: transaction.currency || "EUR",
  }).format(transaction.amount / 100);

  return (
    <div className="space-y-4">
      {/* Amount - prominent display */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          Amount
        </span>
        <span
          className={cn(
            "text-2xl font-bold tabular-nums",
            transaction.amount < 0 ? "text-red-600" : "text-green-600"
          )}
        >
          {formattedAmount}
        </span>
      </div>

      {/* Date */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Date
        </span>
        <span className="font-medium">
          {format(transaction.date.toDate(), "MMMM d, yyyy")}
        </span>
      </div>

      {/* Partner/Vendor */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Partner/Vendor
        </span>
        <span className="font-medium">{transaction.partner || "-"}</span>
      </div>

      {/* Transaction Name */}
      <div>
        <span className="text-sm text-muted-foreground">Transaction Name</span>
        <p className="font-medium mt-1">{transaction.name}</p>
      </div>

      {/* Source/Account */}
      {source && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground flex items-center gap-2">
            <Landmark className="h-4 w-4" />
            Account
          </span>
          <Link
            href={`/sources/${source.id}`}
            className="font-medium text-primary hover:underline flex items-center gap-1"
          >
            {source.name}
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      )}

      {/* Editable Description */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">Cost Description</span>
          {!isEditingDescription && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditingDescription(true)}
              className="h-7 px-2"
            >
              <Pencil className="h-3 w-3 mr-1" />
              Edit
            </Button>
          )}
        </div>

        {isEditingDescription ? (
          <div className="space-y-2">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter cost description for tax purposes..."
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleSaveDescription}
                disabled={isSaving}
              >
                <Check className="h-3 w-3 mr-1" />
                Save
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDescription(transaction.description || "");
                  setIsEditingDescription(false);
                }}
                disabled={isSaving}
              >
                <X className="h-3 w-3 mr-1" />
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p
            className={cn(
              "text-sm",
              transaction.description
                ? "text-foreground"
                : "text-muted-foreground italic"
            )}
          >
            {transaction.description || "No description added"}
          </p>
        )}
      </div>

      {/* Status badges */}
      <div className="flex gap-2 pt-2">
        <Badge
          variant={transaction.receiptIds.length > 0 ? "default" : "outline"}
        >
          {transaction.receiptIds.length > 0 ? "Receipt attached" : "No receipt"}
        </Badge>
        {transaction.isComplete && (
          <Badge variant="default" className="bg-green-600 hover:bg-green-700">
            Complete
          </Badge>
        )}
      </div>
    </div>
  );
}
