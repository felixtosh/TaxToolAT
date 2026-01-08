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
import { connectGmailAccount, GmailOAuthResult } from "@/lib/firebase/auth-gmail";

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
  refresh: (integrationId: string) => Promise<void>;
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

  // Connect Gmail account
  const connectGmail = useCallback(async () => {
    try {
      setError(null);

      // Initiate OAuth flow
      const result: GmailOAuthResult = await connectGmailAccount();

      // Send to API to store integration
      const response = await fetch("/api/gmail/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: result.accessToken,
          email: result.email,
          displayName: result.displayName,
          googleUserId: result.googleUserId,
          expiresAt: result.expiresAt.toISOString(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save integration");
      }
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
    async (integrationId: string) => {
      // Find the integration to get the email
      const integration = integrations.find((i) => i.id === integrationId);
      if (!integration) {
        throw new Error("Integration not found");
      }

      // Re-run OAuth flow (will update existing integration)
      await connectGmail();
    },
    [integrations, connectGmail]
  );

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
    hasGmailIntegration,
  };
}
