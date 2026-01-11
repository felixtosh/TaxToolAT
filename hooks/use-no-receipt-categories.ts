"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { collection, query, orderBy, onSnapshot, where } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import {
  UserNoReceiptCategory,
  NoReceiptCategoryId,
  CategorySuggestion,
} from "@/types/no-receipt-category";
import { Transaction } from "@/types/transaction";
import {
  OperationsContext,
  listUserCategories,
  initializeUserCategories,
  assignCategoryToTransaction,
  removeCategoryFromTransaction,
  assignReceiptLostCategory,
  retriggerUserCategories,
  hasUserCategories,
  updateUserCategory,
  clearManualRemoval,
  triggerCategoryMatchingForAll,
} from "@/lib/operations";
import { CategoryLearnedPattern } from "@/types/no-receipt-category";
// Category suggestions now come from transaction.categorySuggestions (computed on backend)
// No client-side matching functions needed

const CATEGORIES_COLLECTION = "noReceiptCategories";
const MOCK_USER_ID = "dev-user-123";

export function useNoReceiptCategories() {
  const [categories, setCategories] = useState<UserNoReceiptCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [initializing, setInitializing] = useState(false);

  const ctx: OperationsContext = useMemo(
    () => ({
      db,
      userId: MOCK_USER_ID,
    }),
    []
  );

  // Realtime listener for user categories
  useEffect(() => {
    setLoading(true);

    const q = query(
      collection(db, CATEGORIES_COLLECTION),
      where("userId", "==", MOCK_USER_ID),
      where("isActive", "==", true),
      orderBy("name", "asc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as UserNoReceiptCategory[];

        setCategories(data);
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching categories:", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Auto-initialize categories if none exist
  useEffect(() => {
    if (!loading && categories.length === 0 && !initializing) {
      setInitializing(true);
      initializeUserCategories(ctx)
        .then(() => {
          console.log("[Categories] Auto-initialized user categories");
        })
        .catch((err) => {
          console.error("[Categories] Failed to auto-initialize:", err);
        })
        .finally(() => {
          setInitializing(false);
        });
    }
  }, [loading, categories.length, ctx, initializing]);

  /**
   * Initialize categories from templates (manual trigger)
   */
  const initializeCategories = useCallback(async () => {
    setInitializing(true);
    try {
      const result = await initializeUserCategories(ctx);
      return result;
    } finally {
      setInitializing(false);
    }
  }, [ctx]);

  /**
   * Assign a category to a transaction
   */
  const assignToTransaction = useCallback(
    async (
      transactionId: string,
      categoryId: string,
      matchedBy: "manual" | "suggestion" = "manual",
      confidence?: number
    ): Promise<void> => {
      await assignCategoryToTransaction(
        ctx,
        transactionId,
        categoryId,
        matchedBy,
        confidence
      );
    },
    [ctx]
  );

  /**
   * Remove category from a transaction
   */
  const removeFromTransaction = useCallback(
    async (transactionId: string): Promise<void> => {
      await removeCategoryFromTransaction(ctx, transactionId);
    },
    [ctx]
  );

  /**
   * Assign "Receipt Lost" category with required documentation
   */
  const assignReceiptLost = useCallback(
    async (
      transactionId: string,
      reason: string,
      description: string
    ): Promise<void> => {
      await assignReceiptLostCategory(ctx, transactionId, reason, description);
    },
    [ctx]
  );

  /**
   * Get a category by its ID
   */
  const getCategoryById = useCallback(
    (categoryId: string): UserNoReceiptCategory | undefined => {
      return categories.find((c) => c.id === categoryId);
    },
    [categories]
  );

  /**
   * Get a category by template ID
   */
  const getCategoryByTemplateId = useCallback(
    (templateId: NoReceiptCategoryId): UserNoReceiptCategory | undefined => {
      return categories.find((c) => c.templateId === templateId);
    },
    [categories]
  );

  /**
   * Get category suggestions for a transaction (from stored backend results)
   */
  const getSuggestionsForTransaction = useCallback(
    (transaction: Transaction): CategorySuggestion[] => {
      // Return stored suggestions from transaction (computed by backend)
      return transaction.categorySuggestions || [];
    },
    []
  );

  /**
   * Retrigger categories (admin function)
   */
  const retrigger = useCallback(async () => {
    return retriggerUserCategories(ctx);
  }, [ctx]);

  /**
   * Update a category's fields (patterns, partners)
   */
  const updateCategory = useCallback(
    async (
      categoryId: string,
      updates: Partial<Pick<UserNoReceiptCategory, "learnedPatterns" | "matchedPartnerIds">>
    ): Promise<void> => {
      await updateUserCategory(ctx, categoryId, updates);
    },
    [ctx]
  );

  /**
   * Clear a manual removal entry from a category.
   * Allows the transaction to be auto-matched again.
   */
  const clearRemoval = useCallback(
    async (categoryId: string, transactionId: string): Promise<void> => {
      await clearManualRemoval(ctx, categoryId, transactionId);
    },
    [ctx]
  );

  /**
   * Trigger category matching for all unmatched transactions.
   * Populates categorySuggestions on transactions via Cloud Function.
   */
  const matchAllTransactions = useCallback(async () => {
    return triggerCategoryMatchingForAll();
  }, []);

  return {
    categories,
    loading: loading || initializing,
    error,
    initializeCategories,
    assignToTransaction,
    removeFromTransaction,
    assignReceiptLost,
    getCategoryById,
    getCategoryByTemplateId,
    getSuggestionsForTransaction,
    retrigger,
    updateCategory,
    clearRemoval,
    matchAllTransactions,
  };
}

/**
 * Hook to get category suggestions for a specific transaction.
 * Returns stored suggestions from backend (no client-side computation).
 */
export function useCategorySuggestions(
  transaction: Transaction | null,
  _categories: UserNoReceiptCategory[]
): CategorySuggestion[] {
  return useMemo(() => {
    if (!transaction) {
      return [];
    }

    // Suggestions are pre-computed by backend and stored on transaction
    return transaction.categorySuggestions || [];
  }, [transaction]);
}
