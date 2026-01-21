import { Timestamp } from "firebase/firestore";

/**
 * Onboarding step identifiers
 */
export type OnboardingStep =
  | "set_identity"
  | "add_bank_account"
  | "import_transactions"
  | "assign_partner"
  | "attach_file";

/**
 * Onboarding state persisted in Firestore
 * Location: /users/{userId}/settings/onboarding
 */
export interface OnboardingState {
  /** Whether onboarding has been completed */
  isComplete: boolean;

  /** Current step the user is on */
  currentStep: OnboardingStep;

  /** Completed steps with timestamps */
  completedSteps: {
    [K in OnboardingStep]?: {
      completedAt: Timestamp;
      /** ID of the entity that triggered completion (for analytics) */
      entityId?: string;
    };
  };

  /** When onboarding was started */
  startedAt: Timestamp;

  /** When onboarding was completed (null if not complete) */
  completedAt: Timestamp | null;

  /** Whether user has seen the completion celebration */
  hasSeenCompletion: boolean;
}

/**
 * Configuration for each onboarding step
 */
export interface OnboardingStepConfig {
  id: OnboardingStep;
  title: string;
  description: string;
  /** Route to navigate to for this step */
  route: string;
  /** CSS selector for highlight target */
  highlightTarget: string;
  /** Icon name (lucide) */
  icon: string;
}

/**
 * All onboarding steps in order
 */
export const ONBOARDING_STEPS: OnboardingStepConfig[] = [
  {
    id: "set_identity",
    title: "Tell Us Who You Are",
    description: "Set up your name and company for invoice matching",
    route: "/settings/identity",
    highlightTarget: '[data-onboarding="identity-form"]',
    icon: "User",
  },
  {
    id: "add_bank_account",
    title: "Add a Bank Account",
    description: "Connect or manually add your first bank account",
    route: "/sources",
    highlightTarget: '[data-onboarding="add-account"], [data-onboarding="connect-bank"]',
    icon: "Building2",
  },
  {
    id: "import_transactions",
    title: "Import Transactions",
    description: "Import transactions from your bank CSV or connect via API",
    route: "/sources",
    highlightTarget: '[data-onboarding="import-transactions"]',
    icon: "Upload",
  },
  {
    id: "assign_partner",
    title: "Assign a Partner",
    description: "Link a transaction to a vendor or customer",
    route: "/transactions",
    highlightTarget: '[data-onboarding="partner-section"]',
    icon: "Users",
  },
  {
    id: "attach_file",
    title: "Attach Receipt or Mark Category",
    description: "Connect a file to a transaction or mark as no receipt needed",
    route: "/transactions",
    highlightTarget: '[data-onboarding="files-section"]',
    icon: "FileCheck",
  },
];

/**
 * Get step index (0-based) from step ID
 */
export function getStepIndex(step: OnboardingStep): number {
  return ONBOARDING_STEPS.findIndex((s) => s.id === step);
}

/**
 * Get next step after the given step, or null if last step
 */
export function getNextStep(step: OnboardingStep): OnboardingStep | null {
  const index = getStepIndex(step);
  const nextConfig = ONBOARDING_STEPS[index + 1];
  return nextConfig?.id ?? null;
}
