import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const db = getFirestore();

// ============================================================================
// Types
// ============================================================================

interface EmailIntegration {
  userId: string;
  provider: string;
  email: string;
  isActive: boolean;
  needsReauth: boolean;
  initialSyncComplete?: boolean;
}

// ============================================================================
// Trigger on Gmail Connection
// ============================================================================

/**
 * Triggered when a new email integration is created.
 * If it's a Gmail integration, queues the initial invoice sync.
 */
export const onGmailConnected = onDocumentCreated(
  {
    document: "emailIntegrations/{integrationId}",
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 60,
  },
  async (event) => {
    const data = event.data?.data() as EmailIntegration | undefined;
    if (!data) {
      console.log("[GmailSync] No data in created document");
      return;
    }

    // Only process Gmail integrations
    if (data.provider !== "gmail") {
      console.log(`[GmailSync] Integration is ${data.provider}, not Gmail, skipping`);
      return;
    }

    // Skip if inactive or needs reauth
    if (!data.isActive || data.needsReauth) {
      console.log("[GmailSync] Integration is inactive or needs reauth, skipping");
      return;
    }

    const integrationId = event.params.integrationId;
    const userId = data.userId;

    console.log(`[GmailSync] New Gmail integration created: ${data.email}`);

    try {
      // Get transaction date range for time-bounded sync
      const dateRange = await getTransactionDateRange(userId);

      let dateFrom: Date;
      let dateTo: Date;

      if (dateRange) {
        // Extend range slightly to catch invoices for transactions
        dateFrom = new Date(dateRange.minDate);
        dateFrom.setDate(dateFrom.getDate() - 7); // 7 days before first transaction

        dateTo = new Date(dateRange.maxDate);
        dateTo.setDate(dateTo.getDate() + 7); // 7 days after last transaction
      } else {
        // No transactions, sync last 90 days
        dateTo = new Date();
        dateFrom = new Date();
        dateFrom.setDate(dateFrom.getDate() - 90);
      }

      console.log(`[GmailSync] Date range: ${dateFrom.toISOString()} to ${dateTo.toISOString()}`);

      // Mark initial sync as started
      await event.data?.ref.update({
        initialSyncStartedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      // Create sync queue item
      const now = Timestamp.now();
      await db.collection("gmailSyncQueue").add({
        userId,
        integrationId,
        type: "initial",
        status: "pending",
        dateFrom: Timestamp.fromDate(dateFrom),
        dateTo: Timestamp.fromDate(dateTo),
        emailsProcessed: 0,
        filesCreated: 0,
        attachmentsSkipped: 0,
        errors: [],
        retryCount: 0,
        maxRetries: 3,
        processedMessageIds: [],
        createdAt: now,
      });

      console.log(`[GmailSync] Queued initial sync for ${data.email}`);

      // Create notification for user
      await db.collection("notifications").add({
        userId,
        type: "gmail_sync_started",
        title: "Gmail Sync Started",
        message: `Scanning ${data.email} for invoices. This may take a few minutes.`,
        read: false,
        createdAt: now,
      });
    } catch (error) {
      console.error(`[GmailSync] Error setting up initial sync:`, error);

      // Update integration with error
      await event.data?.ref.update({
        lastSyncError: error instanceof Error ? error.message : "Failed to start initial sync",
        updatedAt: Timestamp.now(),
      });
    }
  }
);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the date range of the user's transactions.
 * Used to limit invoice search to relevant dates.
 */
async function getTransactionDateRange(
  userId: string
): Promise<{ minDate: Date; maxDate: Date } | null> {
  console.log(`[GmailSync] Querying transactions for userId: ${userId}`);

  // Get earliest transaction
  const earliestQuery = await db
    .collection("transactions")
    .where("userId", "==", userId)
    .orderBy("date", "asc")
    .limit(1)
    .get();

  // Get latest transaction
  const latestQuery = await db
    .collection("transactions")
    .where("userId", "==", userId)
    .orderBy("date", "desc")
    .limit(1)
    .get();

  console.log(`[GmailSync] Found ${earliestQuery.size} earliest, ${latestQuery.size} latest transactions`);

  if (earliestQuery.empty || latestQuery.empty) {
    console.log(`[GmailSync] No transactions found for user, will use fallback date range`);
    return null;
  }

  const earliestDoc = earliestQuery.docs[0].data();
  const latestDoc = latestQuery.docs[0].data();

  // Handle both Timestamp and Date objects
  const minDate =
    earliestDoc.date instanceof Timestamp
      ? earliestDoc.date.toDate()
      : new Date(earliestDoc.date);
  const maxDate =
    latestDoc.date instanceof Timestamp
      ? latestDoc.date.toDate()
      : new Date(latestDoc.date);

  return { minDate, maxDate };
}
