"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SourceFormData } from "@/types/source";
import { isValidIban, normalizeIban, formatIban } from "@/lib/import/deduplication";

interface AddSourceDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (data: SourceFormData) => Promise<string>;
}

export function AddSourceDialog({ open, onClose, onAdd }: AddSourceDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ibanError, setIbanError] = useState<string | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    iban: string;
    bic: string;
    bankName: string;
    currency: string;
    type: "csv" | "api";
  }>({
    name: "",
    iban: "",
    bic: "",
    bankName: "",
    currency: "EUR",
    type: "csv",
  });

  const handleIbanChange = (value: string) => {
    setFormData((f) => ({ ...f, iban: value }));
    setIbanError(null);
  };

  const handleIbanBlur = () => {
    if (formData.iban) {
      const normalized = normalizeIban(formData.iban);
      if (!isValidIban(normalized)) {
        setIbanError("Invalid IBAN format");
      } else {
        setFormData((f) => ({ ...f, iban: formatIban(normalized) }));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.iban) return;

    if (!isValidIban(formData.iban)) {
      setIbanError("Invalid IBAN format");
      return;
    }

    setIsSubmitting(true);
    try {
      await onAdd({
        name: formData.name,
        iban: formData.iban,
        bic: formData.bic || undefined,
        bankName: formData.bankName || undefined,
        currency: formData.currency,
        type: formData.type,
      });

      // Reset form
      setFormData({
        name: "",
        iban: "",
        bic: "",
        bankName: "",
        currency: "EUR",
        type: "csv" as const,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent className="w-[450px] sm:w-[500px]">
        <SheetHeader>
          <SheetTitle>Add Bank Account</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Account Name *
            </label>
            <Input
              placeholder="e.g., Business Account"
              value={formData.name}
              onChange={(e) =>
                setFormData((f) => ({ ...f, name: e.target.value }))
              }
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              A friendly name to identify this account
            </p>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">IBAN *</label>
            <Input
              placeholder="AT12 3456 7890 1234 5678"
              value={formData.iban}
              onChange={(e) => handleIbanChange(e.target.value)}
              onBlur={handleIbanBlur}
              className={ibanError ? "border-destructive" : ""}
              required
            />
            {ibanError && (
              <p className="text-xs text-destructive mt-1">{ibanError}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Used for deduplication when importing transactions
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Bank Name
              </label>
              <Input
                placeholder="e.g., Erste Bank"
                value={formData.bankName}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, bankName: e.target.value }))
                }
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">BIC</label>
              <Input
                placeholder="e.g., GIBAATWW"
                value={formData.bic}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, bic: e.target.value }))
                }
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Currency
            </label>
            <Select
              value={formData.currency}
              onValueChange={(value) =>
                setFormData((f) => ({ ...f, currency: value }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EUR">EUR - Euro</SelectItem>
                <SelectItem value="USD">USD - US Dollar</SelectItem>
                <SelectItem value="GBP">GBP - British Pound</SelectItem>
                <SelectItem value="CHF">CHF - Swiss Franc</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !formData.name || !formData.iban}
              className="flex-1"
            >
              {isSubmitting ? "Adding..." : "Add Account"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
