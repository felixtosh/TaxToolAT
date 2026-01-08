"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface PillProps {
  label: string;
  icon?: React.ElementType;
  variant?: "default" | "suggestion";
  confidence?: number;
  onRemove?: () => void;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

export function Pill({
  label,
  icon: Icon,
  variant = "default",
  confidence,
  onRemove,
  onClick,
  disabled,
  className,
}: PillProps) {
  const isInteractive = onRemove || onClick;
  const isSuggestion = variant === "suggestion";

  const handleClick = () => {
    if (disabled) return;
    if (onClick) {
      onClick();
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
      onClick={isInteractive ? handleClick : undefined}
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
    >
      {Icon && (
        <Icon
          className={cn(
            "h-3.5 w-3.5 flex-shrink-0",
            isSuggestion ? "text-info-foreground" : "text-muted-foreground"
          )}
        />
      )}
      <span className="truncate">{label}</span>
      {confidence !== undefined && (
        <span
          className={cn(
            "text-xs flex-shrink-0 ml-auto",
            isSuggestion ? "text-info-foreground/70" : "text-muted-foreground"
          )}
        >
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
