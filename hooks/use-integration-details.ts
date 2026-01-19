"use client";

import { useState, useEffect, useMemo } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { GmailSyncHistoryRecord, IntegrationSyncStats } from "@/types/gmail-sync";
import { useAuth } from "@/components/auth";

/**
 * Hook to fetch sync history for an integration
 */
export function useSyncHistory(integrationId: string | null, maxItems: number = 10) {
  const { userId } = useAuth();
  const [history, setHistory] = useState<GmailSyncHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!integrationId || !userId) {
      setHistory([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const q = query(
      collection(db, "gmailSyncHistory"),
      where("integrationId", "==", integrationId),
      where("userId", "==", userId),
      orderBy("completedAt", "desc"),
      limit(maxItems)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as GmailSyncHistoryRecord[];

      setHistory(records);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [integrationId, maxItems, userId]);

  return { history, loading };
}

/**
 * Hook to compute stats from files for an integration
 */
export function useIntegrationFileStats(integrationId: string | null): {
  stats: IntegrationSyncStats | null;
  loading: boolean;
} {
  const { userId } = useAuth();
  const [stats, setStats] = useState<IntegrationSyncStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!integrationId || !userId) {
      setStats(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Listen to files from this Gmail integration
    const q = query(
      collection(db, "files"),
      where("userId", "==", userId),
      where("gmailIntegrationId", "==", integrationId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let totalFilesImported = 0;
      let filesExtracted = 0;
      let filesMatched = 0;
      let filesWithErrors = 0;
      let filesNotInvoices = 0;

      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        totalFilesImported++;

        if (data.extractionComplete) {
          filesExtracted++;
        }

        if (data.extractionError) {
          filesWithErrors++;
        }

        if (data.partnerId) {
          filesMatched++;
        }

        // Files that were extracted but have no amount (likely not invoices)
        if (data.extractionComplete && !data.extractedAmount && !data.extractionError) {
          filesNotInvoices++;
        }
      });

      setStats({
        totalFilesImported,
        filesExtracted,
        filesMatched,
        filesWithErrors,
        filesNotInvoices,
      });
      setLoading(false);
    });

    return () => unsubscribe();
  }, [integrationId, userId]);

  return { stats, loading };
}

/**
 * Hook to get active sync status for an integration
 */
export function useActiveSyncForIntegration(integrationId: string | null): {
  isActive: boolean;
  filesCreated: number;
  emailsProcessed: number;
  status: "pending" | "processing" | null;
} {
  const [state, setState] = useState({
    isActive: false,
    filesCreated: 0,
    emailsProcessed: 0,
    status: null as "pending" | "processing" | null,
  });

  useEffect(() => {
    if (!integrationId) {
      setState({ isActive: false, filesCreated: 0, emailsProcessed: 0, status: null });
      return;
    }

    const q = query(
      collection(db, "gmailSyncQueue"),
      where("integrationId", "==", integrationId),
      where("status", "in", ["pending", "processing"]),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log(`[ActiveSync] Query for ${integrationId}: ${snapshot.size} docs found`);

      if (snapshot.empty) {
        console.log(`[ActiveSync] No active queue items found`);
        setState({ isActive: false, filesCreated: 0, emailsProcessed: 0, status: null });
        return;
      }

      const doc = snapshot.docs[0];
      const data = doc.data();
      console.log(`[ActiveSync] Found queue item:`, doc.id, data.status, `filesCreated: ${data.filesCreated}`);

      // Check for stale items (>10 min old and still pending)
      const createdAt = data.createdAt?.toDate();
      const isStale = createdAt &&
        data.status === "pending" &&
        Date.now() - createdAt.getTime() > 10 * 60 * 1000;

      if (isStale) {
        console.log(`[ActiveSync] Queue item is stale (created ${createdAt}), ignoring`);
        setState({ isActive: false, filesCreated: 0, emailsProcessed: 0, status: null });
        return;
      }

      console.log(`[ActiveSync] Setting isActive: true`);
      setState({
        isActive: true,
        filesCreated: data.filesCreated || 0,
        emailsProcessed: data.emailsProcessed || 0,
        status: data.status,
      });
    });

    return () => unsubscribe();
  }, [integrationId]);

  return state;
}
