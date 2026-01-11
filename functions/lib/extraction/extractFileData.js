"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractFileData = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const params_1 = require("firebase-functions/params");
const firestore_2 = require("firebase-admin/firestore");
const extractionCore_1 = require("./extractionCore");
const anthropicApiKey = (0, params_1.defineSecret)("ANTHROPIC_API_KEY");
const db = (0, firestore_2.getFirestore)();
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
    console.log(`[${new Date().toISOString()}] Starting extraction for file: ${fileData.fileName} (${fileId})`);
    try {
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