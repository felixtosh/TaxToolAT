"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { EmailIntegration } from "@/types/email-integration";

const MOCK_USER_ID = "dev-user-123";
const INTEGRATIONS_COLLECTION = "emailIntegrations";

export interface UseEmailIntegrationsResult {
  /** List of connected email integrations */
  integrations: EmailIntegration[];
  /** Loading state */
  loading: boolean;
  /** Error message if any */
  error: string | null;
  /** Connect a new Gmail account */
  connectGmail: () => Promise<void>;
  /** Disconnect an integration */
  disconnect: (integrationId: string) => Promise<void>;
  /** Refresh an integration (reconnect OAuth) */
  refresh: (integrationId: string, returnTo?: string) => Promise<void>;
  /** Pause sync for an integration */
  pauseSync: (integrationId: string) => Promise<void>;
  /** Resume sync for an integration */
  resumeSync: (integrationId: string) => Promise<void>;
  /** Check if any Gmail integration is connected */
  hasGmailIntegration: boolean;
}

export function useEmailIntegrations(): UseEmailIntegrationsResult {
  const [integrations, setIntegrations] = useState<EmailIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to integrations
  useEffect(() => {
    const q = query(
      collection(db, INTEGRATIONS_COLLECTION),
      where("userId", "==", MOCK_USER_ID),
      where("isActive", "==", true),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as EmailIntegration[];
        setIntegrations(items);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error("Error listening to integrations:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Connect Gmail account - redirects to OAuth flow
  const connectGmail = useCallback(async () => {
    try {
      setError(null);
      // Redirect to OAuth authorization endpoint
      // The callback will handle token exchange and redirect back to /integrations
      window.location.href = "/api/gmail/authorize";
    } catch (err) {
      console.error("Failed to connect Gmail:", err);
      const message = err instanceof Error ? err.message : "Failed to connect Gmail";
      setError(message);
      throw err;
    }
  }, []);

  // Disconnect integration
  const disconnect = useCallback(async (integrationId: string) => {
    try {
      setError(null);

      const response = await fetch(
        `/api/gmail/disconnect?integrationId=${encodeURIComponent(integrationId)}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to disconnect");
      }
    } catch (err) {
      console.error("Failed to disconnect:", err);
      const message = err instanceof Error ? err.message : "Failed to disconnect";
      setError(message);
      throw err;
    }
  }, []);

  // Refresh integration (reconnect OAuth)
  const refresh = useCallback(
    async (integrationId: string, returnTo?: string) => {
      // Find the integration to get the email
      const integration = integrations.find((i) => i.id === integrationId);
      if (!integration) {
        throw new Error("Integration not found");
      }

      const returnToParam = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "";
      // Redirect to OAuth flow - callback will update existing integration
      window.location.href = `/api/gmail/authorize${returnToParam}`;
    },
    [integrations]
  );

  // Pause sync for an integration
  const pauseSync = useCallback(async (integrationId: string) => {
    try {
      setError(null);

      const response = await fetch("/api/gmail/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integrationId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to pause sync");
      }
    } catch (err) {
      console.error("Failed to pause sync:", err);
      const message = err instanceof Error ? err.message : "Failed to pause sync";
      setError(message);
      throw err;
    }
  }, []);

  // Resume sync for an integration
  const resumeSync = useCallback(async (integrationId: string) => {
    try {
      setError(null);

      const response = await fetch("/api/gmail/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integrationId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to resume sync");
      }
    } catch (err) {
      console.error("Failed to resume sync:", err);
      const message = err instanceof Error ? err.message : "Failed to resume sync";
      setError(message);
      throw err;
    }
  }, []);

  // Check if any Gmail integration exists
  const hasGmailIntegration = useMemo(
    () => integrations.some((i) => i.provider === "gmail"),
    [integrations]
  );

  return {
    integrations,
    loading,
    error,
    connectGmail,
    disconnect,
    refresh,
    pauseSync,
    resumeSync,
    hasGmailIntegration,
  };
}
