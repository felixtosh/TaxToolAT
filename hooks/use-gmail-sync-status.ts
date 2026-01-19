"use client";

import { useState, useEffect } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/components/auth";

export interface GmailSyncStatus {
  isActive: boolean;
  integrationEmail?: string;
  filesCreated?: number;
  emailsProcessed?: number;
  type?: "initial" | "scheduled" | "manual";
  startedAt?: Date;
}

/**
 * Hook to monitor active Gmail sync status
 * Returns sync info when a sync is in progress
 */
export function useGmailSyncStatus(): GmailSyncStatus {
  const { userId } = useAuth();
  const [status, setStatus] = useState<GmailSyncStatus>({ isActive: false });

  useEffect(() => {
    if (!userId) {
      setStatus({ isActive: false });
      return;
    }

    // Listen for processing queue items
    const queueQuery = query(
      collection(db, "gmailSyncQueue"),
      where("userId", "==", userId),
      where("status", "in", ["pending", "processing"]),
      orderBy("createdAt", "desc"),
      limit(1)
    );

    const unsubscribeQueue = onSnapshot(queueQuery, async (snapshot) => {
      if (snapshot.empty) {
        setStatus({ isActive: false });
        return;
      }

      const queueDoc = snapshot.docs[0];
      const queueData = queueDoc.data();

      // Check if queue item is stale (created more than 10 minutes ago and still pending)
      // This catches orphaned items that didn't get processed
      const createdAt = queueData.createdAt?.toDate();
      const isStale = createdAt &&
        queueData.status === "pending" &&
        Date.now() - createdAt.getTime() > 10 * 60 * 1000;

      if (isStale) {
        console.log("[GmailSync] Found stale queue item, ignoring:", queueDoc.id);
        setStatus({ isActive: false });
        return;
      }

      // Get integration email
      let integrationEmail: string | undefined;
      try {
        const integrationId = queueData.integrationId;
        // We'd need to fetch integration doc, but for simplicity use integrationId
        // The email is stored in emailIntegrations collection
        integrationEmail = undefined; // Will be filled by separate listener
      } catch {
        // Ignore
      }

      setStatus({
        isActive: true,
        integrationEmail,
        filesCreated: queueData.filesCreated || 0,
        emailsProcessed: queueData.emailsProcessed || 0,
        type: queueData.type,
        startedAt: queueData.startedAt?.toDate(),
      });
    });

    return () => {
      unsubscribeQueue();
    };
  }, [userId]);

  return status;
}

/**
 * Hook to get sync status for a specific integration
 */
export function useIntegrationSyncStatus(integrationId: string | null): {
  isSyncing: boolean;
  filesCreated: number;
  emailsProcessed: number;
} {
  const [status, setStatus] = useState({
    isSyncing: false,
    filesCreated: 0,
    emailsProcessed: 0,
  });

  useEffect(() => {
    if (!integrationId) {
      setStatus({ isSyncing: false, filesCreated: 0, emailsProcessed: 0 });
      return;
    }

    const queueQuery = query(
      collection(db, "gmailSyncQueue"),
      where("integrationId", "==", integrationId),
      where("status", "in", ["pending", "processing"]),
      limit(1)
    );

    const unsubscribe = onSnapshot(queueQuery, (snapshot) => {
      if (snapshot.empty) {
        setStatus({ isSyncing: false, filesCreated: 0, emailsProcessed: 0 });
        return;
      }

      const data = snapshot.docs[0].data();
      setStatus({
        isSyncing: true,
        filesCreated: data.filesCreated || 0,
        emailsProcessed: data.emailsProcessed || 0,
      });
    });

    return () => unsubscribe();
  }, [integrationId]);

  return status;
}
