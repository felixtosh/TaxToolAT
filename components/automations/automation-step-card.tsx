"use client";

import * as React from "react";
import {
  Building2,
  Sparkles,
  Receipt,
  Globe,
  Tag,
  Search,
  Bot,
  FileSearch,
  Mail,
  CheckCircle,
  ExternalLink,
  AlertCircle,
  Clock,
  FolderOpen,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AutomationStep, IntegrationStatus } from "@/types/automation";

/**
 * Icon name to component mapping
 */
const ICON_MAP: Record<string, LucideIcon> = {
  Building2,
  Sparkles,
  Receipt,
  Globe,
  Tag,
  Search,
  Bot,
  FileSearch,
  Mail,
  CheckCircle,
  FolderOpen,
};

interface AutomationStepCardProps {
  step: AutomationStep;
  integrationStatus?: IntegrationStatus;
  isSelected?: boolean;
  onClick?: () => void;
  className?: string;
}

export function AutomationStepCard({
  step,
  integrationStatus,
  isSelected,
  onClick,
  className,
}: AutomationStepCardProps) {
  const Icon = ICON_MAP[step.icon] || Sparkles;
  const isAvailable = !step.integrationId || integrationStatus?.isConnected;
  const needsReauth = integrationStatus?.needsReauth;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer",
        isSelected
          ? "bg-accent border-accent-foreground/20"
          : "hover:bg-accent/50 border-transparent",
        !isAvailable && "opacity-60",
        className
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          "flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center",
          step.category === "ai"
            ? "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
            : step.category === "search"
              ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
              : "bg-muted text-muted-foreground"
        )}
      >
        <Icon className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-medium text-sm truncate">{step.name}</span>
          {/* Integration badge */}
          {step.integrationId ? (
            <Badge
              variant={isAvailable ? "secondary" : "outline"}
              className={cn(
                "text-xs px-1.5 py-0",
                !isAvailable && "text-muted-foreground"
              )}
            >
              {needsReauth && <AlertCircle className="h-3 w-3 mr-1" />}
              {step.integrationId === "gmail" ? "Gmail" : step.integrationId}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs px-1.5 py-0">
              System
            </Badge>
          )}
        </div>

        <p className="text-xs text-muted-foreground line-clamp-2">
          {step.shortDescription}
        </p>

        {/* Confidence range & trigger */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {step.confidence && (
            <span className="text-xs text-muted-foreground">
              {step.confidence.unit === "percent" ? (
                <>
                  {step.confidence.min === step.confidence.max
                    ? `${step.confidence.min}%`
                    : `${step.confidence.min}-${step.confidence.max}%`}{" "}
                  confidence
                </>
              ) : (
                <>
                  {step.confidence.min === step.confidence.max
                    ? `${step.confidence.max}`
                    : `${step.confidence.min}-${step.confidence.max}`}{" "}
                  points
                </>
              )}
            </span>
          )}
          {/* Show trigger badge for non-"always" triggers */}
          {step.trigger && step.trigger !== "always" && (
            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
              <Clock className="h-3 w-3" />
              {step.trigger === "if_no_match" && "If no match"}
              {step.trigger === "if_integration" && "If connected"}
              {step.trigger === "manual" && "Manual"}
            </span>
          )}
        </div>
      </div>

      {/* Arrow if clickable */}
      {onClick && (
        <ExternalLink className="h-4 w-4 flex-shrink-0 text-muted-foreground/50" />
      )}
    </div>
  );
}
