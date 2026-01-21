"use client";

import { useState } from "react";
import { format } from "date-fns";
import { RefreshCw, Search, Loader2, Pencil, X, Plus, Trash2 } from "lucide-react";
import { ShowMoreButton } from "@/components/ui/show-more-button";
import { TaxFile } from "@/types/file";
import { InvoiceDirection } from "@/types/user-data";
import { EditableExtractedFields, EditableAdditionalField } from "@/lib/operations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { convertCurrency } from "@/lib/currency";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Consistent field row component (matching transaction-details.tsx)
function FieldRow({
  label,
  children,
  className,
  onClick,
  searchText,
  isEditing,
  editValue,
  onEditChange,
  inputType = "text",
  placeholder,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  onClick?: (text: string) => void;
  searchText?: string;
  isEditing?: boolean;
  editValue?: string;
  onEditChange?: (value: string) => void;
  inputType?: "text" | "date" | "number";
  placeholder?: string;
}) {
  const isClickable = onClick && searchText && !isEditing;

  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4", className)}>
      <span className="text-sm text-muted-foreground shrink-0 sm:w-28">{label}</span>
      {isEditing && onEditChange ? (
        <Input
          type={inputType}
          value={editValue ?? ""}
          onChange={(e) => onEditChange(e.target.value)}
          className="h-8 text-sm flex-1"
          placeholder={placeholder}
        />
      ) : isClickable ? (
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
  /** Called when user updates extracted fields */
  onUpdate?: (fields: EditableExtractedFields) => Promise<void>;
  /** True when update is in progress */
  isUpdating?: boolean;
}

export function FileExtractedInfo({ file, onRetryExtraction, isRetrying, isParsing, onFieldClick, onDirectionChange, onUpdate, isUpdating }: FileExtractedInfoProps) {
  const [showMore, setShowMore] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedFields, setEditedFields] = useState<EditableExtractedFields>({
    date: "",
    amount: "",
    vatPercent: "",
    partner: "",
    vatId: "",
    iban: "",
    address: "",
    additionalFields: [],
  });

  // Initialize edit fields from file data
  const startEditing = () => {
    const existingAdditional = (file.extractedAdditionalFields || []).map((f) => ({
      label: f.label,
      value: f.value,
    }));

    setEditedFields({
      date: file.extractedDate ? format(file.extractedDate.toDate(), "yyyy-MM-dd") : "",
      amount: file.extractedAmount != null ? (file.extractedAmount / 100).toString() : "",
      vatPercent: file.extractedVatPercent != null ? file.extractedVatPercent.toString() : "",
      partner: file.extractedPartner || "",
      vatId: file.extractedVatId || "",
      iban: file.extractedIban || "",
      address: file.extractedAddress || "",
      additionalFields: existingAdditional,
    });
    setIsEditing(true);
    setShowMore(true); // Expand to show all fields when editing
  };

  const cancelEditing = () => {
    setIsEditing(false);
  };

  const handleUpdate = async () => {
    if (onUpdate) {
      await onUpdate(editedFields);
      setIsEditing(false);
    }
  };

  const updateField = (field: keyof Omit<EditableExtractedFields, "additionalFields">) => (value: string) => {
    setEditedFields((prev) => ({ ...prev, [field]: value }));
  };

  const updateAdditionalField = (index: number, key: "label" | "value", newValue: string) => {
    setEditedFields((prev) => ({
      ...prev,
      additionalFields: prev.additionalFields.map((f, i) =>
        i === index ? { ...f, [key]: newValue } : f
      ),
    }));
  };

  const addAdditionalField = () => {
    setEditedFields((prev) => ({
      ...prev,
      additionalFields: [...prev.additionalFields, { label: "", value: "" }],
    }));
  };

  const removeAdditionalField = (index: number) => {
    setEditedFields((prev) => ({
      ...prev,
      additionalFields: prev.additionalFields.filter((_, i) => i !== index),
    }));
  };

  const formatAmount = (amount: number | null | undefined, currency: string | null | undefined, direction?: string) => {
    if (amount == null) return "—";
    // Apply sign based on direction (incoming = expense/negative, outgoing = income/positive)
    const signedAmount = direction === "incoming" ? -(amount / 100) : amount / 100;
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: currency || "EUR",
    }).format(signedAmount);
  };

  // Format amount with EUR conversion - EUR is always primary display
  const formatAmountWithConversion = (
    amount: number | null | undefined,
    currency: string | null | undefined,
    direction?: string,
    conversionDate?: Date
  ): {
    display: string;
    isNegative: boolean;
    conversionInfo: { original: string; converted: string; rate: number; rateCurrency: string } | null
  } => {
    if (amount == null) return { display: "—", isNegative: false, conversionInfo: null };

    const normalizedCurrency = (currency || "EUR").toUpperCase();
    const originalFormatted = formatAmount(amount, currency, direction);
    const isNegative = direction === "incoming";

    // No conversion needed if already EUR
    if (normalizedCurrency === "EUR") {
      return { display: originalFormatted, isNegative, conversionInfo: null };
    }

    // Convert to EUR - EUR becomes primary display
    const dateForConversion = conversionDate || new Date();
    const conversion = convertCurrency(
      Math.abs(amount),
      normalizedCurrency,
      "EUR",
      dateForConversion
    );

    if (conversion) {
      const signedConverted = isNegative ? -(conversion.amount / 100) : conversion.amount / 100;
      const convertedStr = "~" + new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
      }).format(signedConverted);
      return {
        display: convertedStr,
        isNegative,
        conversionInfo: {
          original: originalFormatted,
          converted: convertedStr,
          rate: conversion.rate,
          rateCurrency: normalizedCurrency,
        }
      };
    }

    return { display: originalFormatted, isNegative, conversionInfo: null };
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
              <>
                <Badge variant="secondary" className="text-green-600 bg-green-50">
                  {file.extractionConfidence != null && `${file.extractionConfidence}%`}
                </Badge>
                {/* Edit/Close button */}
                {onUpdate && !file.isNotInvoice && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={isEditing ? cancelEditing : startEditing}
                  >
                    {isEditing ? (
                      <X className="h-4 w-4" />
                    ) : (
                      <Pencil className="h-4 w-4" />
                    )}
                    <span className="sr-only">{isEditing ? "Cancel editing" : "Edit fields"}</span>
                  </Button>
                )}
              </>
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
            isEditing={isEditing}
            editValue={editedFields.date}
            onEditChange={updateField("date")}
            inputType="date"
          >
            {file.extractedDate
              ? format(file.extractedDate.toDate(), "MMM d, yyyy")
              : "—"}
          </FieldRow>

          {/* Amount - shows EUR (converted if needed), with tooltip for conversion details */}
          <FieldRow
            label="Amount"
            onClick={onFieldClick}
            searchText={getRawSearchText("amount")}
            isEditing={isEditing}
            editValue={editedFields.amount}
            onEditChange={updateField("amount")}
            inputType="number"
            placeholder="Amount in EUR"
          >
            {(() => {
              const { display, isNegative, conversionInfo } = formatAmountWithConversion(
                file.extractedAmount,
                file.extractedCurrency,
                file.invoiceDirection,
                file.extractedDate?.toDate()
              );

              const amountDisplay = (
                <span className={cn(
                  "tabular-nums",
                  isNegative ? "text-amount-negative" : "text-amount-positive"
                )}>
                  {display}
                </span>
              );

              if (conversionInfo) {
                return (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>{amountDisplay}</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">
                        <span className="text-muted-foreground">Original:</span> {conversionInfo.original}
                      </p>
                      <p className="text-xs">
                        <span className="text-muted-foreground">Converted:</span> {conversionInfo.converted}
                      </p>
                      <p className="text-xs">
                        <span className="text-muted-foreground">Rate:</span> 1 {conversionInfo.rateCurrency} = {conversionInfo.rate.toFixed(4)} EUR
                      </p>
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return amountDisplay;
            })()}
          </FieldRow>

          <FieldRow
            label="VAT"
            onClick={onFieldClick}
            searchText={getRawSearchText("vatPercent")}
            isEditing={isEditing}
            editValue={editedFields.vatPercent}
            onEditChange={updateField("vatPercent")}
            inputType="number"
            placeholder="VAT %"
          >
            {file.extractedVatPercent != null ? `${file.extractedVatPercent}%` : "—"}
          </FieldRow>

          <FieldRow
            label="Partner"
            onClick={onFieldClick}
            searchText={getRawSearchText("partner")}
            isEditing={isEditing}
            editValue={editedFields.partner}
            onEditChange={updateField("partner")}
            placeholder="Company name"
          >
            {file.extractedPartner || "—"}
          </FieldRow>

          {/* Show more toggle - only if there are secondary or additional fields (hide when editing since all are shown) */}
          {(hasSecondaryFields || hasAdditionalFields) && !isEditing && (
            <ShowMoreButton
              expanded={showMore}
              onToggle={() => setShowMore(!showMore)}
              className="pt-1"
            />
          )}

          {/* Secondary and additional fields - collapsed by default, always shown when editing */}
          {(showMore || isEditing) && (
            <div className="space-y-2 pt-1">
              {(file.extractedVatId || isEditing) && (
                <FieldRow
                  label="VAT ID"
                  onClick={onFieldClick}
                  searchText={getRawSearchText("vatId")}
                  isEditing={isEditing}
                  editValue={editedFields.vatId}
                  onEditChange={updateField("vatId")}
                  placeholder="e.g., DE123456789"
                >
                  {file.extractedVatId || "—"}
                </FieldRow>
              )}

              {(file.extractedIban || isEditing) && (
                <FieldRow
                  label="IBAN"
                  onClick={onFieldClick}
                  searchText={getRawSearchText("iban")}
                  isEditing={isEditing}
                  editValue={editedFields.iban}
                  onEditChange={updateField("iban")}
                  placeholder="e.g., DE89370400440532013000"
                >
                  {file.extractedIban || "—"}
                </FieldRow>
              )}

              {(file.extractedAddress || isEditing) && (
                <FieldRow
                  label="Address"
                  onClick={onFieldClick}
                  searchText={getRawSearchText("address")}
                  isEditing={isEditing}
                  editValue={editedFields.address}
                  onEditChange={updateField("address")}
                  placeholder="Full address"
                >
                  {file.extractedAddress || "—"}
                </FieldRow>
              )}

              {/* Additional fields - editable with label+value pairs */}
              {isEditing ? (
                <>
                  {editedFields.additionalFields.map((field, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        value={field.label}
                        onChange={(e) => updateAdditionalField(index, "label", e.target.value)}
                        className="h-8 text-sm w-28 shrink-0"
                        placeholder="Label"
                      />
                      <Input
                        value={field.value}
                        onChange={(e) => updateAdditionalField(index, "value", e.target.value)}
                        className="h-8 text-sm flex-1"
                        placeholder="Value"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeAdditionalField(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={addAdditionalField}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add field
                  </Button>
                </>
              ) : (
                additionalFields.map((field, index) => (
                  <FieldRow
                    key={index}
                    label={field.label}
                    onClick={onFieldClick}
                    searchText={field.rawValue || field.value}
                  >
                    {field.value}
                  </FieldRow>
                ))
              )}
            </div>
          )}

          {/* Update/Cancel buttons - shown when editing */}
          {isEditing && (
            <div className="flex gap-2 pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={cancelEditing}
                disabled={isUpdating}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleUpdate}
                disabled={isUpdating}
              >
                {isUpdating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update"
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
