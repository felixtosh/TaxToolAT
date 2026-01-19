"use client";

import { FileText, Check, Loader2 } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { convertCurrency } from "@/lib/currency";

interface AmountInfo {
  amount: number;
  currency: string;
}

interface AmountMatchDisplayProps {
  /** Number of connected items */
  count: number;
  /** Type of items being counted */
  countType: "file" | "tx";
  /** The primary entity's amount (transaction amount or file extracted amount) in cents */
  primaryAmount: number | null;
  /** The primary entity's currency */
  primaryCurrency: string;
  /** Connected items' amounts (files for transactions, transactions for files) */
  secondaryAmounts: AmountInfo[];
  /** Date for currency conversion (e.g., invoice date) */
  conversionDate?: Date;
  /** Whether any connected files are still being extracted */
  isExtracting?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * Displays file/transaction matching info in a pill style.
 * Layout: [count] [icon] [open amount]
 */
export function AmountMatchDisplay({
  count,
  countType,
  primaryAmount,
  primaryCurrency,
  secondaryAmounts,
  conversionDate,
  isExtracting,
  className,
}: AmountMatchDisplayProps) {
  const Icon = FileText;

  // Get unique secondary currencies
  const secondaryCurrencies = [...new Set(secondaryAmounts.map(a => a.currency))];

  // Check for currency mismatch
  const hasCurrencyMismatch = secondaryCurrencies.some(c => c !== primaryCurrency);

  // Icon with optional count badge
  const IconWithBadge = (
    <div className="relative flex-shrink-0">
      <Icon className="h-4 w-4 text-muted-foreground" />
      {count > 1 && (
        <span className="absolute -bottom-1 -right-1.5 flex items-center justify-center h-3.5 min-w-3.5 px-1 text-[10px] font-medium bg-muted text-muted-foreground rounded-full">
          {count}
        </span>
      )}
    </div>
  );

  // If no secondary amounts, show icon (with spinner if extracting)
  if (secondaryAmounts.length === 0) {
    return (
      <div className={cn(
        "inline-flex items-center h-7 px-3 gap-2 rounded-md border text-sm bg-background border-input",
        className
      )}>
        {IconWithBadge}
        {isExtracting && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        )}
      </div>
    );
  }

  // Convert all secondary amounts to primary currency and sum them
  let convertedTotal = 0;
  let conversionRate: number | null = null;
  let conversionFailed = false;
  let wasConverted = false;

  for (const secondary of secondaryAmounts) {
    if (secondary.currency === primaryCurrency) {
      convertedTotal += Math.abs(secondary.amount);
    } else if (conversionDate) {
      const conversion = convertCurrency(
        Math.abs(secondary.amount),
        secondary.currency,
        primaryCurrency,
        conversionDate
      );
      if (conversion) {
        convertedTotal += conversion.amount;
        conversionRate = conversion.rate;
        wasConverted = true;
      } else {
        conversionFailed = true;
      }
    } else {
      conversionFailed = true;
    }
  }

  // Calculate open amount in primary currency
  const primaryAbsolute = primaryAmount != null ? Math.abs(primaryAmount) : null;
  const openAmount = primaryAbsolute != null && !conversionFailed
    ? primaryAbsolute - convertedTotal
    : null;
  const isMatched = openAmount !== null && Math.abs(openAmount) < 100; // Within 1 EUR/USD tolerance

  // For same currency case
  const secondaryTotal = secondaryAmounts.reduce((sum, a) => sum + Math.abs(a.amount), 0);
  const normalOpenAmount = !hasCurrencyMismatch && primaryAbsolute != null
    ? primaryAbsolute - secondaryTotal
    : null;
  const normalIsMatched = normalOpenAmount !== null && normalOpenAmount === 0;

  // Determine what to show on the right side
  // Positive open = transaction > files (underpaid, show -)
  // Negative open = transaction < files (overpaid/too much, show +)
  let rightText: string;
  let rightColor: string;
  let showCheck = false;

  if (hasCurrencyMismatch) {
    if (!conversionFailed && openAmount !== null) {
      const prefix = wasConverted ? "~" : "";
      if (isMatched) {
        rightText = "";
        rightColor = "text-green-600";
        showCheck = true;
      } else if (openAmount < 0) {
        // Files > Transaction (too much)
        rightText = `${prefix}+${formatCurrency(Math.abs(openAmount), primaryCurrency)}`;
        rightColor = "text-amber-600";
      } else {
        // Files < Transaction (underpaid)
        rightText = `${prefix}-${formatCurrency(Math.abs(openAmount), primaryCurrency)}`;
        rightColor = "text-red-600";
      }
    } else {
      // Fallback when conversion fails
      const secondaryFormatted = formatCurrency(Math.abs(secondaryAmounts[0].amount), secondaryAmounts[0].currency);
      rightText = `${formatCurrency(Math.abs(primaryAmount!), primaryCurrency)} vs ${secondaryFormatted}`;
      rightColor = "text-muted-foreground";
    }
  } else {
    if (normalOpenAmount !== null && primaryAmount != null) {
      if (normalIsMatched) {
        rightText = "";
        rightColor = "text-green-600";
        showCheck = true;
      } else if (normalOpenAmount < 0) {
        // Files > Transaction (too much)
        rightText = `+${formatCurrency(Math.abs(normalOpenAmount), primaryCurrency)}`;
        rightColor = "text-amber-600";
      } else {
        // Files < Transaction (underpaid)
        rightText = `-${formatCurrency(Math.abs(normalOpenAmount), primaryCurrency)}`;
        rightColor = "text-red-600";
      }
    } else {
      rightText = "";
      rightColor = "text-muted-foreground";
    }
  }

  const pillContent = (
    <div className={cn(
      "inline-flex items-center h-7 px-3 gap-2 rounded-md border text-sm bg-background border-input",
      className
    )}>
      {IconWithBadge}
      {isExtracting ? (
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      ) : (rightText || showCheck) && (
        <span className={cn("flex items-center gap-1 text-xs", rightColor)}>
          {rightText && <span className="truncate">{rightText}</span>}
          {showCheck && <Check className="h-3 w-3 flex-shrink-0" strokeWidth={3} />}
        </span>
      )}
    </div>
  );

  // Wrap in tooltip for currency mismatch cases
  if (hasCurrencyMismatch && primaryAmount != null) {
    const secondaryFormatted = secondaryAmounts.length === 1
      ? formatCurrency(Math.abs(secondaryAmounts[0].amount), secondaryAmounts[0].currency)
      : `${secondaryAmounts.length} items`;

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {pillContent}
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs font-medium">Currency mismatch</p>
          <p className="text-xs text-muted-foreground">
            {countType === "file" ? "Transaction" : "File"}: {formatCurrency(Math.abs(primaryAmount), primaryCurrency)}
          </p>
          <p className="text-xs text-muted-foreground">
            {countType === "file" ? "Files" : "Transactions"}: {secondaryFormatted}
          </p>
          {!conversionFailed && conversionRate !== null && (
            <>
              <p className="text-xs text-muted-foreground mt-1">
                Converted: ~{formatCurrency(convertedTotal, primaryCurrency)}
              </p>
              <p className="text-xs text-muted-foreground">
                Rate: 1 {secondaryCurrencies[0]} = {conversionRate.toFixed(4)} {primaryCurrency}
              </p>
            </>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  return pillContent;
}
