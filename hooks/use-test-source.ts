"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { db } from "@/lib/firebase/config";
import {
  OperationsContext,
  isTestDataActive,
  activateTestData,
  deactivateTestData,
} from "@/lib/operations";
import { useAuth } from "@/components/auth";

export function useTestSource() {
  const { userId } = useAuth();
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Create operations context
  const ctx: OperationsContext = useMemo(
    () => ({
      db,
      userId: userId ?? "",
    }),
    [userId]
  );

  // Check if test source exists on mount
  useEffect(() => {
    // Don't check until userId is available
    if (!userId) {
      setIsActive(false);
      setIsLoading(false);
      return;
    }

    const checkTestSource = async () => {
      try {
        const active = await isTestDataActive(ctx);
        setIsActive(active);
      } catch (err) {
        console.error("Error checking test source:", err);
        setError(err as Error);
      } finally {
        setIsLoading(false);
      }
    };

    checkTestSource();
  }, [ctx, userId]);

  const activate = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      await activateTestData(ctx);
      setIsActive(true);
    } catch (err) {
      console.error("Error activating test source:", err);
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [ctx]);

  const deactivate = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      await deactivateTestData(ctx);
      setIsActive(false);
    } catch (err) {
      console.error("Error deactivating test source:", err);
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [ctx]);

  return {
    isActive,
    isLoading,
    error,
    activate,
    deactivate,
  };
}
