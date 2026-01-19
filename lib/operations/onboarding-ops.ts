import { doc, getDoc, setDoc, updateDoc, Timestamp } from "firebase/firestore";
import { OperationsContext } from "./types";
import {
  OnboardingState,
  OnboardingStep,
  ONBOARDING_STEPS,
  getStepIndex,
  getNextStep,
} from "@/types/onboarding";

const SETTINGS_COLLECTION = "settings";
const ONBOARDING_DOC = "onboarding";

/**
 * Get onboarding state for the current user
 */
export async function getOnboardingState(
  ctx: OperationsContext
): Promise<OnboardingState | null> {
  const docRef = doc(
    ctx.db,
    "users",
    ctx.userId,
    SETTINGS_COLLECTION,
    ONBOARDING_DOC
  );
  const snapshot = await getDoc(docRef);

  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.data() as OnboardingState;
}

/**
 * Initialize onboarding for a new user
 */
export async function initializeOnboarding(
  ctx: OperationsContext
): Promise<OnboardingState> {
  const now = Timestamp.now();

  const initialState: OnboardingState = {
    isComplete: false,
    currentStep: "add_bank_account",
    completedSteps: {},
    startedAt: now,
    completedAt: null,
    hasSeenCompletion: false,
  };

  const docRef = doc(
    ctx.db,
    "users",
    ctx.userId,
    SETTINGS_COLLECTION,
    ONBOARDING_DOC
  );
  await setDoc(docRef, initialState);

  return initialState;
}

/**
 * Mark a step as complete and advance to next step
 */
export async function completeOnboardingStep(
  ctx: OperationsContext,
  step: OnboardingStep,
  entityId?: string
): Promise<void> {
  const docRef = doc(
    ctx.db,
    "users",
    ctx.userId,
    SETTINGS_COLLECTION,
    ONBOARDING_DOC
  );
  const now = Timestamp.now();

  // Get current state
  const current = await getOnboardingState(ctx);
  if (!current) return;

  // Don't re-complete steps
  if (current.completedSteps[step]) return;

  // Find next step
  const nextStep = getNextStep(step);
  const isLastStep = !nextStep;

  // Build update object
  const updates: Record<string, unknown> = {
    [`completedSteps.${step}`]: {
      completedAt: now,
      ...(entityId && { entityId }),
    },
  };

  if (isLastStep) {
    updates.isComplete = true;
    updates.completedAt = now;
  } else {
    updates.currentStep = nextStep;
  }

  await updateDoc(docRef, updates);
}

/**
 * Mark onboarding completion as seen (dismiss celebration)
 */
export async function markOnboardingCompletionSeen(
  ctx: OperationsContext
): Promise<void> {
  const docRef = doc(
    ctx.db,
    "users",
    ctx.userId,
    SETTINGS_COLLECTION,
    ONBOARDING_DOC
  );
  await updateDoc(docRef, { hasSeenCompletion: true });
}

/**
 * Reset onboarding state (for testing/debugging)
 */
export async function resetOnboarding(ctx: OperationsContext): Promise<void> {
  const docRef = doc(
    ctx.db,
    "users",
    ctx.userId,
    SETTINGS_COLLECTION,
    ONBOARDING_DOC
  );

  // Delete the document to reset
  const { deleteDoc } = await import("firebase/firestore");
  await deleteDoc(docRef);
}

/**
 * Check if user has completed onboarding
 */
export async function isOnboardingComplete(
  ctx: OperationsContext
): Promise<boolean> {
  const state = await getOnboardingState(ctx);
  return state?.isComplete ?? false;
}

/**
 * Get progress information
 */
export function calculateProgress(state: OnboardingState | null): {
  completed: number;
  total: number;
  percentage: number;
} {
  if (!state) {
    return { completed: 0, total: ONBOARDING_STEPS.length, percentage: 0 };
  }

  const completed = Object.keys(state.completedSteps).length;
  return {
    completed,
    total: ONBOARDING_STEPS.length,
    percentage: Math.round((completed / ONBOARDING_STEPS.length) * 100),
  };
}
