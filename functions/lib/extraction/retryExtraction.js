"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retryFileExtraction = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const firestore_1 = require("firebase-admin/firestore");
const extractionCore_1 = require("./extractionCore");
const anthropicApiKey = (0, params_1.defineSecret)("ANTHROPIC_API_KEY");
const db = (0, firestore_1.getFirestore)();
/**
 * Callable function to retry extraction for a file.
 * Used for:
 * - Files with extraction errors
 * - Files user marked as invoice (overriding AI classification)
 */
exports.retryFileExtraction = (0, https_1.onCall)({
    region: "europe-west1",
    timeoutSeconds: 120,
    memory: "512MiB",
    secrets: [anthropicApiKey],
}, async (request) => {
    const { fileId, force } = request.data;
    if (!fileId || typeof fileId !== "string") {
        throw new https_1.HttpsError("invalid-argument", "fileId is required");
    }
    // Get file document
    const fileDoc = await db.collection("files").doc(fileId).get();
    if (!fileDoc.exists) {
        throw new https_1.HttpsError("not-found", "File not found");
    }
    const fileData = fileDoc.data();
    // Allow retry for files with errors OR files user marked as invoice
    const hasError = !!fileData.extractionError;
    const wasNotInvoice = fileData.isNotInvoice === true;
    const userMarkedAsInvoice = fileData.isNotInvoice === false && !hasError;
    // Force re-extraction bypasses all checks (used to upgrade old files to new dual-entity extraction)
    const canRetry = force === true || hasError || wasNotInvoice || userMarkedAsInvoice;
    if (!canRetry && fileData.extractionComplete) {
        throw new https_1.HttpsError("failed-precondition", "File has already been extracted successfully");
    }
    // User override means they clicked "Mark as Invoice" - skip classification
    const isUserOverride = wasNotInvoice || userMarkedAsInvoice;
    const reason = force === true
        ? "force re-extraction (upgrade to dual-entity)"
        : hasError
            ? "error retry"
            : "user override (marked as invoice)";
    console.log(`[${new Date().toISOString()}] Retrying extraction for file: ${fileData.fileName} (${fileId}) - ${reason}`);
    // Reset extraction status and clear not-invoice flag
    // Also reset partner/transaction matching so they re-run after extraction
    const resetData = {
        extractionComplete: false,
        extractionError: null,
        isNotInvoice: null,
        notInvoiceReason: null,
        // Reset partner matching so it re-runs after extraction
        partnerMatchComplete: false,
        partnerMatchedAt: null,
        partnerSuggestions: [],
        // Reset transaction matching (cascades from partner matching)
        transactionMatchComplete: false,
        transactionMatchedAt: null,
        transactionSuggestions: [],
        updatedAt: firestore_1.Timestamp.now(),
    };
    // Clear previous auto-match (but preserve manual assignments)
    if (fileData.partnerMatchedBy !== "manual") {
        resetData.partnerId = null;
        resetData.partnerType = null;
        resetData.partnerMatchedBy = null;
        resetData.partnerMatchConfidence = null;
    }
    await db.collection("files").doc(fileId).update(resetData);
    try {
        const result = await (0, extractionCore_1.runExtraction)(fileId, fileData, {
            anthropicApiKey: anthropicApiKey.value(),
            skipClassification: isUserOverride,
        });
        console.log(`Retry extraction completed successfully in ${result.duration}ms`);
        return result;
    }
    catch (error) {
        console.error(`Retry extraction failed for file ${fileId}:`, error);
        // Update document with error
        await db.collection("files").doc(fileId).update({
            extractionComplete: true,
            extractionError: error instanceof Error ? error.message : "Unknown extraction error",
            updatedAt: firestore_1.Timestamp.now(),
        });
        throw new https_1.HttpsError("internal", error instanceof Error ? error.message : "Extraction failed");
    }
});
//# sourceMappingURL=retryExtraction.js.map