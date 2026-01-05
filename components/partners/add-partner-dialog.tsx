"use client";

import { useState, useEffect, useMemo } from "react";
import { Loader2, Sparkles, Check, AlertCircle, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PartnerSearchList } from "./partner-search-list";
import {
  PartnerFormData,
  PartnerAddress,
  PartnerSuggestion,
  UserPartner,
  GlobalPartner,
} from "@/types/partner";
import { cn } from "@/lib/utils";
import { COUNTRIES, formatCountry } from "@/lib/data/countries";

// Country select with search
function CountrySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredCountries = useMemo(() => {
    if (!search) return COUNTRIES;
    const lower = search.toLowerCase();
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(lower) ||
        c.code.toLowerCase().includes(lower)
    );
  }, [search]);

  return (
    <Popover open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) setSearch("");
    }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {value ? formatCountry(value) : "Select country..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <div className="p-2 border-b">
          <Input
            placeholder="Search country..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8"
            autoFocus
          />
        </div>
        <ScrollArea className="h-[200px]">
          {filteredCountries.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              No country found.
            </div>
          ) : (
            <div className="p-1">
              {filteredCountries.map((country) => (
                <button
                  key={country.code}
                  type="button"
                  className={cn(
                    "w-full flex items-center px-2 py-1.5 text-sm rounded-sm hover:bg-accent cursor-pointer text-left",
                    value === country.code && "bg-accent"
                  )}
                  onClick={() => {
                    onChange(country.code);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === country.code ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {country.name} ({country.code})
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

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
  const [lookupStatus, setLookupStatus] = useState<string | null>(null);
  const [lookupResult, setLookupResult] = useState<{
    found: string[];
    notFound: string[];
  } | null>(null);
  const [lookupUrl, setLookupUrl] = useState("");
  const [formData, setFormData] = useState({
    name: initialData?.name || "",
    aliases: initialData?.aliases?.join(", ") || "",
    vatId: initialData?.vatId || "",
    ibans: initialData?.ibans?.join("\n") || "",
    address: initialData?.address
      ? `${initialData.address.street || ""}\n${initialData.address.postalCode || ""} ${initialData.address.city || ""}`.trim()
      : "",
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
        address: initialData?.address
          ? `${initialData.address.street || ""}\n${initialData.address.postalCode || ""} ${initialData.address.city || ""}`.trim()
          : "",
        country: initialData?.address?.country || "",
        notes: initialData?.notes || "",
      });
      setLookupUrl(initialData?.website || "");
      setLookupStatus(null);
      setLookupResult(null);
    }
  }, [open, initialData]);

  const handleLookup = async () => {
    if (!lookupUrl.trim()) return;

    setIsLookingUp(true);
    setLookupResult(null);
    setLookupStatus("Searching for company info...");

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

      // Build address string from response
      const addressParts: string[] = [];
      if (data.address?.street) addressParts.push(data.address.street);
      if (data.address?.postalCode || data.address?.city) {
        addressParts.push(`${data.address.postalCode || ""} ${data.address.city || ""}`.trim());
      }
      const addressString = addressParts.join("\n");

      // Prefill form with lookup results
      setFormData((prev) => ({
        ...prev,
        name: data.name || prev.name,
        aliases: data.aliases?.length
          ? data.aliases.join(", ")
          : prev.aliases,
        vatId: data.vatId || prev.vatId,
        address: addressString || prev.address,
        country: data.country || data.address?.country || prev.country,
      }));

      // Build result summary
      const found: string[] = [];
      const notFound: string[] = [];

      if (data.name) found.push("Name");
      else notFound.push("Name");

      if (data.aliases?.length) found.push("Aliases");

      if (data.vatId) found.push("VAT ID");
      else notFound.push("VAT ID");

      if (data.country || data.address?.country) found.push("Country");

      if (data.address?.street) found.push("Address");

      setLookupResult({ found, notFound });
      setLookupStatus(null);
    } catch (error) {
      console.error("Company lookup failed:", error);
      setLookupStatus(null);
      setLookupResult({ found: [], notFound: ["Lookup failed"] });
    } finally {
      setIsLookingUp(false);
    }
  };

  // Lookup by company name (AI search)
  const handleNameLookup = async () => {
    if (!formData.name.trim()) return;

    setIsLookingUp(true);
    setLookupResult(null);
    setLookupStatus("Searching for company info...");

    try {
      const response = await fetch("/api/lookup-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formData.name }),
      });

      if (!response.ok) {
        throw new Error("Lookup failed");
      }

      const data = await response.json();

      // Build address string from response
      const addressParts: string[] = [];
      if (data.address?.street) addressParts.push(data.address.street);
      if (data.address?.postalCode || data.address?.city) {
        addressParts.push(`${data.address.postalCode || ""} ${data.address.city || ""}`.trim());
      }
      const addressString = addressParts.join("\n");

      // Prefill form with lookup results (don't overwrite name since user typed it)
      setFormData((prev) => ({
        ...prev,
        aliases: data.aliases?.length
          ? data.aliases.join(", ")
          : prev.aliases,
        vatId: data.vatId || prev.vatId,
        address: addressString || prev.address,
        country: data.country || data.address?.country || prev.country,
      }));

      // Also set website if found
      if (data.website && !lookupUrl) {
        setLookupUrl(data.website);
      }

      // Build result summary
      const found: string[] = [];
      const notFound: string[] = [];

      if (data.website) found.push("Website");
      if (data.aliases?.length) found.push("Aliases");
      if (data.vatId) found.push("VAT ID");
      else notFound.push("VAT ID");
      if (data.country || data.address?.country) found.push("Country");
      if (data.address?.street) found.push("Address");

      setLookupResult({ found, notFound });
      setLookupStatus(null);
    } catch (error) {
      console.error("Company name lookup failed:", error);
      setLookupStatus(null);
      setLookupResult({ found: [], notFound: ["Lookup failed"] });
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    // Normalize website URL - extract domain
    const websiteDomain = lookupUrl.trim()
      ? lookupUrl.trim().replace(/^https?:\/\//, "").split("/")[0]
      : undefined;

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
        website: websiteDomain,
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

  const hasExistingPartners = (userPartners?.length || 0) + (globalPartners?.length || 0) > 0 && mode !== "edit";

  // Two column mode when we have partners to show
  const isTwoColumnMode = hasExistingPartners;

  return (
    <Dialog open={open} onOpenChange={(isOpen: boolean) => !isOpen && onClose()}>
      <DialogContent className={cn(
        "p-0 gap-0 flex flex-col",
        isTwoColumnMode ? "max-w-[850px] h-[700px]" : "max-w-[550px] h-[85vh]"
      )}>
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>
            {mode === "edit" ? "Edit Partner" : hasExistingPartners ? "Select or Create Partner" : "Create New Partner"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Column 1: Existing Partners with Suggestions */}
          {hasExistingPartners && (
            <div className="w-[320px] border-r p-4 flex flex-col">
              <h3 className="text-sm font-medium mb-3">Select Partner</h3>
              <div className="flex-1 overflow-hidden">
                <PartnerSearchList
                  userPartners={userPartners || []}
                  globalPartners={globalPartners || []}
                  onSelect={handleSelectExisting}
                  suggestions={suggestions}
                  onSelectSuggestion={handleSelectSuggestion}
                />
              </div>
            </div>
          )}

          {/* Column 2: Create New Partner */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <form onSubmit={handleSubmit} className="flex flex-col h-full">
              {/* Scrollable form content */}
              <div className="flex-1 overflow-auto p-4 space-y-4">
                {hasExistingPartners && (
                  <h3 className="text-sm font-medium mb-3">Create New Partner</h3>
                )}

                {/* Website URL - also triggers AI lookup */}
                <div>
                  <label className="text-sm font-medium mb-1.5 block">
                    Website
                  </label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="example.com"
                      value={lookupUrl}
                      onChange={(e) => {
                        setLookupUrl(e.target.value);
                        // Clear result when URL changes
                        if (lookupResult) setLookupResult(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleLookup();
                        }
                      }}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleLookup}
                      disabled={isLookingUp || !lookupUrl.trim()}
                      className="px-3"
                      title={isLookingUp ? lookupStatus || "Looking up..." : "Look up company info"}
                    >
                      {isLookingUp ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  {/* Status while loading */}
                  {isLookingUp && lookupStatus && (
                    <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {lookupStatus}
                    </p>
                  )}

                  {/* Result summary after lookup */}
                  {!isLookingUp && lookupResult && (
                    <div className="mt-1.5 text-xs">
                      {lookupResult.found.length > 0 && (
                        <p className="text-green-600 dark:text-green-500 flex items-center gap-1">
                          <Check className="h-3 w-3" />
                          Found: {lookupResult.found.join(", ")}
                        </p>
                      )}
                      {lookupResult.notFound.length > 0 && lookupResult.found.length > 0 && (
                        <p className="text-muted-foreground flex items-center gap-1 mt-0.5">
                          <AlertCircle className="h-3 w-3" />
                          Not found: {lookupResult.notFound.join(", ")}
                        </p>
                      )}
                      {lookupResult.found.length === 0 && (
                        <p className="text-amber-600 dark:text-amber-500 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          No company info found
                        </p>
                      )}
                    </div>
                  )}

                  {/* Helper text when no lookup has been done */}
                  {!isLookingUp && !lookupResult && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Press Enter or click sparkle to auto-fill company info
                    </p>
                  )}
                </div>

                <Separator />

                {/* Name */}
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Name *</label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Company name"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData((f) => ({ ...f, name: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && formData.name.trim()) {
                          e.preventDefault();
                          handleNameLookup();
                        }
                      }}
                      required
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleNameLookup}
                      disabled={isLookingUp || !formData.name.trim()}
                      className="px-3"
                      title="Search for company info by name"
                    >
                      {isLookingUp ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Patterns */}
                <div>
                  <label className="text-sm font-medium mb-1.5 block">
                    Patterns
                  </label>
                  <Input
                    placeholder="Google, *google pay* (names or *glob* patterns)"
                    value={formData.aliases}
                    onChange={(e) =>
                      setFormData((f) => ({ ...f, aliases: e.target.value }))
                    }
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Use * as wildcard, e.g. *amazon* matches any text containing amazon
                  </p>
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

                {/* Address */}
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Address</label>
                  <textarea
                    placeholder={"Street Name 123\n1010 Vienna"}
                    value={formData.address}
                    onChange={(e) =>
                      setFormData((f) => ({ ...f, address: e.target.value }))
                    }
                    rows={2}
                    className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>

                {/* Country */}
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Country</label>
                  <CountrySelect
                    value={formData.country}
                    onChange={(code) =>
                      setFormData((f) => ({ ...f, country: code }))
                    }
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
              </div>

              {/* Sticky footer with submit buttons */}
              <div className="border-t p-4 bg-background flex gap-2">
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
