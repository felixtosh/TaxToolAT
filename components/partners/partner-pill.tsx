"use client";

import { X, Building2, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

interface PartnerPillProps {
  name: string;
  confidence?: number;
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
      {confidence !== undefined && (
        <span className={cn(
          "text-xs flex-shrink-0 ml-auto",
          isSuggestion ? "text-info-foreground/70" : "text-muted-foreground"
        )}>
          {confidence}%
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
