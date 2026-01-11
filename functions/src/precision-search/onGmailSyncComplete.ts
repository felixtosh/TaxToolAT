/**
 * Trigger precision search when Gmail sync completes
 *
 * When a Gmail sync queue item transitions to "completed" status,
 * this trigger queues a precision search for all incomplete transactions.
 */

import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const db = getFirestore();

// Default strategies for post-sync precision search
const DEFAULT_STRATEGIES = [
  "partner_files",
  "amount_files",
  "email_attachment",
  "email_invoice",
];

/**
 * Triggered when Gmail sync completes.
 * Queues precision search for all incomplete transactions.
 */
export const onGmailSyncComplete = onDocumentUpdated(
  {
    document: "gmailSyncQueue/{queueId}",
    region: "europe-west1",
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();

    if (!before || !after) return;

    // Only trigger when status changes to "completed"
    if (before.status === "completed" || after.status !== "completed") {
      return;
    }

    const userId = after.userId;
    const gmailSyncQueueId = event.params.queueId;
    const filesCreated = after.filesCreated || 0;

    console.log(
      `[PrecisionSearch] Gmail sync ${gmailSyncQueueId} completed with ${filesCreated} files`
    );

    // Skip if no files were created (nothing new to match)
    if (filesCreated === 0) {
      console.log("[PrecisionSearch] No new files, skipping precision search");
      return;
    }

    // Check if there's already a pending precision search for this user
    const existingSearch = await db
      .collection("precisionSearchQueue")
      .where("userId", "==", userId)
      .where("status", "in", ["pending", "processing"])
      .limit(1)
      .get();

    if (!existingSearch.empty) {
      console.log(
        "[PrecisionSearch] User already has a pending precision search, skipping"
      );
      return;
    }

    // Count incomplete transactions
    const incompleteCount = await db
      .collection("transactions")
      .where("userId", "==", userId)
      .where("isComplete", "==", false)
      .count()
      .get();

    const transactionsToProcess = incompleteCount.data().count;

    if (transactionsToProcess === 0) {
      console.log("[PrecisionSearch] No incomplete transactions, skipping");
      return;
    }

    // Queue precision search
    const now = Timestamp.now();
    const queueItem = {
      userId,
      scope: "all_incomplete",
      triggeredBy: "gmail_sync",
      triggeredByAuthor: {
        type: "system",
        userId: userId,
      },
      gmailSyncQueueId,
      status: "pending",
      transactionsToProcess,
      transactionsProcessed: 0,
      transactionsWithMatches: 0,
      totalFilesConnected: 0,
      strategies: DEFAULT_STRATEGIES,
      currentStrategyIndex: 0,
      errors: [],
      retryCount: 0,
      maxRetries: 3,
      createdAt: now,
    };

    const docRef = await db.collection("precisionSearchQueue").add(queueItem);

    console.log(
      `[PrecisionSearch] Queued precision search ${docRef.id} for ${transactionsToProcess} transactions after Gmail sync`
    );
  }
);
