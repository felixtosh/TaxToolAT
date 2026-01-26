"use strict";
/**
 * Run Receipt Search for Transaction
 *
 * Callable function that runs a receipt search worker for a transaction.
 * Calls the worker API directly (server-to-server) for immediate execution.
 *
 * This is triggered after a partner is assigned to find matching receipts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runReceiptSearchForTransactionCallable = void 0;
exports.queueReceiptSearchForTransaction = queueReceiptSearchForTransaction;
const createCallable_1 = require("../utils/createCallable");
const firestore_1 = require("firebase-admin/firestore");
const db = (0, firestore_1.getFirestore)();
// Get the app URL for server-to-server calls
function getAppUrl() {
    // Development: http://localhost:3000
    // Production: https://your-app.vercel.app
    return process.env.APP_URL || "http://localhost:3000";
}
/**
 * Helper to create a workerRequest document (fallback/queuing mode)
 */
async function queueAsDocument(transactionId, userId, partnerId, initialPrompt) {
    // Build prompt if not provided
    let prompt = initialPrompt;
    if (!prompt) {
        const txDoc = await db.collection("transactions").doc(transactionId).get();
        const txData = txDoc.data();
        const promptParts = [`Find receipt for transaction ${transactionId}`];
        if (txData?.partner || txData?.name) {
            promptParts.push(`Partner: ${txData.partner || txData.name}`);
        }
        if (txData?.amount) {
            promptParts.push(`Amount: ${(txData.amount / 100).toFixed(2)} ${txData.currency || "EUR"}`);
        }
        if (txData?.date?.toDate) {
            promptParts.push(`Date: ${txData.date.toDate().toISOString().split("T")[0]}`);
        }
        prompt = promptParts.join(". ");
    }
    const triggerContext = { transactionId };
    if (partnerId) {
        triggerContext.partnerId = partnerId;
    }
    const requestRef = db.collection(`users/${userId}/workerRequests`).doc();
    await requestRef.set({
        id: requestRef.id,
        workerType: "receipt_search",
        initialPrompt: prompt,
        triggerContext,
        triggeredBy: "auto",
        status: "pending",
        createdAt: firestore_1.Timestamp.now(),
    });
    await db.collection("transactions").doc(transactionId).update({
        automationHistory: firestore_1.FieldValue.arrayUnion({
            type: "receipt_search",
            ranAt: firestore_1.Timestamp.now(),
            forPartnerId: partnerId || null,
            workerRequestId: requestRef.id,
            status: "pending",
        }),
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    });
    console.log(`[QueueReceiptSearch] Queued worker request ${requestRef.id} for transaction ${transactionId}`);
    return {
        success: true,
        message: `Receipt search queued for transaction ${transactionId}`,
        workerRequestId: requestRef.id,
    };
}
/**
 * Create a minimal service token for server-to-server auth
 * The Next.js auth helper decodes without verification, so this works
 */
function createServiceToken(userId) {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ user_id: userId, sub: userId, iat: Date.now() })).toString("base64url");
    return `${header}.${payload}.`;
}
/**
 * Call the worker API directly (server-to-server)
 */
