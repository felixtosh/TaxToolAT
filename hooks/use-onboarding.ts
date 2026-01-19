"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import {
  OnboardingState,
  OnboardingStep,
  OnboardingStepConfig,
  ONBOARDING_STEPS,
} from "@/types/onboarding";
import {
  OperationsContext,
  initializeOnboarding,
  completeOnboardingStep,
  markOnboardingCompletionSeen,
  calculateProgress,
} from "@/lib/operations";
import { useAuth } from "@/components/auth";
import { useSources } from "./use-sources";
import { useTransactions } from "./use-transactions";

/**
 * Hook for managing onboarding state and auto-detecting step completion
 */
export function useOnboarding() {
  const { userId } = useAuth();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Dependencies for auto-detection
  const { sources, loading: sourcesLoading } = useSources();
  const { transactions, loading: transactionsLoading } = useTransactions();

  // Track if we've done initial check to avoid duplicate calls
  const hasCheckedInitial = useRef(false);

  const ctx: OperationsContext = useMemo(
    () => ({
      db,
      userId: userId ?? "",
    }),
    [userId]
  );

  // Real-time listener for onboarding state
  useEffect(() => {
    if (!userId) {
      setState(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    hasCheckedInitial.current = false; // Reset on userId change

    const docRef = doc(db, "users", userId, "settings", "onboarding");

    const unsubscribe = onSnapshot(
      docRef,
      async (snapshot) => {
        if (snapshot.exists()) {
          setState(snapshot.data() as OnboardingState);
        } else {
          // Initialize onboarding for new users
          try {
            const newState = await initializeOnboarding(ctx);
            setState(newState);
          } catch (err) {
            console.error("Error initializing onboarding:", err);
            setError(err as Error);
          }
        }
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching onboarding state:", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId, ctx]);

  // Auto-detect and complete steps based on existing data
  useEffect(() => {
    // Wait until everything is loaded
    if (
      !state ||
      state.isComplete ||
      loading ||
      sourcesLoading ||
      transactionsLoading ||
      !userId
    ) {
      return;
    }

    // Check each step in order and complete if conditions are met
    const checkAndCompleteSteps = async () => {
      // Step 1: Add bank account
      if (
        !state.completedSteps.add_bank_account &&
        sources.length > 0
      ) {
        await completeOnboardingStep(ctx, "add_bank_account", sources[0]?.id);
        return; // State will update, effect will re-run
      }

      // Step 2: Import transactions (only check if step 1 is done)
      if (
        state.completedSteps.add_bank_account &&
        !state.completedSteps.import_transactions &&
        transactions.length > 0
      ) {
        await completeOnboardingStep(ctx, "import_transactions");
        return;
      }

      // Step 3: Assign partner (only check if step 2 is done)
      if (
        state.completedSteps.import_transactions &&
        !state.completedSteps.assign_partner
      ) {
        const transactionWithPartner = transactions.find((t) => t.partnerId);
        if (transactionWithPartner) {
          await completeOnboardingStep(ctx, "assign_partner", transactionWithPartner.id);
          return;
        }
      }

      // Step 4: Attach file or no-receipt category (only check if step 3 is done)
      if (
        state.completedSteps.assign_partner &&
        !state.completedSteps.attach_file
      ) {
        const transactionWithFileOrCategory = transactions.find(
          (t) =>
            (t.fileIds && t.fileIds.length > 0) ||
            t.noReceiptCategoryId
        );
        if (transactionWithFileOrCategory) {
          await completeOnboardingStep(ctx, "attach_file", transactionWithFileOrCategory.id);
          return;
        }
      }
    };

    checkAndCompleteSteps();
  }, [
    state,
    sources,
    transactions,
    loading,
    sourcesLoading,
    transactionsLoading,
    userId,
    ctx,
  ]);

  // Get current step config
  const currentStepConfig = useMemo((): OnboardingStepConfig | null => {
    if (!state) return null;
    return ONBOARDING_STEPS.find((s) => s.id === state.currentStep) || null;
  }, [state]);

  // Calculate progress
  const progress = useMemo(() => calculateProgress(state), [state]);

  // Check if a step is completed
  const isStepCompleted = useCallback(
    (step: OnboardingStep): boolean => {
      return !!state?.completedSteps[step];
    },
    [state]
  );

  // Mark completion seen
  const dismissCompletion = useCallback(async () => {
    try {
      await markOnboardingCompletionSeen(ctx);
    } catch (err) {
      console.error("Error dismissing completion:", err);
    }
  }, [ctx]);

  return {
    // State
    state,
    loading: loading || sourcesLoading || transactionsLoading,
    error,

    // Derived state
    isOnboarding: state ? !state.isComplete : false,
    isComplete: state?.isComplete ?? false,
    showCompletion: state?.isComplete && !state.hasSeenCompletion,
    currentStep: state?.currentStep ?? null,
    currentStepConfig,

    // Step info
    steps: ONBOARDING_STEPS,
    isStepCompleted,
    progress,

    // Actions
    dismissCompletion,
  };
}
