"use client";

import { useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Transaction } from "@/types/transaction";
import { cn } from "@/lib/utils";

interface ReceiptLostDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string, description: string) => Promise<void>;
  transaction: Transaction;
}

const REASON_OPTIONS = [
  "Receipt not issued",
  "Receipt lost",
  "Receipt damaged/unreadable",
  "Receipt never received",
  "Digital receipt expired",
  "Other",
];

function formatAmount(amount: number, currency: string = "EUR") {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: currency || "EUR",
  }).format(amount / 100);
}

export function ReceiptLostDialog({
  open,
  onClose,
  onConfirm,
  transaction,
}: ReceiptLostDialogProps) {
  const [reason, setReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [description, setDescription] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const effectiveReason = reason === "Other" ? customReason : reason;
  const isValid =
    effectiveReason.trim().length > 0 &&
    description.trim().length > 0 &&
    confirmed;

  const handleSubmit = async () => {
    if (!isValid) return;

    setSubmitting(true);
    try {
      await onConfirm(effectiveReason.trim(), description.trim());
      // Reset form
      setReason("");
      setCustomReason("");
      setDescription("");
      setConfirmed(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitting) return;
    setReason("");
    setCustomReason("");
    setDescription("");
    setConfirmed(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Receipt Lost
          </DialogTitle>
          <DialogDescription>
            Create a self-generated receipt (Eigenbeleg) for this transaction.
            This should only be used as an exception.
          </DialogDescription>
        </DialogHeader>

        {/* Transaction Info */}
        <div className="bg-muted/50 rounded-md p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Date</span>
            <span>
              {transaction.date?.toDate
                ? format(transaction.date.toDate(), "MMM d, yyyy")
                : ""}
            </span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-muted-foreground">Amount</span>
            <span
              className={cn(
                "font-medium",
                transaction.amount < 0 ? "text-red-600" : "text-green-600"
              )}
            >
              {formatAmount(transaction.amount, transaction.currency)}
            </span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-muted-foreground">Description</span>
            <span className="text-right truncate max-w-[200px]">
              {transaction.name}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">
              Reason <span className="text-destructive">*</span>
            </Label>
            <select
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <option value="">Select a reason...</option>
              {REASON_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            {reason === "Other" && (
              <Input
                placeholder="Specify reason..."
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                className="mt-2"
              />
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">
              Description <span className="text-destructive">*</span>
            </Label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this transaction was for..."
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Be specific about the business purpose. This serves as
              documentation for tax purposes.
            </p>
          </div>

          {/* Confirmation */}
          <div className="flex items-start gap-2">
            <Checkbox
              id="confirm"
              checked={confirmed}
              onCheckedChange={(checked) => setConfirmed(checked === true)}
            />
            <Label
              htmlFor="confirm"
              className="text-sm font-normal leading-tight cursor-pointer"
            >
              I confirm this transaction was a legitimate business expense and I
              was unable to obtain a receipt.
            </Label>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Eigenbeleg
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
