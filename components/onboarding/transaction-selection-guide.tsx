"use client";

import { usePathname } from "next/navigation";
import { MousePointerClick } from "lucide-react";
import { useOnboarding } from "@/hooks/use-onboarding";

/**
 * Guide shown on the transactions page when user needs to select a transaction
 * during onboarding steps that require it (assign_partner, attach_file)
 */
export function TransactionSelectionGuide() {
  const pathname = usePathname();
  const { isOnboarding, currentStep } = useOnboarding();

  // Only show on /transactions route
  const isOnTransactionsPage = pathname === "/transactions";

  // Only show for steps that require a transaction to be selected
  const relevantSteps = ["assign_partner", "attach_file"];
  if (!isOnTransactionsPage || !isOnboarding || !currentStep || !relevantSteps.includes(currentStep)) {
    return null;
  }

  const message =
    currentStep === "assign_partner"
      ? "Select a transaction to assign a partner"
      : "Select a transaction to attach a receipt";

  // Use the data-onboarding attribute that matches what the step is looking for
  const dataAttribute =
    currentStep === "assign_partner" ? "partner-section" : "files-section";

  return (
    <div
      data-onboarding={dataAttribute}
      className="fixed right-4 top-1/2 -translate-y-1/2 z-40 bg-card border rounded-lg shadow-lg p-6 max-w-xs"
    >
      <div className="flex flex-col items-center text-center gap-3">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <MousePointerClick className="w-6 h-6 text-primary" />
        </div>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
