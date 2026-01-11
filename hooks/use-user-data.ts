"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { UserData, UserDataFormData } from "@/types/user-data";
import {
  OperationsContext,
  getUserData,
  saveUserData,
} from "@/lib/operations";

const MOCK_USER_ID = "dev-user-123";

/**
 * Hook for managing user data (name, company, aliases)
 * Used for extraction prompts and invoice direction detection
 */
export function useUserData() {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const ctx: OperationsContext = useMemo(
    () => ({
      db,
      userId: MOCK_USER_ID,
    }),
    []
  );

  // Realtime listener for user data
  useEffect(() => {
    setLoading(true);

    const docRef = doc(db, "users", MOCK_USER_ID, "settings", "userData");

    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setUserData(snapshot.data() as UserData);
        } else {
          setUserData(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching user data:", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  /**
   * Save user data
   */
  const save = useCallback(
    async (data: UserDataFormData): Promise<void> => {
      setSaving(true);
      setError(null);
      try {
        await saveUserData(ctx, data);
      } catch (err) {
        setError(err as Error);
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [ctx]
  );

  /**
   * Check if user data is configured
   */
  const isConfigured = useMemo(() => {
    return !!(userData?.name || userData?.companyName);
  }, [userData]);

  /**
   * Check if a partner is marked as "this is my company"
   */
  const isPartnerMarkedAsMe = useCallback(
    (partnerId: string): boolean => {
      return userData?.markedAsMe?.includes(partnerId) ?? false;
    },
    [userData?.markedAsMe]
  );

  /**
   * Get list of partner IDs marked as "me"
   */
  const markedAsMe = useMemo(() => {
    return userData?.markedAsMe ?? [];
  }, [userData?.markedAsMe]);

  return {
    userData,
    loading,
    saving,
    error,
    save,
    isConfigured,
    isPartnerMarkedAsMe,
    markedAsMe,
  };
}
