/**
 * Worker Queue Processor Hook
 *
 * Listens to the workerRequests collection and processes pending requests
 * one at a time. This runs in the background and creates notifications
 * for completed workers.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { collection, query, where, orderBy, limit, onSnapshot, doc, updateDoc, Timestamp, runTransaction, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/components/auth";
import { WorkerType } from "@/types/worker";

/**
 * Get ID token from the current user
 */
async function getIdToken(user: { getIdToken: () => Promise<string> } | null): Promise<string | null> {
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}

interface WorkerRequest {
  id: string;
  workerType: WorkerType;
  initialPrompt: string;
  triggerContext?: {
    fileId?: string;
    transactionId?: string;
    partnerId?: string;
  };
  triggeredBy: "auto" | "user";
  status: "pending" | "processing" | "completed" | "failed";
  createdAt: Timestamp;
  error?: string;
}

interface UseWorkerQueueOptions {
  /** Enable queue processing (default: true) */
  enabled?: boolean;
  /** Delay between processing requests in ms (default: 2000) */
  delayBetweenRequests?: number;
}

export function useWorkerQueue(options: UseWorkerQueueOptions = {}) {
  const { enabled = true, delayBetweenRequests = 2000 } = options;
  const { user } = useAuth();

  const [isProcessing, setIsProcessing] = useState(false);
  const [currentRequest, setCurrentRequest] = useState<WorkerRequest | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  const processingRef = useRef(false);
  const queueRef = useRef<WorkerRequest[]>([]);

  // Process a single worker request
  const processRequest = useCallback(
    async (request: WorkerRequest): Promise<void> => {
      if (!user?.uid) return;

      const idToken = await getIdToken(user);
      if (!idToken) {
        console.error("[WorkerQueue] Failed to get ID token");
        return;
      }

      const requestRef = doc(db, `users/${user.uid}/workerRequests`, request.id);

      try {
        // Atomically claim the request - prevents race conditions with multiple tabs
        const claimed = await runTransaction(db, async (transaction) => {
          const docSnap = await transaction.get(requestRef);
          if (!docSnap.exists()) return false;

          const data = docSnap.data();
          if (data.status !== "pending") {
            // Already claimed by another tab
            return false;
          }

          transaction.update(requestRef, {
            status: "processing",
            startedAt: Timestamp.now(),
          });
          return true;
        });

        if (!claimed) {
          console.log(`[WorkerQueue] Request ${request.id} already claimed by another tab`);
          return;
        }

        console.log(`[WorkerQueue] Processing request ${request.id}: ${request.workerType}`);

        // Call the worker API
        const response = await fetch("/api/worker", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            workerType: request.workerType,
            initialPrompt: request.initialPrompt,
            triggerContext: request.triggerContext,
            triggeredBy: request.triggeredBy,
            modelProvider: "gemini", // Use cheaper model for automated tasks
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Worker API request failed");
        }

        // Mark as completed
        await updateDoc(requestRef, {
          status: "completed",
          completedAt: Timestamp.now(),
          workerRunId: result.runId,
          summary: result.summary,
        });

        // Update transaction automation history if this was a receipt search
        if (request.workerType === "receipt_search" && request.triggerContext?.transactionId) {
          await updateTransactionAutomationHistory(
            request.triggerContext.transactionId,
            request.id,
            "completed",
            result.summary
          );
        }

        console.log(`[WorkerQueue] Completed request ${request.id}:`, result);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";

        // Mark as failed
        await updateDoc(requestRef, {
          status: "failed",
          completedAt: Timestamp.now(),
          error: errorMessage,
        });

        // Update transaction automation history if this was a receipt search
        if (request.workerType === "receipt_search" && request.triggerContext?.transactionId) {
          await updateTransactionAutomationHistory(
            request.triggerContext.transactionId,
            request.id,
            "failed",
            errorMessage
          );
        }

        console.error(`[WorkerQueue] Failed request ${request.id}:`, error);
      }
    },
    [user]
  );

  // Update transaction automation history after worker completes
  const updateTransactionAutomationHistory = async (
    transactionId: string,
    workerRequestId: string,
    status: "completed" | "failed" | "no_match",
    summary?: string
  ) => {
    try {
      const txRef = doc(db, "transactions", transactionId);

      // We need to update the specific entry in the array
      // Since Firestore doesn't support updating array elements directly,
      // we'll use a Cloud Function for this in production
      // For now, we'll just log it
      console.log(`[WorkerQueue] Would update automation history for ${transactionId}:`, {
        workerRequestId,
        status,
        summary,
      });
    } catch (error) {
      console.error(`[WorkerQueue] Failed to update automation history:`, error);
    }
  };

  // Process queue items one by one
  const processQueue = useCallback(async () => {
    if (processingRef.current || !enabled) return;

    const queue = queueRef.current;
    if (queue.length === 0) return;

    processingRef.current = true;
    setIsProcessing(true);

    while (queue.length > 0 && enabled) {
      const request = queue.shift()!;
      setCurrentRequest(request);
      setPendingCount(queue.length);

      await processRequest(request);

      // Delay between requests to avoid overwhelming the system
      if (queue.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayBetweenRequests));
      }
    }

    setCurrentRequest(null);
    setIsProcessing(false);
    processingRef.current = false;
  }, [enabled, processRequest, delayBetweenRequests]);

  // Listen to pending worker requests
  useEffect(() => {
    if (!user?.uid || !enabled) return;

    const q = query(
      collection(db, `users/${user.uid}/workerRequests`),
      where("status", "==", "pending"),
      orderBy("createdAt", "asc"),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const requests = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as WorkerRequest[];

      // Update queue with new pending requests
      // Only add requests that aren't already in the queue
      const existingIds = new Set(queueRef.current.map((r) => r.id));
      const newRequests = requests.filter((r) => !existingIds.has(r.id));

      if (newRequests.length > 0) {
        queueRef.current.push(...newRequests);
        setPendingCount(queueRef.current.length);

        // Start processing if not already
        if (!processingRef.current) {
          processQueue();
        }
      }
    });

    return () => unsubscribe();
  }, [user?.uid, enabled, processQueue]);

  return {
    isProcessing,
    currentRequest,
    pendingCount,
  };
}
