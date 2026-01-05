"use client";

import { useState, useEffect, useCallback, useMemo, startTransition } from "react";
import { collection, query, orderBy, onSnapshot, where } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { Transaction } from "@/types/transaction";
import {
  OperationsContext,
  updateTransaction as updateTransactionOp,
} from "@/lib/operations";

const TRANSACTIONS_COLLECTION = "transactions";
const MOCK_USER_ID = "dev-user-123"; // Mock user for development

export function useTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Create operations context
  const ctx: OperationsContext = useMemo(
    () => ({
      db,
      userId: MOCK_USER_ID,
    }),
    []
  );

  // Realtime listener for transactions - this stays in the hook
  useEffect(() => {
    setLoading(true);

    const q = query(
      collection(db, TRANSACTIONS_COLLECTION),
      where("userId", "==", MOCK_USER_ID),
      orderBy("date", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Transaction[];

        // Use startTransition to mark this as non-urgent, preventing DOM blocking
        startTransition(() => {
          setTransactions(data);
        });
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching transactions:", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Mutations now call the operations layer
  const updateTransaction = useCallback(
    async (transactionId: string, data: Partial<Transaction>) => {
      await updateTransactionOp(ctx, transactionId, data);
    },
    [ctx]
  );

  // NOTE: deleteTransaction is intentionally NOT exposed.
  // Individual transaction deletion is not allowed - transactions must be
  // deleted together with their source to maintain accounting integrity.

  return {
    transactions,
    loading,
    error,
    updateTransaction,
  };
}
