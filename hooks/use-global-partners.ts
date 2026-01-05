"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { collection, query, orderBy, onSnapshot, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase/config";
import { GlobalPartner, GlobalPartnerFormData, PromotionCandidate } from "@/types/partner";
import {
  OperationsContext,
  createGlobalPartner,
  updateGlobalPartner,
  deleteGlobalPartner,
  listPromotionCandidates,
  approvePromotionCandidate,
  rejectPromotionCandidate,
  getPresetPartnersStatus,
  togglePresetPartners,
} from "@/lib/operations";

const GLOBAL_PARTNERS_COLLECTION = "globalPartners";
const MOCK_USER_ID = "dev-user-123";

/**
 * Hook for managing global partners (admin functionality)
 */
export function useGlobalPartners() {
  const [globalPartners, setGlobalPartners] = useState<GlobalPartner[]>([]);
  const [promotionCandidates, setPromotionCandidates] = useState<PromotionCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [presetPartnersEnabled, setPresetPartnersEnabled] = useState(false);
  const [presetPartnersLoading, setPresetPartnersLoading] = useState(false);

  const ctx: OperationsContext = useMemo(
    () => ({
      db,
      userId: MOCK_USER_ID,
    }),
    []
  );

  // Check preset partners status on mount
  useEffect(() => {
    const checkPresetStatus = async () => {
      try {
        const status = await getPresetPartnersStatus(ctx);
        setPresetPartnersEnabled(status.enabled);
      } catch (err) {
        console.error("Error checking preset partners status:", err);
      }
    };
    checkPresetStatus();
  }, [ctx]);

  // Realtime listener for global partners
  useEffect(() => {
    setLoading(true);

    const q = query(
      collection(db, GLOBAL_PARTNERS_COLLECTION),
      where("isActive", "==", true),
      orderBy("name", "asc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as GlobalPartner[];

        setGlobalPartners(data);
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching global partners:", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Load promotion candidates
  const loadPromotionCandidates = useCallback(async () => {
    try {
      const candidates = await listPromotionCandidates(ctx);
      setPromotionCandidates(candidates);
    } catch (err) {
      console.error("Error loading promotion candidates:", err);
    }
  }, [ctx]);

  useEffect(() => {
    loadPromotionCandidates();
  }, [loadPromotionCandidates]);

  const createPartner = useCallback(
    async (data: GlobalPartnerFormData): Promise<string> => {
      return createGlobalPartner(ctx, data);
    },
    [ctx]
  );

  const updatePartner = useCallback(
    async (partnerId: string, data: Partial<GlobalPartnerFormData>): Promise<void> => {
      await updateGlobalPartner(ctx, partnerId, data);
    },
    [ctx]
  );

  const deletePartner = useCallback(
    async (partnerId: string): Promise<void> => {
      await deleteGlobalPartner(ctx, partnerId);
    },
    [ctx]
  );

  const getPartnerById = useCallback(
    (partnerId: string): GlobalPartner | undefined => {
      return globalPartners.find((p) => p.id === partnerId);
    },
    [globalPartners]
  );

  const approveCandidate = useCallback(
    async (candidateId: string): Promise<string> => {
      const globalPartnerId = await approvePromotionCandidate(ctx, candidateId);
      await loadPromotionCandidates();
      return globalPartnerId;
    },
    [ctx, loadPromotionCandidates]
  );

  const rejectCandidate = useCallback(
    async (candidateId: string): Promise<void> => {
      await rejectPromotionCandidate(ctx, candidateId);
      await loadPromotionCandidates();
    },
    [ctx, loadPromotionCandidates]
  );

  // Generate promotion candidates via Cloud Function
  const generateCandidates = useCallback(async (): Promise<{
    candidatesCreated: number;
    message: string;
  }> => {
    const fn = httpsCallable<void, { candidatesCreated: number; message: string }>(
      functions,
      "generatePromotionCandidates"
    );
    const result = await fn();
    await loadPromotionCandidates();
    return result.data;
  }, [loadPromotionCandidates]);

  // Toggle preset partners on/off
  const togglePreset = useCallback(
    async (enable: boolean): Promise<{ enabled: boolean; count: number }> => {
      setPresetPartnersLoading(true);
      try {
        const result = await togglePresetPartners(ctx, enable);
        setPresetPartnersEnabled(result.enabled);
        return result;
      } finally {
        setPresetPartnersLoading(false);
      }
    },
    [ctx]
  );

  return {
    globalPartners,
    promotionCandidates,
    loading,
    error,
    createPartner,
    updatePartner,
    deletePartner,
    getPartnerById,
    approveCandidate,
    rejectCandidate,
    refreshCandidates: loadPromotionCandidates,
    generateCandidates,
    presetPartnersEnabled,
    presetPartnersLoading,
    togglePresetPartners: togglePreset,
  };
}
