"use client";

import { ReactNode } from "react";
import { Check, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface ClassificationBadge {
  /** Short label (e.g., "Receipt", "Link") */
  label: string;
  /** Description shown in tooltip */
  description: string;
  /** Badge color variant */
  variant: "receipt" | "link" | "pdf";
}

export interface ConnectResultRowProps {
  /** Unique identifier */
  id: string;
  /** Main title/name */
  title: string;
  /** Date string (already formatted) */
  date?: string;
  /** Formatted amount string */
  amount?: string;
  /** Amount color: positive (green) or negative (red) */
  amountType?: "positive" | "negative";
  /** Optional subtitle (shown below title) */
  subtitle?: string;
  /** Optional secondary subtitle (e.g., integration label) */
  secondarySubtitle?: string;
  /** Optional label badge (e.g., "Amount match") */
  labelBadge?: string;
  /** Additional metadata to show after date (e.g., "234 KB") */
  meta?: string;
  /** Optional icon element on the left */
  icon?: ReactNode;
  /** Whether this item is currently selected */
  isSelected?: boolean;
  /** Whether this item is already connected */
  isConnected?: boolean;
  /** Whether this item is highlighted as a suggestion/match */
  isHighlighted?: boolean;
  /** Highlight variant: "suggestion" (amber) or "strategy" (blue) */
  highlightVariant?: "suggestion" | "strategy";
  /** Match confidence percentage (0-100) */
  confidence?: number;
  /** Match signal labels for tooltip */
  matchSignals?: string[];
  /** Email classification badges with tooltips */
  classificationBadges?: ClassificationBadge[];
  /** Click handler */
  onClick?: () => void;
  /** Whether the button is disabled */
  disabled?: boolean;
}

/**
 * A standardized row component for connect overlays.
 * Used in both ConnectFileOverlay and ConnectTransactionOverlay.
 */
export function ConnectResultRow({
  title,
  date,
  amount,
  amountType,
  subtitle,
  secondarySubtitle,
  labelBadge,
  meta,
  icon,
  isSelected = false,
  isConnected = false,
  isHighlighted = false,
  highlightVariant = "suggestion",
  confidence,
  matchSignals = [],
  classificationBadges = [],
  onClick,
  disabled = false,
}: ConnectResultRowProps) {
  const showConfidence = confidence != null && confidence > 0 && !isConnected;

  return (
    <button
      type="button"
      disabled={disabled || isConnected}
      onClick={onClick}
      className={cn(
        "w-full flex items-start gap-3 p-3 rounded-md text-left transition-colors overflow-hidden",
        isSelected && "bg-primary/10 ring-1 ring-primary",
        !isSelected && !isConnected && !isHighlighted && "hover:bg-muted",
        isConnected && "opacity-50 cursor-not-allowed",
        isHighlighted && !isSelected && !isConnected && (
          highlightVariant === "strategy"
            ? "bg-blue-50 dark:bg-blue-950/20"
            : "bg-amber-50 dark:bg-amber-950/20"
        )
      )}
    >
      {/* Optional icon - caller provides the complete icon element with styling */}
      {icon}

      {/* Content */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {/* Title row */}
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-sm font-medium truncate flex-1 min-w-0">{title}</p>
          {isConnected && (
            <Badge variant="secondary" className="text-xs">
              <Link2 className="h-3 w-3 mr-1" />
              Connected
            </Badge>
          )}
        </div>

        {/* Subtitle row (e.g., From name) */}
        {subtitle && (
          <p className="text-xs text-muted-foreground truncate">
            {subtitle}
          </p>
        )}

        {/* Secondary subtitle row (e.g., integration label) */}
        {secondarySubtitle && (
          <p className="text-[11px] text-muted-foreground truncate">
            {secondarySubtitle}
          </p>
        )}

        {/* Date/Amount/Meta/Confidence row */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-0.5">
          {date && <span>{date}</span>}
          {date && (amount || meta) && <span>·</span>}
          {amount && (
            <span
              className={cn(
                "font-medium",
                amountType === "negative" && "text-red-600",
                amountType === "positive" && "text-green-600"
              )}
            >
              {amount}
            </span>
          )}
          {amount && meta && <span>·</span>}
          {meta && <span>{meta}</span>}
          {labelBadge && (
            <Badge variant="secondary" className="text-xs py-0 h-4 text-green-600">
              {labelBadge}
            </Badge>
          )}
          {showConfidence && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs py-0 h-4 cursor-help",
                    confidence >= 85
                      ? "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/50 dark:text-green-200 dark:border-green-700"
                      : confidence >= 70
                      ? "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/50 dark:text-yellow-200 dark:border-yellow-700"
                      : "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600"
                  )}
                >
                  {confidence}%
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[260px] text-xs">
                <div className="font-medium mb-1">Match signals</div>
                <div className="space-y-0.5">
                  {matchSignals.length > 0 ? (
                    matchSignals.map((signal, idx) => (
                      <div key={idx}>{signal}</div>
                    ))
                  ) : (
                    <div>No specific signals</div>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          )}
          {classificationBadges.map((badge, idx) => (
            <Tooltip key={idx}>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] py-0 h-4 cursor-help",
                    badge.variant === "receipt" && "bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/50 dark:text-purple-200 dark:border-purple-700",
                    badge.variant === "link" && "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/50 dark:text-blue-200 dark:border-blue-700",
                    badge.variant === "pdf" && "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/50 dark:text-orange-200 dark:border-orange-700"
                  )}
                >
                  {badge.label}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[200px] text-xs">
                {badge.description}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>

      {/* Selected check */}
      {isSelected && <Check className="h-4 w-4 text-primary flex-shrink-0 mt-1" />}
    </button>
  );
}
