"use client";

import { ReactNode, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// ============================================================================
// FILTER BUTTON
// ============================================================================

interface FilterButtonProps {
  icon?: ReactNode;
  label: string;
  isActive?: boolean;
  onClear?: (e: React.MouseEvent) => void;
  children?: ReactNode;
  popoverWidth?: string;
  popoverAlign?: "start" | "center" | "end";
  className?: string;
}

/**
 * Filter button with popover content.
 * Shows active state with secondary variant and optional clear button.
 *
 * @example
 * <FilterButton
 *   icon={<CalendarDays className="h-4 w-4" />}
 *   label={hasDateFilter ? formatDateRange() : "Date"}
 *   isActive={hasDateFilter}
 *   onClear={clearDateFilter}
 * >
 *   <DateFilterContent ... />
 * </FilterButton>
 */
export function FilterButton({
  icon,
  label,
  isActive = false,
  onClear,
  children,
  popoverWidth = "w-auto",
  popoverAlign = "start",
  className,
}: FilterButtonProps) {
  const [open, setOpen] = useState(false);

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClear?.(e);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={isActive ? "secondary" : "outline"}
          size="sm"
          className={cn("h-9 gap-2", className)}
        >
          {icon}
          <span>{label}</span>
          {isActive && onClear && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              onKeyDown={(e) =>
                e.key === "Enter" && handleClear(e as unknown as React.MouseEvent)
              }
              className="ml-1 hover:bg-muted rounded p-0.5 -mr-1 cursor-pointer"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("p-2", popoverWidth)} align={popoverAlign}>
        {children}
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// FILTER OPTION
// ============================================================================

interface FilterOptionProps {
  label: string;
  isSelected?: boolean;
  onClick: () => void;
  icon?: ReactNode;
  className?: string;
}

/**
 * Single filter option button within a filter popover.
 */
export function FilterOption({
  label,
  isSelected = false,
  onClick,
  icon,
  className,
}: FilterOptionProps) {
  return (
    <Button
      variant={isSelected ? "secondary" : "ghost"}
      size="sm"
      className={cn("w-full justify-start h-8", className)}
      onClick={onClick}
    >
      {icon && <span className="mr-2">{icon}</span>}
      {label}
    </Button>
  );
}

// ============================================================================
// ACTIVE FILTER BADGE
// ============================================================================

interface ActiveFilterBadgeProps {
  label: string;
  onClear: () => void;
  icon?: ReactNode;
  variant?: "default" | "secondary" | "destructive" | "outline";
  className?: string;
}

/**
 * Badge showing an active filter with remove button.
 */
export function ActiveFilterBadge({
  label,
  onClear,
  icon,
  variant = "secondary",
  className,
}: ActiveFilterBadgeProps) {
  return (
    <Badge variant={variant} className={cn("gap-1 h-8", className)}>
      {icon}
      {label}
      <X className="h-3 w-3 cursor-pointer" onClick={onClear} />
    </Badge>
  );
}

// ============================================================================
// FILTER TOOLBAR CONTAINER
// ============================================================================

interface FilterToolbarProps {
  children: ReactNode;
  className?: string;
}

/**
 * Container for toolbar with filters.
 * Provides consistent spacing and border styling.
 */
export function FilterToolbar({ children, className }: FilterToolbarProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-4 py-2 border-b bg-background flex-wrap",
        className
      )}
    >
      {children}
    </div>
  );
}

// ============================================================================
// FILTER SEPARATOR
// ============================================================================

/**
 * Visual separator between filter groups.
 */
export function FilterSeparator() {
  return <div className="h-4 w-px bg-border mx-1" />;
}

// ============================================================================
// FILTER OPTIONS GROUP
// ============================================================================

interface FilterOptionsGroupProps {
  children: ReactNode;
  className?: string;
}

/**
 * Group of filter options within a popover.
 */
export function FilterOptionsGroup({
  children,
  className,
}: FilterOptionsGroupProps) {
  return <div className={cn("flex flex-col gap-1", className)}>{children}</div>;
}

// ============================================================================
// FILTER GROUP DIVIDER
// ============================================================================

/**
 * Divider between groups of filter options.
 */
export function FilterGroupDivider() {
  return <div className="h-px bg-border my-1" />;
}

// ============================================================================
// CLEAR FILTERS BUTTON
// ============================================================================

interface ClearFiltersButtonProps {
  onClick: () => void;
  className?: string;
}

/**
 * Button to clear all active filters.
 */
export function ClearFiltersButton({
  onClick,
  className,
}: ClearFiltersButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={className}
    >
      Clear all
    </Button>
  );
}
