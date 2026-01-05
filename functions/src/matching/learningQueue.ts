import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

const db = getFirestore();

// ============================================================================
// Types
// ============================================================================

interface LearningQueueItem {
  pendingPartners: string[];
  queuedAt: Timestamp;
  processAfter: Timestamp;
  status: "idle" | "processing";
  userId: string;
}

// ============================================================================
// Queue Management Functions
// ============================================================================

/**
 * Add a partner to the learning queue
 * Called from client after partner assignment
 */
export const queuePartnerForLearning = onCall<{ partnerId: string }>(
  {
    region: "europe-west1",
    memory: "128MiB",
    timeoutSeconds: 10,
  },
  async (request) => {
    const userId = request.auth?.uid || "dev-user-123";
    const { partnerId } = request.data;

    if (!partnerId) {
      throw new HttpsError("invalid-argument", "partnerId is required");
    }

    const queueRef = db.collection("users").doc(userId).collection("system").doc("learningQueue");

    const now = Timestamp.now();
    const processAfter = Timestamp.fromMillis(Date.now() + 5 * 60 * 1000); // 5 minutes from now

    try {
      await db.runTransaction(async (transaction) => {
        const queueDoc = await transaction.get(queueRef);

        if (!queueDoc.exists) {
          // Create new queue
          transaction.set(queueRef, {
            pendingPartners: [partnerId],
            queuedAt: now,
            processAfter: processAfter,
            status: "idle",
            userId: userId,
          });
        } else {
          const data = queueDoc.data() as LearningQueueItem;

          // Don't modify if currently processing
          if (data.status === "processing") {
            // Just add to pending, don't change processAfter
            transaction.update(queueRef, {
              pendingPartners: FieldValue.arrayUnion(partnerId),
            });
          } else {
            // Add partner and reset timer if needed
            transaction.update(queueRef, {
              pendingPartners: FieldValue.arrayUnion(partnerId),
              // Keep original processAfter to maintain debounce from first item
            });
          }
        }
      });

      console.log(`Queued partner ${partnerId} for learning (user: ${userId})`);
      return { success: true, partnerId };
    } catch (error) {
      console.error("Error queueing partner:", error);
      throw new HttpsError("internal", "Failed to queue partner for learning");
    }
  }
);

/**
 * Process all pending learning queues
 * Runs on schedule every 5 minutes
 */
export const processLearningQueue = onSchedule(
  {
    schedule: "every 5 minutes",
    region: "europe-west1",
    memory: "512MiB",
    timeoutSeconds: 300,
  },
  async () => {
    console.log("Processing learning queues...");

    const now = Timestamp.now();

    // Find all users with pending queues that are ready to process
    const usersSnapshot = await db.collectionGroup("system")
      .where("pendingPartners", "!=", [])
      .where("status", "==", "idle")
      .get();

    console.log(`Found ${usersSnapshot.size} queues to check`);

    for (const queueDoc of usersSnapshot.docs) {
      const data = queueDoc.data() as LearningQueueItem;

      // Check if it's time to process (debounce period passed)
      if (data.processAfter.toMillis() > now.toMillis()) {
        console.log(`Queue for user ${data.userId} not ready yet (waiting until ${data.processAfter.toDate()})`);
        continue;
      }

      // Mark as processing
      await queueDoc.ref.update({ status: "processing" });

      try {
        const partnerIds = data.pendingPartners;
        console.log(`Processing ${partnerIds.length} partners for user ${data.userId}`);

        // Import and call the batched learning function
        const { learnPatternsForPartnersBatch } = await import("./learnPartnerPatterns");
        await learnPatternsForPartnersBatch(data.userId, partnerIds);

        // Clear the queue
        await queueDoc.ref.update({
          pendingPartners: [],
          status: "idle",
          processAfter: FieldValue.delete(),
          queuedAt: FieldValue.delete(),
        });

        console.log(`Completed learning for user ${data.userId}`);
      } catch (error) {
        console.error(`Error processing queue for user ${data.userId}:`, error);
        // Reset status to allow retry
        await queueDoc.ref.update({ status: "idle" });
      }
    }
  }
);

/**
 * Manually trigger queue processing for a user
 * Useful for testing or immediate processing
 */
export const triggerLearningNow = onCall<Record<string, never>>(
  {
    region: "europe-west1",
    memory: "512MiB",
    timeoutSeconds: 300,
  },
  async (request) => {
    const userId = request.auth?.uid || "dev-user-123";

    const queueRef = db.collection("users").doc(userId).collection("system").doc("learningQueue");
    const queueDoc = await queueRef.get();

    if (!queueDoc.exists) {
      return { success: true, message: "No pending patterns to learn" };
    }

    const data = queueDoc.data() as LearningQueueItem;

    if (data.pendingPartners.length === 0) {
      return { success: true, message: "No pending patterns to learn" };
    }

    if (data.status === "processing") {
      return { success: false, message: "Already processing" };
    }

    // Mark as processing
    await queueRef.update({ status: "processing" });

    try {
      const partnerIds = data.pendingPartners;
      console.log(`Manual trigger: Processing ${partnerIds.length} partners for user ${userId}`);

      const { learnPatternsForPartnersBatch } = await import("./learnPartnerPatterns");
      await learnPatternsForPartnersBatch(userId, partnerIds);

      // Clear the queue
      await queueRef.update({
        pendingPartners: [],
        status: "idle",
        processAfter: FieldValue.delete(),
        queuedAt: FieldValue.delete(),
      });

      return {
        success: true,
        message: `Learned patterns for ${partnerIds.length} partners`
      };
    } catch (error) {
      await queueRef.update({ status: "idle" });
      throw new HttpsError("internal", `Learning failed: ${error instanceof Error ? error.message : "Unknown"}`);
    }
  }
);
