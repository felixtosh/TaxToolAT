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
import { PartnerFormData, PartnerAddress } from "@/types/partner";

interface AddPartnerDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (data: PartnerFormData) => Promise<string | void>;
  initialData?: Partial<{
    name: string;
    aliases: string[];
    vatId: string;
    ibans: string[];
    website: string;
    address?: PartnerAddress;
    notes: string;
  }>;
  mode?: "add" | "edit";
}

export function AddPartnerDialog({
  open,
  onClose,
  onAdd,
  initialData,
  mode = "add",
}: AddPartnerDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: initialData?.name || "",
    aliases: initialData?.aliases?.join(", ") || "",
    vatId: initialData?.vatId || "",
    ibans: initialData?.ibans?.join("\n") || "",
    website: initialData?.website || "",
    country: initialData?.address?.country || "",
    notes: initialData?.notes || "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setIsSubmitting(true);
    try {
      await onAdd({
        name: formData.name.trim(),
        aliases: formData.aliases
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
        vatId: formData.vatId.trim() || undefined,
        ibans: formData.ibans
          .split("\n")
          .map((i) => i.trim())
          .filter(Boolean),
        website: formData.website.trim() || undefined,
        country: formData.country.trim() || undefined,
        notes: formData.notes.trim() || undefined,
      });

      // Reset and close
      setFormData({
        name: "",
        aliases: "",
        vatId: "",
        ibans: "",
        website: "",
        country: "",
        notes: "",
      });
      onClose();
    } catch (error) {
      console.error("Failed to add partner:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      onClose();
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-[450px] sm:w-[500px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{mode === "edit" ? "Edit Partner" : "Add Partner"}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Name *</label>
            <Input
              placeholder="Company name"
              value={formData.name}
              onChange={(e) =>
                setFormData((f) => ({ ...f, name: e.target.value }))
              }
              required
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Aliases (comma-separated)
            </label>
            <Input
              placeholder="Short name, trade name, etc."
              value={formData.aliases}
              onChange={(e) =>
                setFormData((f) => ({ ...f, aliases: e.target.value }))
              }
            />
            <p className="text-xs text-muted-foreground mt-1">
              Alternative names for better matching
            </p>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">VAT ID</label>
            <Input
              placeholder="ATU12345678"
              value={formData.vatId}
              onChange={(e) =>
                setFormData((f) => ({ ...f, vatId: e.target.value }))
              }
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">
              IBANs (one per line)
            </label>
            <textarea
              placeholder="AT12 3456 7890 1234 5678"
              value={formData.ibans}
              onChange={(e) =>
                setFormData((f) => ({ ...f, ibans: e.target.value }))
              }
              rows={2}
              className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
            <p className="text-xs text-muted-foreground mt-1">
              IBANs are the most reliable way to match transactions
            </p>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Website</label>
            <Input
              placeholder="example.com"
              value={formData.website}
              onChange={(e) =>
                setFormData((f) => ({ ...f, website: e.target.value }))
              }
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Country</label>
            <Input
              placeholder="AT"
              value={formData.country}
              onChange={(e) =>
                setFormData((f) => ({ ...f, country: e.target.value }))
              }
              maxLength={2}
            />
            <p className="text-xs text-muted-foreground mt-1">
              ISO country code (e.g., AT, DE, CH)
            </p>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Notes</label>
            <textarea
              placeholder="Internal notes about this partner"
              value={formData.notes}
              onChange={(e) =>
                setFormData((f) => ({ ...f, notes: e.target.value }))
              }
              rows={2}
              className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
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
              disabled={isSubmitting || !formData.name.trim()}
              className="flex-1"
            >
              {isSubmitting
                ? (mode === "edit" ? "Saving..." : "Adding...")
                : (mode === "edit" ? "Save Changes" : "Add Partner")}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
