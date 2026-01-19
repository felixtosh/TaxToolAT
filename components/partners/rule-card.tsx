"use client";

import { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface RuleCardProps {
  icon: ReactNode;
  title: string;
  confidence?: number;
  children: ReactNode;
  className?: string;
  variant?: "default" | "learned" | "manual";
}

/**
 * A card component for displaying matching rules with visual hierarchy.
 * Used in partner detail panel to show IBAN, VAT, website, and pattern rules.
 */
export function RuleCard({
  icon,
  title,
  confidence,
  children,
  className,
  variant = "default",
}: RuleCardProps) {
  const borderColor = {
    default: "border-border",
    learned: "border-blue-200 dark:border-blue-800",
    manual: "border-green-200 dark:border-green-800",
  }[variant];

  const bgColor = {
    default: "bg-background",
    learned: "bg-blue-50/50 dark:bg-blue-950/20",
    manual: "bg-green-50/50 dark:bg-green-950/20",
  }[variant];

  const confidenceBadge = confidence !== undefined && (
    <Badge
      variant="secondary"
      className={cn(
        "text-[10px] font-medium ml-auto",
        confidence >= 90 && "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
        confidence >= 70 && confidence < 90 && "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300",
        confidence < 70 && "bg-muted text-muted-foreground"
      )}
    >
      {confidence}%
    </Badge>
  );

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        borderColor,
        bgColor,
        className
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-xs font-medium text-foreground">{title}</span>
        {confidenceBadge}
      </div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

/**
 * A compact inline rule display for less prominent rules
 */
export function RuleInline({
  icon,
  label,
  value,
  confidence,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  confidence?: number;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground">{label}:</span>
      <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
        {value}
      </code>
      {confidence !== undefined && (
        <Badge variant="outline" className="text-[10px] ml-auto">
          {confidence}%
        </Badge>
      )}
    </div>
  );
}