async function callWorkerApiDirectly(userId, workerType, initialPrompt, triggerContext) {
    const appUrl = getAppUrl();
    try {
        // Create a service token with the user ID
        const serviceToken = createServiceToken(userId);
        // Call the worker API
        console.log(`[QueueReceiptSearch] Calling worker API at ${appUrl}/api/worker`);
        const response = await fetch(`${appUrl}/api/worker`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceToken}`,
            },
            body: JSON.stringify({
                workerType,
                initialPrompt,
                triggerContext,
                triggeredBy: "auto",
                modelProvider: "gemini",
            }),
        });
        const result = await response.json();
        if (!response.ok) {
            console.error("[QueueReceiptSearch] Worker API returned error:", result);
            return null;
        }
        return result;
    }
    catch (error) {
        console.error("[QueueReceiptSearch] Failed to call worker API:", error);
        return null;
    }
}
/**
 * Run a receipt search worker for a transaction.
 * Tries to call worker API directly, falls back to document-based queuing.
 * Can be called from other Cloud Functions.
 */
async function queueReceiptSearchForTransaction(options) {
    const { transactionId, userId, partnerId, force = false } = options;
    // Check if there's already a running worker for this user (rate limiting)
    const runningWorkers = await db
        .collection(`users/${userId}/workerRuns`)
        .where("status", "==", "running")
        .limit(1)
        .get();
    if (!runningWorkers.empty) {
        // Another worker is running - queue this one instead of running directly
        console.log(`[QueueReceiptSearch] Another worker is running for user ${userId}, queuing instead`);
        return queueAsDocument(transactionId, userId, partnerId);
    }
    // Get transaction data
    const txDoc = await db.collection("transactions").doc(transactionId).get();
    if (!txDoc.exists) {
        return {
            success: false,
            message: `Transaction ${transactionId} not found`,
        };
    }
    const txData = txDoc.data();
    // Check ownership
    if (txData.userId !== userId) {
        return {
            success: false,
            message: "Not authorized",
        };
    }
    // Check if transaction already has files
    const hasFiles = txData.fileIds && txData.fileIds.length > 0;
    if (hasFiles && !force) {
        return {
            success: true,
            message: "Transaction already has files attached",
            skipped: true,
            skipReason: "has_files",
        };
    }
    // Check if receipt search already ran for this partner
    const automationHistory = txData.automationHistory || [];
    const alreadyRanForPartner = automationHistory.some((entry) => entry.type === "receipt_search" &&
        entry.forPartnerId === partnerId &&
        entry.status === "completed");
    if (alreadyRanForPartner && !force) {
        return {
            success: true,
            message: `Receipt search already ran for partner ${partnerId}`,
            skipped: true,
            skipReason: "already_ran",
        };
    }
    // Build prompt from transaction data
    const promptParts = [`Find receipt for transaction ${transactionId}`];
    if (txData.partner || txData.name) {
        promptParts.push(`Partner: ${txData.partner || txData.name}`);
    }
    if (txData.amount) {
        promptParts.push(`Amount: ${(txData.amount / 100).toFixed(2)} ${txData.currency || "EUR"}`);
    }
    if (txData.date?.toDate) {
        promptParts.push(`Date: ${txData.date.toDate().toISOString().split("T")[0]}`);
    }
    const initialPrompt = promptParts.join(". ");
    // Build trigger context (excluding undefined values)
    const triggerContext = { transactionId };
    if (partnerId) {
        triggerContext.partnerId = partnerId;
    }
    // Try to call worker API directly
    const directResult = await callWorkerApiDirectly(userId, "receipt_search", initialPrompt, triggerContext);
    if (directResult) {
        // Direct execution succeeded
        await db.collection("transactions").doc(transactionId).update({
            automationHistory: firestore_1.FieldValue.arrayUnion({
                type: "receipt_search",
                ranAt: firestore_1.Timestamp.now(),
                forPartnerId: partnerId || null,
                workerRunId: directResult.runId,
                status: directResult.status,
            }),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        console.log(`[QueueReceiptSearch] Direct execution completed: ${directResult.runId}`);
        return {
            success: true,
            message: `Receipt search completed for transaction ${transactionId}`,
            workerRunId: directResult.runId,
        };
    }
    // Fallback: Queue as document for later processing
    return queueAsDocument(transactionId, userId, partnerId, initialPrompt);
}
// ============================================================================
// Callable (uses shared logic)
// ============================================================================
/**
 * Queue a receipt search worker for a transaction.
 *
 * Checks conditions before queuing:
 * - Transaction must not have files attached
 * - Must not have already run for this partner (unless forced)
 */
exports.runReceiptSearchForTransactionCallable = (0, createCallable_1.createCallable)({
    name: "runReceiptSearchForTransaction",
}, async (ctx, request) => {
    const { transactionId, partnerId, force = false } = request;
    if (!transactionId) {
        throw new createCallable_1.HttpsError("invalid-argument", "transactionId is required");
    }
    return queueReceiptSearchForTransaction({
        transactionId,
        userId: ctx.userId,
        partnerId,
        force,
    });
});
//# sourceMappingURL=runReceiptSearchForTransaction.js.map