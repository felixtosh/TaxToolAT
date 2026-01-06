import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";

// Define secrets - must be set via Firebase CLI
const gocardlessSecretId = defineSecret("GOCARDLESS_SECRET_ID");
const gocardlessSecretKey = defineSecret("GOCARDLESS_SECRET_KEY");

const db = getFirestore();
const BASE_URL = "https://bankaccountdata.gocardless.com/api/v2";

// ============================================================================
// Types (simplified for Cloud Functions)
// ============================================================================

interface ApiConnectorConfig {
  provider: string;
  requisitionId: string;
  accountId: string;
  institutionId: string;
  institutionName: string;
  agreementExpiresAt: Timestamp;
  lastSyncAt?: Timestamp;
  lastSyncError?: string;
}

interface TransactionSource {
  id: string;
  name: string;
  iban: string;
  type: string;
  apiConfig?: ApiConnectorConfig;
  userId: string;
  isActive: boolean;
}

interface GoCardlessTransaction {
  transactionId?: string;
  internalTransactionId?: string;
  entryReference?: string;
  bookingDate?: string;
  valueDate?: string;
  transactionAmount: {
    amount: string;
    currency: string;
  };
  creditorName?: string;
  creditorAccount?: { iban?: string };
  debtorName?: string;
  debtorAccount?: { iban?: string };
  remittanceInformationUnstructured?: string;
  remittanceInformationUnstructuredArray?: string[];
  additionalInformation?: string;
}

// ============================================================================
// GoCardless API Client (simplified for Cloud Functions)
// ============================================================================

class GoCardlessClient {
  private accessToken: string | null = null;
  private tokenExpiresAt: Date | null = null;

  constructor(
    private secretId: string,
    private secretKey: string
  ) {}

