"use client";

import { Building2, Globe, Hash, CheckCircle2, XCircle, AlertCircle, Search, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { PartnerResult, CompanyLookupResult, VatValidationResult } from "./types";

// ============================================================================
// Partner List Result
// ============================================================================

interface PartnerListResultProps {
  partners: PartnerResult[];
  maxItems?: number;
  searchQuery?: string;
  totalCount?: number;
}

/**
 * GenUI preview for listPartners tool results.
 * Shows a compact list of partners.
 */
export function PartnerListResult({
  partners,
  maxItems = 5,
  searchQuery,
  totalCount,
}: PartnerListResultProps) {
  const displayPartners = partners.slice(0, maxItems);
  const total = totalCount ?? partners.length;
  const hasMore = total > maxItems;
  const moreCount = total - maxItems;

  if (partners.length === 0) {
    return (
      <div className="rounded-md border p-3 text-sm text-muted-foreground flex items-center gap-2">
        <Building2 className="h-4 w-4" />
        <span>No partners found{searchQuery ? ` for "${searchQuery}"` : ""}</span>
      </div>
    );
  }

  return (
    <div className="rounded-md border text-xs overflow-hidden">
      {/* Header */}
      <div className="bg-muted/50 px-2 py-1.5 border-b flex items-center gap-2">
        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium text-muted-foreground">
          {total} partner{total !== 1 ? "s" : ""} found
        </span>
      </div>

      {/* Partner rows */}
      <div className="divide-y divide-muted/50">
        {displayPartners.map((p) => (
          <div
            key={p.id}
            className="px-2 py-2 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <span className="font-medium block truncate">{p.name}</span>
                {p.aliases && p.aliases.length > 0 && (
                  <span className="text-[10px] text-muted-foreground block truncate">
                    aka: {p.aliases.slice(0, 2).join(", ")}
                  </span>
                )}
              </div>
              {p.country && (
                <span className="text-muted-foreground shrink-0">{p.country}</span>
              )}
            </div>
            {/* VAT / Website row */}
            {(p.vatId || p.website) && (
              <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                {p.vatId && (
                  <span className="flex items-center gap-1">
                    <Hash className="h-3 w-3" />
                    {p.vatId}
                  </span>
                )}
                {p.website && (
                  <span className="flex items-center gap-1">
                    <Globe className="h-3 w-3" />
                    {p.website}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* More indicator */}
      {hasMore && (
        <div className="px-2 py-1 text-center text-muted-foreground bg-muted/30 border-t">
          +{moreCount} more
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Company Lookup Result
// ============================================================================

interface CompanyLookupResultProps {
  result: CompanyLookupResult;
}

/**
 * GenUI preview for lookupCompanyInfo tool results.
 * Shows company information found via AI lookup.
 */
export function CompanyLookupResultUI({ result }: CompanyLookupResultProps) {
  // Check if we actually found anything useful
  const hasData = result.name || result.vatId || result.website ||
    (result.address && (result.address.street || result.address.city));

  if (!result.success || result.error || !hasData) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-sm flex items-start gap-2">
        <Search className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-medium text-amber-800 dark:text-amber-200">No company info found</span>
          <p className="text-xs text-muted-foreground mt-0.5">
            Searched for: {result.searchTerm}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border text-xs overflow-hidden">
      {/* Header */}
      <div className="bg-muted/50 px-2 py-1.5 border-b flex items-center gap-2">
        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium">Company Info Found</span>
      </div>

      <div className="p-2 space-y-1.5">
        {/* Company name */}
        {result.name && (
          <div className="flex items-center gap-2">
            <span className="font-medium">{result.name}</span>
            {result.country && (
              <span className="text-muted-foreground text-[10px] bg-muted px-1 rounded">
                {result.country}
              </span>
            )}
          </div>
        )}

        {/* VAT ID */}
        {result.vatId && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Hash className="h-3 w-3" />
            <span>{result.vatId}</span>
          </div>
        )}

        {/* Website */}
        {result.website && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Globe className="h-3 w-3" />
            <span>{result.website}</span>
          </div>
        )}

        {/* Address */}
        {result.address && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="h-3 w-3" />
            <span>
              {[result.address.street, result.address.postalCode, result.address.city]
                .filter(Boolean)
                .join(", ")}
            </span>
          </div>
        )}

        {/* Aliases */}
        {result.aliases && result.aliases.length > 0 && (
          <div className="text-[10px] text-muted-foreground">
            Also known as: {result.aliases.join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// VAT Validation Result
// ============================================================================

interface VatValidationResultProps {
  result: VatValidationResult;
}

/**
 * GenUI preview for validateVatId tool results.
 * Shows VAT validation status and company info from VIES.
 */
export function VatValidationResultUI({ result }: VatValidationResultProps) {
  const isValid = result.isValid;

  return (
    <div
      className={cn(
        "rounded-md border text-xs overflow-hidden",
        isValid
          ? "border-green-200 dark:border-green-800"
          : "border-red-200 dark:border-red-800"
      )}
    >
      {/* Header with validation status */}
      <div
        className={cn(
          "px-2 py-1.5 border-b flex items-center gap-2",
          isValid
            ? "bg-green-50 dark:bg-green-950/30"
            : "bg-red-50 dark:bg-red-950/30"
        )}
      >
        {isValid ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
        ) : (
          <XCircle className="h-3.5 w-3.5 text-red-600" />
        )}
        <span className={cn("font-medium", isValid ? "text-green-800 dark:text-green-200" : "text-red-800 dark:text-red-200")}>
          VAT {result.vatId} {isValid ? "Valid" : "Invalid"}
        </span>
      </div>

      <div className="p-2 space-y-1.5">
        {/* Company name from VIES */}
        {result.name && (
          <div className="flex items-center gap-2">
            <Building2 className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium">{result.name}</span>
          </div>
        )}

        {/* Address from VIES */}
        {result.address && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="h-3 w-3" />
            <span>
              {typeof result.address === "string"
                ? result.address
                : [result.address.street, result.address.postalCode, result.address.city, result.address.country]
                    .filter(Boolean)
                    .join(", ")}
            </span>
          </div>
        )}

        {/* Country */}
        {result.country && !result.address && (
          <div className="text-muted-foreground">
            Country: {result.country}
          </div>
        )}

        {/* Error message for invalid */}
        {!isValid && result.error && (
          <div className="flex items-start gap-1.5 text-red-600 dark:text-red-400">
            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
            <span>{result.error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
