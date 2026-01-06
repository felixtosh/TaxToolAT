"use client";

import { useState, useMemo } from "react";
import { format } from "date-fns";
import { Check, X, Loader2, Calendar, Euro, Building2, CreditCard, Hash, Sparkles } from "lucide-react";
import { TaxFile, TransactionSuggestion, TransactionMatchSource } from "@/types/file";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  getTransactionMatchConfidenceColor,
  getTransactionMatchSourceLabel,
} from "@/lib/matching/transaction-matcher";

function formatAmount(amount: number, currency: string = "EUR") {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: currency || "EUR",
  }).format(amount / 100);
}

function getSourceIcon(source: TransactionMatchSource) {
  switch (source) {
    case "amount_exact":
    case "amount_close":
      return Euro;
    case "date_exact":
    case "date_close":
      return Calendar;
    case "partner":
      return Building2;
    case "iban":
      return CreditCard;
    case "reference":
      return Hash;
    default:
      return Check;
  }
}

interface SuggestionRowProps {
  suggestion: TransactionSuggestion;
  onAccept: () => void;
  onDismiss: () => void;
  disabled?: boolean;
}

function SuggestionRow({
  suggestion,
  onAccept,
  onDismiss,
  disabled,
}: SuggestionRowProps) {
  const { preview, confidence, matchSources } = suggestion;

  return (
    <div className="flex items-center gap-2 p-2 -mx-2 rounded bg-muted/30 border border-dashed">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm truncate flex-1">{preview.name}</p>
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 text-xs px-1.5 py-0",
              getTransactionMatchConfidenceColor(confidence)
            )}
          >
            {confidence}%
          </Badge>
        </div>
        <div className="flex items-center justify-between mt-1">
          <p className="text-xs text-muted-foreground">
            {preview.date?.toDate
              ? format(preview.date.toDate(), "MMM d, yyyy")
              : ""}
          </p>
          <span
            className={cn(
              "text-sm font-medium tabular-nums",
              preview.amount < 0 ? "text-red-600" : "text-green-600"
            )}
          >
            {formatAmount(preview.amount, preview.currency)}
          </span>
        </div>
        {/* Match sources */}
        <div className="flex items-center gap-1 mt-1.5">
          <TooltipProvider>
            {matchSources.map((source, index) => {
              const Icon = getSourceIcon(source);
              return (
                <Tooltip key={index}>
                  <TooltipTrigger asChild>
                    <div className="p-1 rounded bg-muted">
                      <Icon className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {getTransactionMatchSourceLabel(source)}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </TooltipProvider>
        </div>
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 hover:bg-green-100 hover:text-green-700"
          onClick={onAccept}
          disabled={disabled}
        >
          <Check className="h-4 w-4" />
          <span className="sr-only">Accept</span>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 hover:bg-red-100 hover:text-red-700"
          onClick={onDismiss}
          disabled={disabled}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Dismiss</span>
        </Button>
      </div>
    </div>
  );
}

interface FileTransactionSuggestionsProps {
  file: TaxFile;
  onAccept: (suggestion: TransactionSuggestion) => Promise<void>;
  onDismiss: (transactionId: string) => Promise<void>;
}

export function FileTransactionSuggestions({
  file,
  onAccept,
  onDismiss,
}: FileTransactionSuggestionsProps) {
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Filter out suggestions for already connected transactions
  const suggestions = useMemo(() => {
    const connectedIds = new Set(file.transactionIds || []);
    return (file.transactionSuggestions || []).filter(
      (s) => !connectedIds.has(s.transactionId)
    );
  }, [file.transactionSuggestions, file.transactionIds]);

  const handleAccept = async (suggestion: TransactionSuggestion) => {
    setProcessingId(suggestion.transactionId);
    try {
      await onAccept(suggestion);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDismiss = async (transactionId: string) => {
    setProcessingId(transactionId);
    try {
      await onDismiss(transactionId);
    } finally {
      setProcessingId(null);
    }
  };

  // Don't show section if no suggestions
  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-amber-500" />
        <h3 className="text-sm font-medium">Suggested Transactions</h3>
        <Badge variant="secondary" className="text-xs">
          {suggestions.length}
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground">
        These transactions may match this file based on amount, date, and partner.
      </p>

      <div className="space-y-2">
        {suggestions.map((suggestion) => (
          <SuggestionRow
            key={suggestion.transactionId}
            suggestion={suggestion}
            onAccept={() => handleAccept(suggestion)}
            onDismiss={() => handleDismiss(suggestion.transactionId)}
            disabled={processingId === suggestion.transactionId}
          />
        ))}
      </div>
    </div>
  );
}
