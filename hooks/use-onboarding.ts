"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
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
  uncompleteOnboardingStep,
  markOnboardingCompletionSeen,
  calculateProgress,
} from "@/lib/operations";
import { useAuth } from "@/components/auth";
import { useSources } from "./use-sources";
import { useTransactions } from "./use-transactions";
import { useUserData } from "./use-user-data";

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
  const { userData, loading: userDataLoading, isConfigured: hasIdentity } = useUserData();

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
          const nextState = snapshot.data() as OnboardingState;
          console.log("[Onboarding] Snapshot update:", {
            isComplete: nextState.isComplete,
            hasSeenCompletion: nextState.hasSeenCompletion,
            currentStep: nextState.currentStep,
          });
          setState(nextState);
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

  // Auto-detect step completion/uncompletion based on existing data
  useEffect(() => {
    // Wait until everything is loaded
    if (
      !state ||
      loading ||
      sourcesLoading ||
      transactionsLoading ||
      userDataLoading ||
      !userId
    ) {
      return;
    }

    // Check each step and complete/uncomplete based on current conditions
    const syncStepsWithData = async () => {
      // Step 0: Set identity (name/company)
      if (state.completedSteps.set_identity && !hasIdentity) {
        await uncompleteOnboardingStep(ctx, "set_identity");
        return;
      }
      if (!state.completedSteps.set_identity && hasIdentity) {
        await completeOnboardingStep(ctx, "set_identity");
        return;
      }

      // Step 1: Add bank account (only check if step 0 is done)
      const hasSources = sources.length > 0;
      if (!state.completedSteps.set_identity) return;
      if (state.completedSteps.add_bank_account && !hasSources) {
        // Uncomplete if no longer has sources
        await uncompleteOnboardingStep(ctx, "add_bank_account");
        return; // State will update, effect will re-run
      }
      if (!state.completedSteps.add_bank_account && hasSources) {
        // Complete if has sources
        await completeOnboardingStep(ctx, "add_bank_account", sources[0]?.id);
        return;
      }

      // Step 2: Import transactions (only check if step 1 is done)
      const hasTransactions = transactions.length > 0;
      if (state.completedSteps.add_bank_account) {
        if (state.completedSteps.import_transactions && !hasTransactions) {
          await uncompleteOnboardingStep(ctx, "import_transactions");
          return;
        }
        if (!state.completedSteps.import_transactions && hasTransactions) {
          await completeOnboardingStep(ctx, "import_transactions");
          return;
        }
      }

      // Step 3: Assign partner (only check if step 2 is done)
      const transactionWithPartner = transactions.find((t) => t.partnerId);
      if (state.completedSteps.import_transactions) {
        if (state.completedSteps.assign_partner && !transactionWithPartner) {
          await uncompleteOnboardingStep(ctx, "assign_partner");
          return;
        }
        if (!state.completedSteps.assign_partner && transactionWithPartner) {
          await completeOnboardingStep(ctx, "assign_partner", transactionWithPartner.id);
          return;
        }
      }

      // Step 4: Attach file or no-receipt category (only check if step 3 is done)
      const transactionWithFileOrCategory = transactions.find(
        (t) =>
          (t.fileIds && t.fileIds.length > 0) ||
          t.noReceiptCategoryId
      );
      if (state.completedSteps.assign_partner) {
        if (state.completedSteps.attach_file && !transactionWithFileOrCategory) {
          await uncompleteOnboardingStep(ctx, "attach_file");
          return;
        }
        if (!state.completedSteps.attach_file && transactionWithFileOrCategory) {
          await completeOnboardingStep(ctx, "attach_file", transactionWithFileOrCategory.id);
          return;
        }
      }
    };

    syncStepsWithData();
  }, [
    state,
    sources,
    transactions,
    loading,
    sourcesLoading,
    transactionsLoading,
    userDataLoading,
    hasIdentity,
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
      console.log("[Onboarding] Dismissing completion dialog.");
      await markOnboardingCompletionSeen(ctx);
      console.log("[Onboarding] Marked completion as seen.");
      const docRef = doc(db, "users", userId ?? "", "settings", "onboarding");
      const snapshot = await getDoc(docRef);
      console.log("[Onboarding] Readback after dismiss:", snapshot.data());
    } catch (err) {
      console.error("Error dismissing completion:", err);
    }
  }, [ctx, userId]);

  return {
    // State
    state,
    loading: loading || sourcesLoading || transactionsLoading || userDataLoading,
    error,

    // Derived state
    isOnboarding: state ? !state.isComplete : false,
    isComplete: state?.isComplete ?? false,
    showCompletion: state?.isComplete === true && state?.hasSeenCompletion === false,
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
