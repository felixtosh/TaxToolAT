"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { collection, query, orderBy, onSnapshot, where } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { UserPartner, PartnerFormData } from "@/types/partner";
import {
  OperationsContext,
  createUserPartner,
  updateUserPartner,
  deleteUserPartner,
  assignPartnerToTransaction,
  removePartnerFromTransaction,
} from "@/lib/operations";
import { useAuth } from "@/components/auth";

const PARTNERS_COLLECTION = "partners";

export function usePartners() {
  const { userId } = useAuth();
  const [partners, setPartners] = useState<UserPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const ctx: OperationsContext = useMemo(
    () => ({
      db,
      userId: userId ?? "",
    }),
    [userId]
  );

  // Realtime listener for user partners
  useEffect(() => {
    if (!userId) {
      setPartners([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const q = query(
      collection(db, PARTNERS_COLLECTION),
      where("userId", "==", userId),
      where("isActive", "==", true),
      orderBy("name", "asc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as UserPartner[];

        setPartners(data);
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching partners:", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  const createPartner = useCallback(
    async (data: PartnerFormData): Promise<string> => {
      return createUserPartner(ctx, data);
    },
    [ctx]
  );

  const updatePartner = useCallback(
    async (partnerId: string, data: Partial<PartnerFormData>): Promise<void> => {
      await updateUserPartner(ctx, partnerId, data);
    },
    [ctx]
  );

  const deletePartner = useCallback(
    async (partnerId: string): Promise<void> => {
      await deleteUserPartner(ctx, partnerId);
    },
    [ctx]
  );

  const getPartnerById = useCallback(
    (partnerId: string): UserPartner | undefined => {
      return partners.find((p) => p.id === partnerId);
    },
    [partners]
  );

  const assignToTransaction = useCallback(
    async (
      transactionId: string,
      partnerId: string,
      partnerType: "global" | "user",
      matchedBy: "manual" | "suggestion",
      confidence?: number
    ): Promise<void> => {
      await assignPartnerToTransaction(ctx, transactionId, partnerId, partnerType, matchedBy, confidence);
    },
    [ctx]
  );

  const removeFromTransaction = useCallback(
    async (transactionId: string): Promise<void> => {
      await removePartnerFromTransaction(ctx, transactionId);
    },
    [ctx]
  );

  return {
    partners,
    loading,
    error,
    createPartner,
    updatePartner,
    deletePartner,
    getPartnerById,
    assignToTransaction,
    removeFromTransaction,
  };
}
