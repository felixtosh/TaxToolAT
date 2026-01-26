"use client";

import { X, Building2, Globe, UserCheck, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface PartnerPillProps {
  name: string;
  confidence?: number;
  /** How the partner was matched - shows badge instead of confidence for manual/ai */
  matchedBy?: "manual" | "ai" | "auto" | "suggestion" | null;
  onRemove?: () => void;
  onClick?: (e?: React.MouseEvent) => void;
  variant?: "default" | "suggestion";
  partnerType?: "user" | "global";
  disabled?: boolean;
  className?: string;
}

export function PartnerPill({
  name,
  confidence,
  matchedBy,
  onRemove,
  onClick,
  variant = "default",
  partnerType,
  disabled,
  className
}: PartnerPillProps) {
  const isInteractive = onRemove || onClick;
  const isSuggestion = variant === "suggestion";

  const handleClick = (e: React.MouseEvent) => {
    if (disabled) return;
    // If there's an onClick, use it; otherwise use onRemove (legacy behavior)
    if (onClick) {
      onClick(e);
    } else if (onRemove) {
      onRemove();
    }
  };

  const handleRemoveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || !onRemove) return;
    onRemove();
  };

  return (
    <div
      className={cn(
        "inline-flex items-center h-7 px-3 gap-2 rounded-md border text-sm max-w-full min-w-0",
        isSuggestion
          ? "bg-info border-info-border text-info-foreground hover:bg-info/80"
          : "bg-background border-input",
        isInteractive && "cursor-pointer",
        !isSuggestion && isInteractive && "hover:bg-accent",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
      onClick={handleClick}
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
    >
      {partnerType && (
        partnerType === "user" ? (
          <Building2 className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        ) : (
          <Globe className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        )
      )}
      <span className="truncate">{name}</span>
      {matchedBy === "manual" || matchedBy === "suggestion" ? (
        <span className="inline-flex items-center gap-0.5 text-xs flex-shrink-0 ml-auto text-green-600" title={matchedBy === "manual" ? "Manually assigned" : "Accepted suggestion"}>
          <UserCheck className="h-3 w-3" />
        </span>
      ) : matchedBy === "ai" ? (
        <span className="inline-flex items-center gap-0.5 text-xs flex-shrink-0 ml-auto text-violet-500" title="AI assigned">
          <Sparkles className="h-3 w-3" />
        </span>
      ) : confidence !== undefined && (
        <span className={cn(
          "text-xs flex-shrink-0 ml-auto",
          isSuggestion ? "text-info-foreground/70" : "text-muted-foreground"
        )}>
          {Math.round(confidence)}%
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={handleRemoveClick}
          className="flex-shrink-0 p-0.5 -mr-1 rounded hover:bg-destructive/10"
          disabled={disabled}
        >
          <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
        </button>
      )}
    </div>
  );
}