  async getAccessToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiresAt && this.tokenExpiresAt > new Date()) {
      return this.accessToken;
    }

    const response = await fetch(`${BASE_URL}/token/new/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret_id: this.secretId,
        secret_key: this.secretKey,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to get GoCardless access token");
    }

    const data = await response.json();
    this.accessToken = data.access;
    this.tokenExpiresAt = new Date(Date.now() + (data.access_expires - 60) * 1000);
    return this.accessToken!;
  }

  async getTransactions(
    accountId: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<{ transactions: { booked: GoCardlessTransaction[] } }> {
    const token = await this.getAccessToken();
    let path = `/accounts/${accountId}/transactions/`;
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    if (params.toString()) path += `?${params.toString()}`;

    const response = await fetch(`${BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch transactions: ${response.status}`);
    }

    return response.json();
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function normalizeIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}

async function sha256(message: string): Promise<string> {
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(message).digest("hex");
}

async function generateDedupeHash(
  date: Date,
  amount: number,
  sourceIban: string,
  reference: string | null
): Promise<string> {
  const dateStr = date.toISOString().split("T")[0];
  const amountStr = amount.toString();
  const ibanNormalized = normalizeIban(sourceIban);
  const refNormalized = (reference || "").trim().toUpperCase();
  const input = `${dateStr}|${amountStr}|${ibanNormalized}|${refNormalized}`;
  return sha256(input);
}

function buildTransactionName(gcTx: GoCardlessTransaction): string {
  if (gcTx.remittanceInformationUnstructuredArray?.length) {
    return gcTx.remittanceInformationUnstructuredArray.join(" ").trim();
  }
  if (gcTx.remittanceInformationUnstructured) {
    return gcTx.remittanceInformationUnstructured.trim();
  }
  if (gcTx.additionalInformation) {
    return gcTx.additionalInformation.trim();
  }
  return gcTx.creditorName || gcTx.debtorName || "Unknown transaction";
}

// ============================================================================
// Scheduled Sync Function
// ============================================================================

/**
 * Scheduled function to sync all GoCardless-connected bank accounts
 * Runs daily at 6 AM Europe/Vienna time
 */
export const scheduledGoCardlessSync = onSchedule(
  {
    schedule: "0 6 * * *",
    timeZone: "Europe/Vienna",
    region: "europe-west1",
    memory: "512MiB",
    timeoutSeconds: 540, // 9 minutes
    secrets: [gocardlessSecretId, gocardlessSecretKey],
  },
  async () => {
    console.log("Starting scheduled GoCardless sync...");

    const secretId = gocardlessSecretId.value();
    const secretKey = gocardlessSecretKey.value();

    if (!secretId || !secretKey) {
      console.error("GoCardless credentials not configured");
      return;
    }

    // Get all active API sources
    const sourcesSnapshot = await db
      .collection("sources")
      .where("type", "==", "api")
      .where("isActive", "==", true)
      .get();

    console.log(`Found ${sourcesSnapshot.size} API sources to check`);

    const client = new GoCardlessClient(secretId, secretKey);
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

    let synced = 0;
    let skipped = 0;
    let errors = 0;

    for (const sourceDoc of sourcesSnapshot.docs) {
      const source = { id: sourceDoc.id, ...sourceDoc.data() } as TransactionSource;

      if (!source.apiConfig || source.apiConfig.provider !== "gocardless") {
        continue;
      }

      const config = source.apiConfig;

      // Check if re-auth is required
      const expiresAt = config.agreementExpiresAt.toDate();
      if (expiresAt < new Date()) {
        console.log(`Source ${source.id} needs re-authentication, skipping`);
        skipped++;

        // Create notification for user
        await db.collection("notifications").add({
          userId: source.userId,
          type: "bank_reauth_required",
          title: "Bank Connection Expired",
          message: `Your connection to ${config.institutionName} has expired. Please reconnect.`,
          sourceId: source.id,
          read: false,
          createdAt: Timestamp.now(),
        });

        continue;
      }

      // Check if synced recently
      const lastSync = config.lastSyncAt?.toDate();
      if (lastSync && lastSync > sixHoursAgo) {
        console.log(`Source ${source.id} synced recently, skipping`);
        skipped++;
        continue;
      }

      try {
        await syncSourceTransactions(client, source, config);
        synced++;
      } catch (error) {
        console.error(`Error syncing source ${source.id}:`, error);
        errors++;

        // Update source with error
        await sourceDoc.ref.update({
          "apiConfig.lastSyncError": error instanceof Error ? error.message : "Unknown error",
          updatedAt: Timestamp.now(),
        });
      }
    }

    console.log(`Sync complete: ${synced} synced, ${skipped} skipped, ${errors} errors`);
  }
);

/**
 * Sync transactions for a single source
 */
async function syncSourceTransactions(
  client: GoCardlessClient,
  source: TransactionSource,
  config: ApiConnectorConfig
): Promise<void> {
  console.log(`Syncing source ${source.id} (${config.institutionName})`);

  // Calculate date range
  const lastSync = config.lastSyncAt?.toDate();
  const dateFrom = lastSync
    ? new Date(lastSync.getTime() - 2 * 24 * 60 * 60 * 1000)
    : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const dateTo = new Date();

  // Fetch transactions
  const response = await client.getTransactions(
    config.accountId,
    dateFrom.toISOString().split("T")[0],
    dateTo.toISOString().split("T")[0]
  );

  const bookedTransactions = response.transactions.booked || [];
  console.log(`Fetched ${bookedTransactions.length} transactions for source ${source.id}`);

  if (bookedTransactions.length === 0) {
    // Update lastSyncAt even if no transactions
    await db.collection("sources").doc(source.id).update({
      "apiConfig.lastSyncAt": Timestamp.now(),
      "apiConfig.lastSyncError": null,
      updatedAt: Timestamp.now(),
    });
    return;
  }

  // Transform and deduplicate
  const syncJobId = `sync_${source.id}_${Date.now()}`;
  const now = Timestamp.now();
  let imported = 0;

  for (const gcTx of bookedTransactions) {
    const dateStr = gcTx.bookingDate || gcTx.valueDate || new Date().toISOString().split("T")[0];
    const date = new Date(dateStr);
    const amountFloat = parseFloat(gcTx.transactionAmount.amount);
    const amountCents = Math.round(amountFloat * 100);
    const reference = gcTx.transactionId || gcTx.internalTransactionId || gcTx.entryReference || null;

    const dedupeHash = await generateDedupeHash(date, amountCents, source.iban, reference);

    // Check for duplicate
    const existing = await db
      .collection("transactions")
      .where("sourceId", "==", source.id)
      .where("dedupeHash", "==", dedupeHash)
      .limit(1)
      .get();

    if (!existing.empty) {
      continue; // Skip duplicate
    }

    // Create transaction
    const transaction = {
      sourceId: source.id,
      date: Timestamp.fromDate(date),
      amount: amountCents,
      currency: gcTx.transactionAmount.currency || "EUR",
      name: buildTransactionName(gcTx),
      description: null,
      partner: gcTx.creditorName || gcTx.debtorName || null,
      reference,
      partnerIban: gcTx.creditorAccount?.iban || gcTx.debtorAccount?.iban || null,
      dedupeHash,
      _original: {
        date: dateStr,
        amount: gcTx.transactionAmount.amount,
        rawRow: { source: "gocardless", ...gcTx },
      },
      isComplete: false,
      importJobId: syncJobId,
      userId: source.userId,
      partnerId: null,
      partnerType: null,
      partnerMatchConfidence: null,
      partnerMatchedBy: null,
      createdAt: now,
      updatedAt: now,
    };

    await db.collection("transactions").add(transaction);
    imported++;
  }

  console.log(`Imported ${imported} new transactions for source ${source.id}`);

  // Update source
  await db.collection("sources").doc(source.id).update({
    "apiConfig.lastSyncAt": Timestamp.now(),
    "apiConfig.lastSyncError": null,
    updatedAt: Timestamp.now(),
  });

  // Create notification if new transactions
  if (imported > 0) {
    await db.collection("notifications").add({
      userId: source.userId,
      type: "transactions_synced",
      title: "Transactions Synced",
      message: `${imported} new transactions from ${config.institutionName}`,
      sourceId: source.id,
      read: false,
      createdAt: Timestamp.now(),
    });
  }
}

// ============================================================================
// Manual Sync Function (callable)
// ============================================================================

/**
 * Manually trigger sync for a specific source
 */
export const triggerGoCardlessSync = onCall<{ sourceId: string }>(
  {
    region: "europe-west1",
    memory: "512MiB",
    timeoutSeconds: 120,
    secrets: [gocardlessSecretId, gocardlessSecretKey],
  },
  async (request) => {
    const userId = request.auth?.uid || "dev-user-123";
    const { sourceId } = request.data;

    if (!sourceId) {
      throw new HttpsError("invalid-argument", "sourceId is required");
    }

    const secretId = gocardlessSecretId.value();
    const secretKey = gocardlessSecretKey.value();

    if (!secretId || !secretKey) {
      throw new HttpsError("failed-precondition", "GoCardless not configured");
    }

    // Get source and verify ownership
    const sourceDoc = await db.collection("sources").doc(sourceId).get();
    if (!sourceDoc.exists) {
      throw new HttpsError("not-found", "Source not found");
    }

    const source = { id: sourceDoc.id, ...sourceDoc.data() } as TransactionSource;
    if (source.userId !== userId) {
      throw new HttpsError("permission-denied", "Not your source");
    }

    if (!source.apiConfig || source.apiConfig.provider !== "gocardless") {
      throw new HttpsError("failed-precondition", "Source is not a GoCardless connection");
    }

    const config = source.apiConfig;

    // Check if re-auth is required
    const expiresAt = config.agreementExpiresAt.toDate();
    if (expiresAt < new Date()) {
      throw new HttpsError("failed-precondition", "Bank connection expired. Please reconnect.");
    }

    try {
      const client = new GoCardlessClient(secretId, secretKey);
      await syncSourceTransactions(client, source, config);
      return { success: true };
    } catch (error) {
      console.error("Manual sync failed:", error);
      throw new HttpsError("internal", error instanceof Error ? error.message : "Sync failed");
    }
  }
);

// ============================================================================
// Re-auth Reminder Function
// ============================================================================

/**
 * Send reminders for bank connections about to expire
 * Runs daily at 9 AM
 */
export const sendReauthReminders = onSchedule(
  {
    schedule: "0 9 * * *",
    timeZone: "Europe/Vienna",
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 60,
  },
  async () => {
    console.log("Checking for bank connections needing re-auth...");

    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    // Get sources expiring within 7 days
    const sourcesSnapshot = await db
      .collection("sources")
      .where("type", "==", "api")
      .where("isActive", "==", true)
      .get();

    let reminders = 0;

    for (const sourceDoc of sourcesSnapshot.docs) {
      const source = sourceDoc.data() as TransactionSource;

      if (!source.apiConfig || source.apiConfig.provider !== "gocardless") {
        continue;
      }

      const expiresAt = source.apiConfig.agreementExpiresAt.toDate();

      // Check if expiring within 7 days but not already expired
      if (expiresAt > new Date() && expiresAt <= sevenDaysFromNow) {
        const daysRemaining = Math.ceil(
          (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );

        // Check if we already sent a reminder today
        const existingReminder = await db
          .collection("notifications")
          .where("userId", "==", source.userId)
          .where("sourceId", "==", sourceDoc.id)
          .where("type", "==", "bank_reauth_warning")
          .where("createdAt", ">=", Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000)))
          .limit(1)
          .get();

        if (existingReminder.empty) {
          await db.collection("notifications").add({
            userId: source.userId,
            type: "bank_reauth_warning",
            title: "Bank Connection Expiring Soon",
            message: `Your connection to ${source.apiConfig.institutionName} expires in ${daysRemaining} days. Please reconnect to continue syncing.`,
            sourceId: sourceDoc.id,
            read: false,
            createdAt: Timestamp.now(),
          });
          reminders++;
        }
      }
    }

    console.log(`Sent ${reminders} re-auth reminders`);
  }
);
