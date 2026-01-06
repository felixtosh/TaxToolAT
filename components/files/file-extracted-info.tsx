"use client";

import { format } from "date-fns";
import { TaxFile } from "@/types/file";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Consistent field row component (matching transaction-details.tsx)
function FieldRow({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4", className)}>
      <span className="text-sm text-muted-foreground shrink-0 sm:w-28">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  );
}

interface FileExtractedInfoProps {
  file: TaxFile;
}

export function FileExtractedInfo({ file }: FileExtractedInfoProps) {
  const formatAmount = (amount: number | null | undefined, currency: string | null | undefined) => {
    if (amount == null) return "—";
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: currency || "EUR",
    }).format(amount / 100);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Extracted Information</h3>
        {file.extractionComplete ? (
          file.extractionError ? (
            <Badge variant="destructive">Error</Badge>
          ) : (
            <Badge variant="secondary" className="text-green-600 bg-green-50">
              {file.extractionConfidence != null && `${file.extractionConfidence}%`}
            </Badge>
          )
        ) : (
          <Badge variant="outline">Pending</Badge>
        )}
      </div>

      {/* Extraction error message */}
      {file.extractionError && (
        <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
          {file.extractionError}
        </div>
      )}

      {/* Fields */}
      {file.extractionComplete && !file.extractionError && (
        <div className="space-y-2">
          <FieldRow label="Document Date">
            {file.extractedDate
              ? format(file.extractedDate.toDate(), "MMM d, yyyy")
              : "—"}
          </FieldRow>

          <FieldRow label="Amount">
            {formatAmount(file.extractedAmount, file.extractedCurrency)}
          </FieldRow>

          <FieldRow label="VAT">
            {file.extractedVatPercent != null ? `${file.extractedVatPercent}%` : "—"}
          </FieldRow>

          <FieldRow label="Partner">
            {file.extractedPartner || "—"}
          </FieldRow>

          {file.extractedVatId && (
            <FieldRow label="VAT ID">
              {file.extractedVatId}
            </FieldRow>
          )}

          {file.extractedIban && (
            <FieldRow label="IBAN">
              {file.extractedIban}
            </FieldRow>
          )}

          {file.extractedAddress && (
            <FieldRow label="Address">
              {file.extractedAddress}
            </FieldRow>
          )}
        </div>
      )}
    </div>
  );
}
