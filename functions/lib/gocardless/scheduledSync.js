"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendReauthReminders = exports.triggerGoCardlessSync = exports.scheduledGoCardlessSync = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const params_1 = require("firebase-functions/params");
// Define secrets - must be set via Firebase CLI
const gocardlessSecretId = (0, params_1.defineSecret)("GOCARDLESS_SECRET_ID");
const gocardlessSecretKey = (0, params_1.defineSecret)("GOCARDLESS_SECRET_KEY");
const db = (0, firestore_1.getFirestore)();
const BASE_URL = "https://bankaccountdata.gocardless.com/api/v2";
// ============================================================================
// GoCardless API Client (simplified for Cloud Functions)
// ============================================================================
class GoCardlessClient {
    constructor(secretId, secretKey) {
        this.secretId = secretId;
        this.secretKey = secretKey;
        this.accessToken = null;
        this.tokenExpiresAt = null;
    }
    async getAccessToken() {
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
        return this.accessToken;
    }
    async getTransactions(accountId, dateFrom, dateTo) {
        const token = await this.getAccessToken();
        let path = `/accounts/${accountId}/transactions/`;
        const params = new URLSearchParams();
        if (dateFrom)
            params.set("date_from", dateFrom);
        if (dateTo)
            params.set("date_to", dateTo);
        if (params.toString())
            path += `?${params.toString()}`;
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
function normalizeIban(iban) {
    return iban.replace(/\s+/g, "").toUpperCase();
}
async function sha256(message) {
    const crypto = require("crypto");
    return crypto.createHash("sha256").update(message).digest("hex");
}
async function generateDedupeHash(date, amount, sourceIban, reference) {
    const dateStr = date.toISOString().split("T")[0];
    const amountStr = amount.toString();
    const ibanNormalized = normalizeIban(sourceIban);
    const refNormalized = (reference || "").trim().toUpperCase();
    const input = `${dateStr}|${amountStr}|${ibanNormalized}|${refNormalized}`;
    return sha256(input);
}
function buildTransactionName(gcTx) {
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
exports.scheduledGoCardlessSync = (0, scheduler_1.onSchedule)({
    schedule: "0 6 * * *",
    timeZone: "Europe/Vienna",
    region: "europe-west1",
    memory: "512MiB",
    timeoutSeconds: 540, // 9 minutes
    secrets: [gocardlessSecretId, gocardlessSecretKey],
}, async () => {
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
        const source = { id: sourceDoc.id, ...sourceDoc.data() };
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
                createdAt: firestore_1.Timestamp.now(),
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
        }
        catch (error) {
            console.error(`Error syncing source ${source.id}:`, error);
            errors++;
            // Update source with error
            await sourceDoc.ref.update({
                "apiConfig.lastSyncError": error instanceof Error ? error.message : "Unknown error",
                updatedAt: firestore_1.Timestamp.now(),
            });
        }
    }
    console.log(`Sync complete: ${synced} synced, ${skipped} skipped, ${errors} errors`);
});
/**
 * Sync transactions for a single source
 */
async function syncSourceTransactions(client, source, config) {
    console.log(`Syncing source ${source.id} (${config.institutionName})`);
    // Calculate date range
    const lastSync = config.lastSyncAt?.toDate();
    const dateFrom = lastSync
        ? new Date(lastSync.getTime() - 2 * 24 * 60 * 60 * 1000)
        : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const dateTo = new Date();
    // Fetch transactions
    const response = await client.getTransactions(config.accountId, dateFrom.toISOString().split("T")[0], dateTo.toISOString().split("T")[0]);
    const bookedTransactions = response.transactions.booked || [];
    console.log(`Fetched ${bookedTransactions.length} transactions for source ${source.id}`);
    if (bookedTransactions.length === 0) {
        // Update lastSyncAt even if no transactions
        await db.collection("sources").doc(source.id).update({
            "apiConfig.lastSyncAt": firestore_1.Timestamp.now(),
            "apiConfig.lastSyncError": null,
            updatedAt: firestore_1.Timestamp.now(),
        });
        return;
    }
    // Transform and deduplicate
    const syncJobId = `sync_${source.id}_${Date.now()}`;
    const now = firestore_1.Timestamp.now();
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
            date: firestore_1.Timestamp.fromDate(date),
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
        "apiConfig.lastSyncAt": firestore_1.Timestamp.now(),
        "apiConfig.lastSyncError": null,
        updatedAt: firestore_1.Timestamp.now(),
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
            createdAt: firestore_1.Timestamp.now(),
        });
    }
}
// ============================================================================
// Manual Sync Function (callable)
// ============================================================================
/**
 * Manually trigger sync for a specific source
 */
