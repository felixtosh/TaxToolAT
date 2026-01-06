"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { onSnapshot, doc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { TransactionSource, GoCardlessConnectorConfig } from "@/types/source";

interface SyncStatus {
  lastSyncAt: Date | null;
  lastSyncError: string | null;
  needsReauth: boolean;
  reauthExpiresAt: Date | null;
  reauthDaysRemaining: number | null;
}

interface UseSyncStatusReturn {
  status: SyncStatus | null;
  isSyncing: boolean;
  syncError: string | null;
  triggerSync: () => Promise<void>;
  isApiSource: boolean;
}

/**
 * Hook to monitor sync status for an API-connected source
 */
export function useSyncStatus(sourceId: string | null): UseSyncStatusReturn {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isApiSource, setIsApiSource] = useState(false);

  // Subscribe to source document for real-time updates
  useEffect(() => {
    if (!sourceId) {
      setStatus(null);
      setIsApiSource(false);
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, "sources", sourceId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setStatus(null);
          setIsApiSource(false);
          return;
        }

        const source = snapshot.data() as TransactionSource;

        if (source.type !== "api" || !source.apiConfig) {
          setIsApiSource(false);
          setStatus(null);
          return;
        }

        setIsApiSource(true);

        if (source.apiConfig.provider !== "gocardless") {
          setStatus(null);
          return;
        }

        const config = source.apiConfig as GoCardlessConnectorConfig;
        const expiresAt = config.agreementExpiresAt?.toDate() || null;
        const now = new Date();
        const daysRemaining = expiresAt
          ? Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
          : null;

        setStatus({
          lastSyncAt: config.lastSyncAt?.toDate() || null,
          lastSyncError: config.lastSyncError || null,
          needsReauth: expiresAt ? expiresAt < now : false,
          reauthExpiresAt: expiresAt,
          reauthDaysRemaining: daysRemaining,
        });
      },
      (error) => {
        console.error("Error watching source:", error);
      }
    );

    return () => unsubscribe();
  }, [sourceId]);

  // Trigger manual sync
  const triggerSync = useCallback(async () => {
    if (!sourceId) return;

    setIsSyncing(true);
    setSyncError(null);

    try {
      const response = await fetch("/api/gocardless/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Sync failed");
      }

      // Success - status will update via onSnapshot
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setIsSyncing(false);
    }
  }, [sourceId]);

  return {
    status,
    isSyncing,
    syncError,
    triggerSync,
    isApiSource,
  };
}

/**
 * Format last sync time for display
 */
export function formatLastSync(date: Date | null): string {
  if (!date) return "Never synced";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString();
}

/**
 * Get sync status color for UI
 */
export function getSyncStatusColor(status: SyncStatus | null): "green" | "yellow" | "red" | "gray" {
  if (!status) return "gray";
  if (status.needsReauth) return "red";
  if (status.lastSyncError) return "yellow";
  if (status.lastSyncAt) return "green";
  return "gray";
}
