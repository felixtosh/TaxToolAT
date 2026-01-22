"use client";

import { useState, useEffect, useCallback, startTransition } from "react";
import { collection, query, orderBy, onSnapshot, where } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { Transaction } from "@/types/transaction";
import { callFunction } from "@/lib/firebase/callable";
import { useAuth } from "@/components/auth";

const TRANSACTIONS_COLLECTION = "transactions";

export function useTransactions() {
  const { userId } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Realtime listener for transactions - this stays in the hook
  useEffect(() => {
    if (!userId) {
      setTransactions([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const q = query(
      collection(db, TRANSACTIONS_COLLECTION),
      where("userId", "==", userId),
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
        // IMPORTANT: Both state updates must be inside startTransition to prevent
        // flicker where loading=false but transactions is still empty
        startTransition(() => {
          setTransactions(data);
          setLoading(false);
        });
      },
      (err) => {
        console.error("Error fetching transactions:", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  // Mutations call Cloud Functions
  const updateTransaction = useCallback(
    async (transactionId: string, data: Partial<Transaction>) => {
      await callFunction("updateTransaction", { id: transactionId, data });
    },
    []
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
