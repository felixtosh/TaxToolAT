"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface ShowMoreButtonProps {
  expanded: boolean;
  onToggle: () => void;
  className?: string;
}

export function ShowMoreButton({ expanded, onToggle, className }: ShowMoreButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors",
        className
      )}
    >
      {expanded ? (
        <>
          Show less
          <ChevronUp className="h-3 w-3" />
        </>
      ) : (
        <>
          Show more
          <ChevronDown className="h-3 w-3" />
        </>
      )}
    </button>
  );
}
