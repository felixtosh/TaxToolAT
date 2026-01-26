/**
 * Worker Queue Processor
 *
 * Background component that processes pending worker requests one at a time.
 * Runs silently in the background - no UI, just processing.
 */

"use client";

import { useEffect } from "react";
import { useWorkerQueue } from "@/hooks/use-worker-queue";

/**
 * Background worker queue processor.
 * Place this component in the dashboard layout to enable automatic
 * processing of queued worker requests.
 */
export function WorkerQueueProcessor() {
  const { isProcessing, currentRequest, pendingCount } = useWorkerQueue({
    enabled: true,
    delayBetweenRequests: 3000, // 3 second delay between requests
  });

  // Log processing state for debugging (can be removed in production)
  useEffect(() => {
    if (isProcessing && currentRequest) {
      console.log(
        `[WorkerQueueProcessor] Processing ${currentRequest.workerType} ` +
          `(${pendingCount} pending)`
      );
    }
  }, [isProcessing, currentRequest, pendingCount]);

  // This component renders nothing - it just runs the hook
  return null;
}