exports.triggerGoCardlessSync = (0, https_1.onCall)({
    region: "europe-west1",
    memory: "512MiB",
    timeoutSeconds: 120,
    secrets: [gocardlessSecretId, gocardlessSecretKey],
}, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be logged in");
    }
    const userId = request.auth.uid;
    const { sourceId } = request.data;
    if (!sourceId) {
        throw new https_1.HttpsError("invalid-argument", "sourceId is required");
    }
    const secretId = gocardlessSecretId.value();
    const secretKey = gocardlessSecretKey.value();
    if (!secretId || !secretKey) {
        throw new https_1.HttpsError("failed-precondition", "GoCardless not configured");
    }
    // Get source and verify ownership
    const sourceDoc = await db.collection("sources").doc(sourceId).get();
    if (!sourceDoc.exists) {
        throw new https_1.HttpsError("not-found", "Source not found");
    }
    const source = { id: sourceDoc.id, ...sourceDoc.data() };
    if (source.userId !== userId) {
        throw new https_1.HttpsError("permission-denied", "Not your source");
    }
    if (!source.apiConfig || source.apiConfig.provider !== "gocardless") {
        throw new https_1.HttpsError("failed-precondition", "Source is not a GoCardless connection");
    }
    const config = source.apiConfig;
    // Check if re-auth is required
    const expiresAt = config.agreementExpiresAt.toDate();
    if (expiresAt < new Date()) {
        throw new https_1.HttpsError("failed-precondition", "Bank connection expired. Please reconnect.");
    }
    try {
        const client = new GoCardlessClient(secretId, secretKey);
        await syncSourceTransactions(client, source, config);
        return { success: true };
    }
    catch (error) {
        console.error("Manual sync failed:", error);
        throw new https_1.HttpsError("internal", error instanceof Error ? error.message : "Sync failed");
    }
});
// ============================================================================
// Re-auth Reminder Function
// ============================================================================
/**
 * Send reminders for bank connections about to expire
 * Runs daily at 9 AM
 */
exports.sendReauthReminders = (0, scheduler_1.onSchedule)({
    schedule: "0 9 * * *",
    timeZone: "Europe/Vienna",
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 60,
}, async () => {
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
        const source = sourceDoc.data();
        if (!source.apiConfig || source.apiConfig.provider !== "gocardless") {
            continue;
        }
        const expiresAt = source.apiConfig.agreementExpiresAt.toDate();
        // Check if expiring within 7 days but not already expired
        if (expiresAt > new Date() && expiresAt <= sevenDaysFromNow) {
            const daysRemaining = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            // Check if we already sent a reminder today
            const existingReminder = await db
                .collection("notifications")
                .where("userId", "==", source.userId)
                .where("sourceId", "==", sourceDoc.id)
                .where("type", "==", "bank_reauth_warning")
                .where("createdAt", ">=", firestore_1.Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000)))
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
                    createdAt: firestore_1.Timestamp.now(),
                });
                reminders++;
            }
        }
    }
    console.log(`Sent ${reminders} re-auth reminders`);
});
//# sourceMappingURL=scheduledSync.js.map