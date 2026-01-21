"use client";

import { forwardRef } from "react";
import { Plus } from "lucide-react";
import { Button, ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ConnectButtonProps extends Omit<ButtonProps, "variant"> {
  /** Whether the connect overlay/dialog is currently open */
  isOpen?: boolean;
  /** Label text (default: "Connect") */
  label?: string;
  /** Show the plus icon (default: true) */
  showIcon?: boolean;
}

/**
 * A standardized button for opening connect overlays.
 * Shows active (pressed) state when the overlay is open.
 *
 * Used in:
 * - TransactionFilesSection (connect file to transaction)
 * - FileConnectionsList (connect transaction to file)
 */
export const ConnectButton = forwardRef<HTMLButtonElement, ConnectButtonProps>(
  ({ isOpen = false, label = "Connect", showIcon = true, className, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        variant={isOpen ? "secondary" : "outline"}
        size="sm"
        className={cn("h-7 px-3", className)}
        aria-pressed={isOpen}
        {...props}
      >
        {showIcon && <Plus className="h-3 w-3 mr-1" />}
        {label}
      </Button>
    );
  }
);

ConnectButton.displayName = "ConnectButton";
