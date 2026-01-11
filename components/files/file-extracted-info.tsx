"use client";

import { useState } from "react";
import { format } from "date-fns";
import { RefreshCw, Search, Loader2 } from "lucide-react";
import { ShowMoreButton } from "@/components/ui/show-more-button";
import { TaxFile } from "@/types/file";
import { InvoiceDirection } from "@/types/user-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Consistent field row component (matching transaction-details.tsx)
function FieldRow({
  label,
  children,
  className,
  onClick,
  searchText,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  onClick?: (text: string) => void;
  searchText?: string;
}) {
  const isClickable = onClick && searchText;

  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4", className)}>
      <span className="text-sm text-muted-foreground shrink-0 sm:w-28">{label}</span>
      {isClickable ? (
        <button
          onClick={() => onClick(searchText)}
          className="text-sm text-left hover:text-primary hover:underline underline-offset-2 flex items-center gap-1 group"
        >
          {children}
          <Search className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
        </button>
      ) : (
        <span className="text-sm">{children}</span>
      )}
    </div>
  );
}

interface FileExtractedInfoProps {
  file: TaxFile;
  onRetryExtraction?: () => void;
  isRetrying?: boolean;
  /** True when parsing is in progress (after user marked file as invoice) */
  isParsing?: boolean;
  /** Called when user clicks a field value to search for it */
  onFieldClick?: (searchText: string) => void;
  /** Called when user changes invoice direction */
  onDirectionChange?: (direction: InvoiceDirection) => void;
}

