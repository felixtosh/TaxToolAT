"use client";

import { useMemo } from "react";
import { useNotifications } from "./use-notifications";
import { WorkerType } from "@/types/worker";

export interface RunningWorkerInfo {
  notificationId: string;
  workerType: WorkerType;
  transactionId?: string;
  fileId?: string;
}

/**
 * Hook to track currently running workers from notifications.
 * Returns Sets of transactionIds/fileIds that have active workers.
 */
export function useRunningWorkers() {
  const { notifications } = useNotifications();

  // Extract running workers from notifications
  const runningWorkers = useMemo(() => {
    return notifications
      .filter(
        (n) =>
          n.type === "worker_activity" &&
          n.context.workerStatus === "running"
      )
      .map((n) => ({
        notificationId: n.id,
        workerType: n.context.workerType as WorkerType,
        transactionId: n.context.transactionId,
        fileId: n.context.fileId,
      }));
  }, [notifications]);

  // Set of transactionIds with any running worker (file_matching, receipt_search, partner_matching)
  const runningTransactionIds = useMemo(() => {
    return new Set(
      runningWorkers
        .filter((w) => w.transactionId)
        .map((w) => w.transactionId!)
    );
  }, [runningWorkers]);

  // Set of transactionIds with file-related workers running (file_matching, receipt_search)
  const runningFileSearchTransactionIds = useMemo(() => {
    return new Set(
      runningWorkers
        .filter(
          (w) =>
            w.transactionId &&
            (w.workerType === "file_matching" || w.workerType === "receipt_search")
        )
        .map((w) => w.transactionId!)
    );
  }, [runningWorkers]);

  // Set of transactionIds with partner matching running
  const runningPartnerSearchTransactionIds = useMemo(() => {
    return new Set(
      runningWorkers
        .filter((w) => w.transactionId && w.workerType === "partner_matching")
        .map((w) => w.transactionId!)
    );
  }, [runningWorkers]);

  // Set of fileIds with any running worker
  const runningFileIds = useMemo(() => {
    return new Set(
      runningWorkers.filter((w) => w.fileId).map((w) => w.fileId!)
    );
  }, [runningWorkers]);

  // Check if a specific transaction has a running worker
  const isTransactionSearching = (transactionId: string): boolean => {
    return runningFileSearchTransactionIds.has(transactionId);
  };

  // Check if a specific transaction has a running partner search
  const isTransactionPartnerSearching = (transactionId: string): boolean => {
    return runningPartnerSearchTransactionIds.has(transactionId);
  };

  // Check if a specific file has a running worker
  const isFileSearching = (fileId: string): boolean => {
    return runningFileIds.has(fileId);
  };

  return {
    runningWorkers,
    runningTransactionIds,
    runningFileSearchTransactionIds,
    runningPartnerSearchTransactionIds,
    runningFileIds,
    isTransactionSearching,
    isTransactionPartnerSearching,
    isFileSearching,
  };
}
