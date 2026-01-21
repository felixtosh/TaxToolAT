"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractFileData = exports.extractFileDataOnUndelete = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const params_1 = require("firebase-functions/params");
const firestore_2 = require("firebase-admin/firestore");
const extractionCore_1 = require("./extractionCore");
const anthropicApiKey = (0, params_1.defineSecret)("ANTHROPIC_API_KEY");
const db = (0, firestore_2.getFirestore)();
/**
 * Triggered when a file document is updated.
 * Re-runs extraction when:
 * - File was undeleted (deletedAt went from non-null to null)
 * - extractionComplete is false
 */
exports.extractFileDataOnUndelete = (0, firestore_1.onDocumentUpdated)({
    document: "files/{fileId}",
    region: "europe-west1",
    timeoutSeconds: 120,
    memory: "512MiB",
    maxInstances: 10,
    secrets: [anthropicApiKey],
}, async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after)
        return;
    const fileId = event.params.fileId;
    // Check if this is an undelete operation
    const wasDeleted = !!before.deletedAt;
    const isNowNotDeleted = !after.deletedAt;
    const needsExtraction = !after.extractionComplete;
    if (wasDeleted && isNowNotDeleted && needsExtraction) {
        console.log(`[${new Date().toISOString()}] File ${fileId} was undeleted, starting extraction`);
        try {
            await (0, extractionCore_1.runExtraction)(fileId, after, {
                anthropicApiKey: anthropicApiKey.value(),
                skipClassification: false,
            });
        }
        catch (error) {
            console.error(`Extraction failed for undeleted file ${fileId}:`, error);
            await db.collection("files").doc(fileId).update({
                extractionComplete: true,
                extractionError: error instanceof Error ? error.message : "Unknown extraction error",
                updatedAt: firestore_2.Timestamp.now(),
            });
        }
    }
});
/**
 * Triggered when a new file document is created in Firestore.
 * Extracts text and structured data from the file using the configured provider.
 */
exports.extractFileData = (0, firestore_1.onDocumentCreated)({
    document: "files/{fileId}",
    region: "europe-west1",
    timeoutSeconds: 120,
    memory: "512MiB",
    maxInstances: 10, // Limit concurrency to prevent Gemini API rate limits
    secrets: [anthropicApiKey],
}, async (event) => {
    const snapshot = event.data;
    if (!snapshot)
        return;
    const fileId = event.params.fileId;
    const fileData = snapshot.data();
    // Skip if already processed
    if (fileData.extractionComplete) {
        console.log(`File ${fileId} already processed, skipping`);
        return;
    }
    if (fileData.deletedAt) {
        console.log(`File ${fileId} is soft-deleted, skipping extraction`);
        return;
    }
    console.log(`[${new Date().toISOString()}] Starting extraction for file: ${fileData.fileName} (${fileId})`);
    try {
        const latestDoc = await db.collection("files").doc(fileId).get();
        if (latestDoc.exists && latestDoc.data()?.deletedAt) {
            console.log(`File ${fileId} was soft-deleted before extraction, skipping`);
            return;
        }
        await (0, extractionCore_1.runExtraction)(fileId, fileData, {
            anthropicApiKey: anthropicApiKey.value(),
            skipClassification: false,
        });
    }
    catch (error) {
        console.error(`Extraction failed for file ${fileId}:`, error);
        // Update document with error
        await db.collection("files").doc(fileId).update({
            extractionComplete: true,
            extractionError: error instanceof Error ? error.message : "Unknown extraction error",
            updatedAt: firestore_2.Timestamp.now(),
        });
    }
});
//# sourceMappingURL=extractFileData.js.map