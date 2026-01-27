/**
 * Cancel running workers for an entity (transaction or file)
 *
 * When a user manually assigns a file to a transaction or a partner to a transaction/file,
 * any running automation workers for that entity should be cancelled.
 */

import { getFirestore, Timestamp } from "firebase-admin/firestore";

const db = getFirestore();

export type EntityType = "transaction" | "file";

interface CancelResult {
  cancelledRequests: number;
  cancelledRuns: number;
}

/**
 * Cancel all pending/running workers for a given entity
 *
 * @param userId - The user ID
 * @param entityType - "transaction" or "file"
 * @param entityId - The transaction or file ID
 * @param workerTypes - Optional: specific worker types to cancel (cancels all if not specified)
 */
export async function cancelWorkersForEntity(
  userId: string,
  entityType: EntityType,
  entityId: string,
  workerTypes?: string[]
): Promise<CancelResult> {
  const result: CancelResult = { cancelledRequests: 0, cancelledRuns: 0 };

  // Build the trigger context field to match
  const triggerContextField =
    entityType === "transaction" ? "triggerContext.transactionId" : "triggerContext.fileId";

  // 1. Cancel pending workerRequests
  let requestsQuery = db
    .collection(`users/${userId}/workerRequests`)
    .where(triggerContextField, "==", entityId)
    .where("status", "==", "pending");

  const pendingRequests = await requestsQuery.get();

  if (!pendingRequests.empty) {
    const batch = db.batch();
    for (const doc of pendingRequests.docs) {
      // Filter by worker type if specified
      if (workerTypes && !workerTypes.includes(doc.data().workerType)) {
        continue;
      }
      batch.update(doc.ref, {
        status: "cancelled",
        cancelledAt: Timestamp.now(),
        cancelReason: "manual_override",
      });
      result.cancelledRequests++;
    }
    if (result.cancelledRequests > 0) {
      await batch.commit();
    }
  }

  // 2. Cancel running workerRuns
  let runsQuery = db
    .collection(`users/${userId}/workerRuns`)
    .where(triggerContextField, "==", entityId)
    .where("status", "==", "running");

  const runningRuns = await runsQuery.get();

  if (!runningRuns.empty) {
    const batch = db.batch();
    for (const doc of runningRuns.docs) {
      // Filter by worker type if specified
      if (workerTypes && !workerTypes.includes(doc.data().workerType)) {
        continue;
      }
      batch.update(doc.ref, {
        status: "cancelled",
        completedAt: Timestamp.now(),
        summary: "Cancelled: User made manual assignment",
      });
      result.cancelledRuns++;
    }
    if (result.cancelledRuns > 0) {
      await batch.commit();
    }
  }

  if (result.cancelledRequests > 0 || result.cancelledRuns > 0) {
    console.log(
      `[cancelWorkersForEntity] Cancelled ${result.cancelledRequests} requests and ${result.cancelledRuns} runs for ${entityType} ${entityId}`
    );
  }

  return result;
}

/**
 * Cancel file-related workers for a transaction
 * (file_matching, receipt_search)
 */
export async function cancelFileWorkersForTransaction(
  userId: string,
  transactionId: string
): Promise<CancelResult> {
  return cancelWorkersForEntity(userId, "transaction", transactionId, [
    "file_matching",
    "receipt_search",
  ]);
}

/**
 * Cancel partner-related workers for a transaction
 * (partner_matching)
 */
export async function cancelPartnerWorkersForTransaction(
  userId: string,
  transactionId: string
): Promise<CancelResult> {
  return cancelWorkersForEntity(userId, "transaction", transactionId, ["partner_matching"]);
}

/**
 * Cancel partner-related workers for a file
 * (file_partner_matching)
 */
export async function cancelPartnerWorkersForFile(
  userId: string,
  fileId: string
): Promise<CancelResult> {
  return cancelWorkersForEntity(userId, "file", fileId, ["file_partner_matching"]);
}

/**
 * Cancel transaction-related workers for a file
 * (file_matching)
 */
export async function cancelTransactionWorkersForFile(
  userId: string,
  fileId: string
): Promise<CancelResult> {
  return cancelWorkersForEntity(userId, "file", fileId, ["file_matching"]);
}