export function FileExtractedInfo({ file, onRetryExtraction, isRetrying, isParsing, onFieldClick, onDirectionChange }: FileExtractedInfoProps) {
  const [showMore, setShowMore] = useState(false);

  const formatAmount = (amount: number | null | undefined, currency: string | null | undefined, direction?: string) => {
    if (amount == null) return "—";
    // Apply sign based on direction (incoming = expense/negative, outgoing = income/positive)
    const signedAmount = direction === "incoming" ? -(amount / 100) : amount / 100;
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: currency || "EUR",
    }).format(signedAmount);
  };

  // Get raw search text directly - no fallbacks, only use extracted raw text
  // Only works with string fields, not entity objects (issuer/recipient)
  type StringRawFields = "date" | "amount" | "vatPercent" | "partner" | "vatId" | "iban" | "address" | "website";
  const getRawSearchText = (field: StringRawFields): string | undefined => {
    const value = file.extractedRaw?.[field];
    return typeof value === "string" ? value : undefined;
  };

  // Get additional fields
  const additionalFields = file.extractedAdditionalFields || [];
  const hasAdditionalFields = additionalFields.length > 0;

  // Secondary fields (VAT ID, IBAN, Address) - shown in "Show more"
  const hasSecondaryFields = !!(file.extractedVatId || file.extractedIban || file.extractedAddress);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Extracted Information</h3>
        <div className="flex items-center gap-1.5">
          {file.extractionComplete ? (
            // Extraction done - show result or error
            file.extractionError ? (
              <>
                <Badge variant="destructive">Error</Badge>
                {onRetryExtraction && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/20"
                    onClick={onRetryExtraction}
                    disabled={isRetrying}
                  >
                    <RefreshCw className={cn("h-4 w-4", isRetrying && "animate-spin")} />
                    <span className="sr-only">Retry extraction</span>
                  </Button>
                )}
              </>
            ) : (
              <Badge variant="secondary" className="text-green-600 bg-green-50">
                {file.extractionConfidence != null && `${file.extractionConfidence}%`}
              </Badge>
            )
          ) : file.classificationComplete && !file.isNotInvoice ? (
            // Classification done (is invoice), extraction in progress - show "Parsing..."
            <span className="flex items-center gap-1.5 text-muted-foreground text-sm">
              <Loader2 className="h-3 w-3 animate-spin" />
              Parsing...
            </span>
          ) : isParsing ? (
            // User override: treating as invoice, parsing in progress
            <span className="flex items-center gap-1.5 text-muted-foreground text-sm">
              <Loader2 className="h-3 w-3 animate-spin" />
              Parsing...
            </span>
          ) : null}
        </div>
      </div>

      {/* Extraction error message */}
      {file.extractionError && (
        <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
          {file.extractionError}
        </div>
      )}

      {/* Fields - only show for invoices (not-invoice toggle is in Quick Info now) */}
      {file.extractionComplete && !file.extractionError && !file.isNotInvoice && (
        <div className="space-y-2">
          {/* Primary fields - always visible */}
          <FieldRow
            label="Document Date"
            onClick={onFieldClick}
            searchText={getRawSearchText("date")}
          >
            {file.extractedDate
              ? format(file.extractedDate.toDate(), "MMM d, yyyy")
              : "—"}
          </FieldRow>

          {/* Amount with direction toggle */}
          <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4">
            <span className="text-sm text-muted-foreground shrink-0 sm:w-28">Amount</span>
            <div className="flex items-center justify-between flex-1 gap-2">
              {/* Amount value with color based on direction */}
              {getRawSearchText("amount") && onFieldClick ? (
                <button
                  onClick={() => onFieldClick(getRawSearchText("amount")!)}
                  className={cn(
                    "text-sm text-left hover:underline underline-offset-2 flex items-center gap-1 group",
                    file.invoiceDirection === "outgoing" && "text-emerald-600",
                    file.invoiceDirection === "incoming" && "text-red-600"
                  )}
                >
                  {formatAmount(file.extractedAmount, file.extractedCurrency, file.invoiceDirection)}
                  <Search className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                </button>
              ) : (
                <span className={cn(
                  "text-sm",
                  file.invoiceDirection === "outgoing" && "text-emerald-600",
                  file.invoiceDirection === "incoming" && "text-red-600"
                )}>
                  {formatAmount(file.extractedAmount, file.extractedCurrency, file.invoiceDirection)}
                </span>
              )}
              {/* Direction toggle - right aligned */}
              {onDirectionChange && file.extractedAmount != null && (
                <div className="flex rounded-md border border-input overflow-hidden text-xs">
                  <button
                    onClick={() => onDirectionChange("incoming")}
                    className={cn(
                      "px-1.5 py-0.5 transition-colors",
                      file.invoiceDirection === "incoming"
                        ? "bg-red-500 text-white"
                        : "hover:bg-muted"
                    )}
                  >
                    In
                  </button>
                  <button
                    onClick={() => onDirectionChange("outgoing")}
                    className={cn(
                      "px-1.5 py-0.5 transition-colors border-l border-input",
                      file.invoiceDirection === "outgoing"
                        ? "bg-emerald-500 text-white"
                        : "hover:bg-muted"
                    )}
                  >
                    Out
                  </button>
                </div>
              )}
            </div>
          </div>

          <FieldRow
            label="VAT"
            onClick={onFieldClick}
            searchText={getRawSearchText("vatPercent")}
          >
            {file.extractedVatPercent != null ? `${file.extractedVatPercent}%` : "—"}
          </FieldRow>

          <FieldRow
            label="Partner"
            onClick={onFieldClick}
            searchText={getRawSearchText("partner")}
          >
            {file.extractedPartner || "—"}
          </FieldRow>

          {/* Show more toggle - only if there are secondary or additional fields */}
          {(hasSecondaryFields || hasAdditionalFields) && (
            <>
              <ShowMoreButton
                expanded={showMore}
                onToggle={() => setShowMore(!showMore)}
                className="pt-1"
              />

              {/* Secondary and additional fields - collapsed by default */}
              {showMore && (
                <div className="space-y-2 pt-1">
                  {file.extractedVatId && (
                    <FieldRow
                      label="VAT ID"
                      onClick={onFieldClick}
                      searchText={getRawSearchText("vatId")}
                    >
                      {file.extractedVatId}
                    </FieldRow>
                  )}

                  {file.extractedIban && (
                    <FieldRow
                      label="IBAN"
                      onClick={onFieldClick}
                      searchText={getRawSearchText("iban")}
                    >
                      {file.extractedIban}
                    </FieldRow>
                  )}

                  {file.extractedAddress && (
                    <FieldRow
                      label="Address"
                      onClick={onFieldClick}
                      searchText={getRawSearchText("address")}
                    >
                      {file.extractedAddress}
                    </FieldRow>
                  )}

                  {/* Additional fields extracted by AI */}
                  {additionalFields.map((field, index) => (
                    <FieldRow
                      key={index}
                      label={field.label}
                      onClick={onFieldClick}
                      searchText={field.rawValue || field.value}
                    >
                      {field.value}
                    </FieldRow>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
