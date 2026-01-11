"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { PipelineId } from "@/types/automation";

interface AutomationHeaderProps {
  /** Column label text */
  label: string;
  /** Which automation pipeline this header represents */
  pipelineId: PipelineId;
  /** Callback when automation button is clicked */
  onAutomationClick: (pipelineId: PipelineId) => void;
  /** Additional CSS classes */
  className?: string;
}

export function AutomationHeader({
  label,
  pipelineId,
  onAutomationClick,
  className,
}: AutomationHeaderProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAutomationClick(pipelineId);
  };

  return (
    <div
      className={cn(
        "h-8 -mx-2 px-2 w-[calc(100%+1rem)] flex items-center justify-between font-medium",
        className
      )}
    >
      <span className="truncate">{label}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 flex-shrink-0 ml-2"
            onClick={handleClick}
          >
            <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="sr-only">View automations</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>View automations</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
