"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { GlobalPartner, GlobalPartnerFormData } from "@/types/partner";

interface AddGlobalPartnerDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: GlobalPartnerFormData) => Promise<string | void>;
  editingPartner?: GlobalPartner | null;
}

export function AddGlobalPartnerDialog({
  open,
  onClose,
  onSave,
  editingPartner,
}: AddGlobalPartnerDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    aliases: "",
    vatId: "",
    ibans: "",
    website: "",
    country: "",
    justizOnlineId: "",
    euCompanyId: "",
  });

  // Reset form when dialog opens/closes or editing partner changes
  useEffect(() => {
    if (open && editingPartner) {
      setFormData({
        name: editingPartner.name,
        aliases: editingPartner.aliases.join(", "),
        vatId: editingPartner.vatId || "",
        ibans: editingPartner.ibans.join("\n"),
        website: editingPartner.website || "",
        country: editingPartner.country || "",
        justizOnlineId: editingPartner.externalIds?.justizOnline || "",
        euCompanyId: editingPartner.externalIds?.euCompany || "",
      });
    } else if (open) {
      setFormData({
        name: "",
        aliases: "",
        vatId: "",
        ibans: "",
        website: "",
        country: "",
        justizOnlineId: "",
        euCompanyId: "",
      });
    }
  }, [open, editingPartner]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setIsSubmitting(true);
    try {
      const data: GlobalPartnerFormData = {
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
        externalIds:
          formData.justizOnlineId || formData.euCompanyId
            ? {
                justizOnline: formData.justizOnlineId || undefined,
                euCompany: formData.euCompanyId || undefined,
              }
            : undefined,
        source: editingPartner ? editingPartner.source : "manual",
      };

      await onSave(data);
      onClose();
    } catch (error) {
      console.error("Failed to save partner:", error);
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
      <SheetContent className="w-[500px] sm:w-[600px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {editingPartner ? "Edit Global Partner" : "Add Global Partner"}
          </SheetTitle>
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
          </div>

          <div className="grid grid-cols-2 gap-4">
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
              <label className="text-sm font-medium mb-1.5 block">Country</label>
              <Input
                placeholder="AT"
                value={formData.country}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, country: e.target.value }))
                }
                maxLength={2}
              />
            </div>
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
              rows={3}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
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

          <div className="pt-4 border-t">
            <h4 className="text-sm font-medium mb-3">External Registry IDs</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">
                  JustizOnline (AT)
                </label>
                <Input
                  placeholder="FN123456x"
                  value={formData.justizOnlineId}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, justizOnlineId: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">
                  EU Company ID
                </label>
                <Input
                  placeholder="EU registry ID"
                  value={formData.euCompanyId}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, euCompanyId: e.target.value }))
                  }
                />
              </div>
            </div>
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
                ? "Saving..."
                : editingPartner
                ? "Save Changes"
                : "Add Partner"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
