"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { httpsCallable } from "firebase/functions";
import { functions, db } from "@/lib/firebase/config";
import { useAuth } from "@/components/auth";
import {
  OperationsContext,
  subscribeMfaSettings,
  getMfaStatus as getMfaStatusOp,
} from "@/lib/operations";
import { MfaSettings, MfaStatusResponse } from "@/types/mfa";

export function useMfa() {
  const { userId, user } = useAuth();
  const [mfaSettings, setMfaSettings] = useState<MfaSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Create operations context
  const ctx: OperationsContext = useMemo(
    () => ({
      db,
      userId: userId ?? "",
    }),
    [userId]
  );

  // Real-time listener for MFA settings
  useEffect(() => {
    if (!userId) {
      setMfaSettings(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    const unsubscribe = subscribeMfaSettings(ctx, (settings) => {
      setMfaSettings(settings);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId, ctx]);

  // Get comprehensive MFA status (includes Firebase Auth MFA state)
  const getMfaStatus = useCallback(async (): Promise<MfaStatusResponse> => {
    const fn = httpsCallable<void, MfaStatusResponse>(functions, "getMfaStatus");
    const result = await fn();
    return result.data;
  }, []);

  // Generate backup codes
  const generateBackupCodes = useCallback(async (): Promise<string[]> => {
    setActionLoading(true);
    setError(null);

    try {
      const fn = httpsCallable<void, { codes: string[]; generatedAt: string }>(
        functions,
        "generateBackupCodes"
      );
      const result = await fn();
      return result.data.codes;
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to generate backup codes");
      setError(error);
      throw error;
    } finally {
      setActionLoading(false);
    }
  }, []);

  // Verify a backup code (used during MFA challenge)
  const verifyBackupCode = useCallback(async (code: string): Promise<boolean> => {
    setActionLoading(true);
    setError(null);

    try {
      const fn = httpsCallable<{ code: string }, { success: boolean }>(
        functions,
        "verifyBackupCode"
      );
      const result = await fn({ code });
      return result.data.success;
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Invalid backup code");
      setError(error);
      throw error;
    } finally {
      setActionLoading(false);
    }
  }, []);

  // Update TOTP status after Firebase MFA enrollment/unenrollment
  const updateTotpStatus = useCallback(
    async (enabled: boolean, factorId?: string): Promise<void> => {
      setActionLoading(true);
      setError(null);

      try {
        const fn = httpsCallable<
          { enabled: boolean; factorId?: string },
          { success: boolean }
        >(functions, "updateTotpStatus");
        await fn({ enabled, factorId });
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Failed to update TOTP status");
        setError(error);
        throw error;
      } finally {
        setActionLoading(false);
      }
    },
    []
  );

  // Computed values
  const isMfaEnabled = useMemo(() => {
    return mfaSettings?.totpEnabled || mfaSettings?.passkeysEnabled || false;
  }, [mfaSettings]);

  const backupCodesRemaining = useMemo(() => {
    return mfaSettings?.backupCodesRemaining ?? 0;
  }, [mfaSettings]);

  const hasBackupCodes = useMemo(() => {
    return mfaSettings?.backupCodesGenerated ?? false;
  }, [mfaSettings]);

  return {
    // State
    mfaSettings,
    loading,
    error,
    actionLoading,

    // Computed
    isMfaEnabled,
    backupCodesRemaining,
    hasBackupCodes,
    totpEnabled: mfaSettings?.totpEnabled ?? false,
    passkeysEnabled: mfaSettings?.passkeysEnabled ?? false,

    // Actions
    getMfaStatus,
    generateBackupCodes,
    verifyBackupCode,
    updateTotpStatus,
  };
}
