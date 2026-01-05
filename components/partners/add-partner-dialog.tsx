"use client";

import { useState, useEffect } from "react";
import { Loader2, Sparkles, Globe, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PartnerSearchList } from "./partner-search-list";
import {
  PartnerFormData,
  PartnerAddress,
  PartnerSuggestion,
  UserPartner,
  GlobalPartner,
} from "@/types/partner";
import { cn } from "@/lib/utils";

interface PartnerSuggestionWithDetails extends PartnerSuggestion {
  partner: UserPartner | GlobalPartner;
}

interface AddPartnerDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (data: PartnerFormData) => Promise<string | void>;
  onSelectPartner?: (partnerId: string, partnerType: "user" | "global") => void;
  onSelectSuggestion?: (suggestion: PartnerSuggestion) => void;
  suggestions?: PartnerSuggestionWithDetails[];
  userPartners?: UserPartner[];
  globalPartners?: GlobalPartner[];
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
  onSelectPartner,
  onSelectSuggestion,
  suggestions = [],
  userPartners,
  globalPartners,
  initialData,
  mode = "add",
}: AddPartnerDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupUrl, setLookupUrl] = useState("");
  const [formData, setFormData] = useState({
    name: initialData?.name || "",
    aliases: initialData?.aliases?.join(", ") || "",
    vatId: initialData?.vatId || "",
    ibans: initialData?.ibans?.join("\n") || "",
    website: initialData?.website || "",
    country: initialData?.address?.country || "",
    notes: initialData?.notes || "",
  });

  // Reset form when dialog opens with new initial data
  useEffect(() => {
    if (open) {
      setFormData({
        name: initialData?.name || "",
        aliases: initialData?.aliases?.join(", ") || "",
        vatId: initialData?.vatId || "",
        ibans: initialData?.ibans?.join("\n") || "",
        website: initialData?.website || "",
        country: initialData?.address?.country || "",
        notes: initialData?.notes || "",
      });
      setLookupUrl("");
    }
  }, [open, initialData]);

  const handleLookup = async () => {
    if (!lookupUrl.trim()) return;

    setIsLookingUp(true);
    try {
      const response = await fetch("/api/lookup-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: lookupUrl }),
      });

      if (!response.ok) {
        throw new Error("Lookup failed");
      }

      const data = await response.json();

      // Prefill form with lookup results
      setFormData((prev) => ({
        ...prev,
        name: data.name || prev.name,
        vatId: data.vatId || prev.vatId,
        website: data.website || lookupUrl.replace(/^https?:\/\//, "").split("/")[0],
        country: data.country || data.address?.country || prev.country,
      }));
    } catch (error) {
      console.error("Company lookup failed:", error);
    } finally {
      setIsLookingUp(false);
    }
  };

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

      onClose();
    } catch (error) {
      console.error("Failed to add partner:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectSuggestion = (suggestion: PartnerSuggestionWithDetails) => {
    if (onSelectSuggestion) {
      onSelectSuggestion(suggestion);
      onClose();
    }
  };

  const handleSelectExisting = (partnerId: string, partnerType: "user" | "global") => {
    onSelectPartner?.(partnerId, partnerType);
    onClose();
  };

  const hasSuggestions = suggestions.length > 0 && mode !== "edit";
  const hasExistingPartners = (userPartners?.length || 0) + (globalPartners?.length || 0) > 0 && mode !== "edit";

  // Single column mode when in edit mode or no partners/suggestions to show
  const isSingleColumnMode = mode === "edit" || (!hasSuggestions && !hasExistingPartners);

  return (
    <Dialog open={open} onOpenChange={(isOpen: boolean) => !isOpen && onClose()}>
      <DialogContent className={cn(
        "p-0 gap-0",
        isSingleColumnMode ? "max-w-[480px] max-h-[85vh]" : "max-w-[900px] h-[600px]"
      )}>
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>
            {mode === "edit" ? "Edit Partner" : (hasSuggestions || hasExistingPartners) ? "Select or Create Partner" : "Create New Partner"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Column 1: Suggestions */}
          {hasSuggestions && (
            <div className="w-[200px] border-r p-4 flex flex-col">
              <h3 className="text-sm font-medium mb-3">Suggestions</h3>
              <div className="space-y-2 flex-1 overflow-auto">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.partnerId}
                    type="button"
                    onClick={() => handleSelectSuggestion(suggestion)}
                    className="w-full text-left p-2 rounded-md border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      {suggestion.partnerType === "global" ? (
                        <Globe className="h-3 w-3 text-blue-500" />
                      ) : (
                        <Building2 className="h-3 w-3 text-muted-foreground" />
                      )}
                      <span className="text-sm font-medium truncate">
                        {suggestion.partner.name}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {suggestion.source}
                      </span>
                      <span
                        className={cn(
                          "text-xs px-1.5 py-0.5 rounded",
                          suggestion.confidence >= 90
                            ? "bg-green-100 text-green-700"
                            : suggestion.confidence >= 75
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-gray-100 text-gray-700"
                        )}
                      >
                        {suggestion.confidence}%
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Based on counterparty & IBAN
              </p>
            </div>
          )}

          {/* Column 2: Existing Partners */}
          {hasExistingPartners && (
            <div
              className={cn(
                "border-r p-4 flex flex-col",
                hasSuggestions ? "w-[280px]" : "w-[300px]"
              )}
            >
              <h3 className="text-sm font-medium mb-3">Existing Partners</h3>
              <div className="flex-1 overflow-hidden">
                <PartnerSearchList
                  userPartners={userPartners || []}
                  globalPartners={globalPartners || []}
                  onSelect={handleSelectExisting}
                />
              </div>
            </div>
          )}

          {/* Column 3: Create New Partner */}
          <div className="flex-1 p-4 overflow-auto">
            {(hasSuggestions || hasExistingPartners) && (
              <h3 className="text-sm font-medium mb-3">Create New Partner</h3>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Website URL Lookup */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Website URL
                </label>
                <div className="flex gap-2">
                  <Input
                    placeholder="example.com"
                    value={lookupUrl}
                    onChange={(e) => setLookupUrl(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleLookup}
                    disabled={isLookingUp || !lookupUrl.trim()}
                    className="px-3"
                  >
                    {isLookingUp ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Enter URL and click to auto-fill company info
                </p>
              </div>

              <Separator />

              {/* Name */}
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

              {/* Aliases */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Aliases
                </label>
                <Input
                  placeholder="Short name, trade name (comma-separated)"
                  value={formData.aliases}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, aliases: e.target.value }))
                  }
                />
              </div>

              {/* VAT ID */}
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

              {/* IBANs */}
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
                  className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              {/* Website */}
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

              {/* Country */}
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

              {/* Notes */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Notes</label>
                <textarea
                  placeholder="Internal notes"
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, notes: e.target.value }))
                  }
                  rows={2}
                  className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              {/* Submit */}
              <div className="flex gap-2 pt-2">
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
                    ? (mode === "edit" ? "Saving..." : "Creating...")
                    : (mode === "edit" ? "Save Partner" : "Create Partner")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
