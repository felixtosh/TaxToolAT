"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import {
  InboundEmailAddress,
  InboundEmailLog,
} from "@/types/email-inbound";
import { useAuth } from "@/components/auth";
import {
  createInboundEmailAddress,
  updateInboundEmailAddress,
  regenerateInboundEmailAddress,
  deleteInboundEmailAddress,
} from "@/lib/operations";

const ADDRESSES_COLLECTION = "inboundEmailAddresses";
const LOGS_COLLECTION = "inboundEmailLogs";

export interface UseEmailInboundResult {
  /** List of inbound email addresses */
  addresses: InboundEmailAddress[];
  /** Loading state */
  loading: boolean;
  /** Error message if any */
  error: string | null;
  /** Update an inbound email address */
  updateAddress: (
    addressId: string,
    updates: {
      displayName?: string;
      allowedDomains?: string[];
      dailyLimit?: number;
      isActive?: boolean;
    }
  ) => Promise<void>;
  /** Regenerate email address (creates new, deactivates old) */
  regenerateAddress: (addressId: string) => Promise<{ id: string; email: string }>;
  /** Delete (deactivate) an inbound email address */
  deleteAddress: (addressId: string) => Promise<void>;
  /** Pause an inbound email address */
  pauseAddress: (addressId: string) => Promise<void>;
  /** Resume an inbound email address */
  resumeAddress: (addressId: string) => Promise<void>;
  /** Check if user has any inbound address configured */
  hasInboundAddress: boolean;
  /** Get the primary (first active) address */
  primaryAddress: InboundEmailAddress | null;
}

export function useEmailInbound(): UseEmailInboundResult {
  const { userId } = useAuth();
  const [addresses, setAddresses] = useState<InboundEmailAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const creatingRef = useRef(false);

  // Get operations context
  const ctx = useMemo(() => {
    if (!userId) return null;
    return { db, userId };
  }, [userId]);

  // Subscribe to inbound addresses and auto-create if none exist
  useEffect(() => {
    if (!userId || !ctx) {
      setAddresses([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, ADDRESSES_COLLECTION),
      where("userId", "==", userId),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const items = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as InboundEmailAddress[];

        setAddresses(items);
        setLoading(false);
        setError(null);

        // Auto-create address if none exist
        if (items.length === 0 && !creatingRef.current) {
          creatingRef.current = true;
          try {
            console.log("[useEmailInbound] Auto-creating inbound email address");
            await createInboundEmailAddress(ctx);
          } catch (err) {
            console.error("[useEmailInbound] Failed to auto-create address:", err);
            setError(err instanceof Error ? err.message : "Failed to create address");
          } finally {
            creatingRef.current = false;
          }
        }
      },
      (err) => {
        console.error("Error listening to inbound addresses:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId, ctx]);

  // Update an inbound email address
  const updateAddress = useCallback(
    async (
      addressId: string,
      updates: {
        displayName?: string;
        allowedDomains?: string[];
        dailyLimit?: number;
        isActive?: boolean;
      }
    ) => {
      if (!ctx) throw new Error("Not authenticated");
      try {
        setError(null);
        await updateInboundEmailAddress(ctx, addressId, updates);
      } catch (err) {
        console.error("Failed to update inbound address:", err);
        const message = err instanceof Error ? err.message : "Failed to update address";
        setError(message);
        throw err;
      }
    },
    [ctx]
  );

  // Regenerate email address
  const regenerateAddress = useCallback(
    async (addressId: string) => {
      if (!ctx) throw new Error("Not authenticated");
      try {
        setError(null);
        return await regenerateInboundEmailAddress(ctx, addressId);
      } catch (err) {
        console.error("Failed to regenerate inbound address:", err);
        const message = err instanceof Error ? err.message : "Failed to regenerate address";
        setError(message);
        throw err;
      }
    },
    [ctx]
  );

  // Delete (deactivate) an inbound email address
  const deleteAddress = useCallback(
    async (addressId: string) => {
      if (!ctx) throw new Error("Not authenticated");
      try {
        setError(null);
        await deleteInboundEmailAddress(ctx, addressId);
      } catch (err) {
        console.error("Failed to delete inbound address:", err);
        const message = err instanceof Error ? err.message : "Failed to delete address";
        setError(message);
        throw err;
      }
    },
    [ctx]
  );

  // Pause an inbound email address
  const pauseAddress = useCallback(
    async (addressId: string) => {
      await updateAddress(addressId, { isActive: false });
    },
    [updateAddress]
  );

  // Resume an inbound email address
  const resumeAddress = useCallback(
    async (addressId: string) => {
      await updateAddress(addressId, { isActive: true });
    },
    [updateAddress]
  );

  // Check if user has any active inbound address
  const hasInboundAddress = useMemo(
    () => addresses.some((a) => a.isActive),
    [addresses]
  );

  // Get the primary (first active) address, or first address if none active
  const primaryAddress = useMemo(
    () => addresses.find((a) => a.isActive) || addresses[0] || null,
    [addresses]
  );

  return {
    addresses,
    loading,
    error,
    updateAddress,
    regenerateAddress,
    deleteAddress,
    pauseAddress,
    resumeAddress,
    hasInboundAddress,
    primaryAddress,
  };
}

/**
 * Hook to fetch logs for an inbound email address
 */
export interface UseInboundEmailLogsResult {
  logs: InboundEmailLog[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useInboundEmailLogs(addressId: string | null): UseInboundEmailLogsResult {
  const { userId } = useAuth();
  const [logs, setLogs] = useState<InboundEmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    if (!addressId || !userId) {
      setLogs([]);
      setLoading(false);
      return;
    }

    // Subscribe to logs for this address
    const q = query(
      collection(db, LOGS_COLLECTION),
      where("userId", "==", userId),
      where("inboundAddressId", "==", addressId),
      orderBy("receivedAt", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as InboundEmailLog[];
        setLogs(items);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error("Error listening to inbound email logs:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [addressId, userId, refreshTrigger]);

  const refresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  return {
    logs,
    loading,
    error,
    refresh,
  };
}
