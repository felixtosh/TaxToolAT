import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { runExtraction } from "./extractionCore";

const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");
const db = getFirestore();

/**
 * Triggered when a new file document is created in Firestore.
 * Extracts text and structured data from the file using the configured provider.
 */
export const extractFileData = onDocumentCreated(
  {
    document: "files/{fileId}",
    region: "europe-west1",
    timeoutSeconds: 120,
    memory: "512MiB",
    maxInstances: 10, // Limit concurrency to prevent Gemini API rate limits
    secrets: [anthropicApiKey],
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

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

      await runExtraction(fileId, fileData, {
        anthropicApiKey: anthropicApiKey.value(),
        skipClassification: false,
      });
    } catch (error) {
      console.error(`Extraction failed for file ${fileId}:`, error);

      // Update document with error
      await db.collection("files").doc(fileId).update({
        extractionComplete: true,
        extractionError: error instanceof Error ? error.message : "Unknown extraction error",
        updatedAt: Timestamp.now(),
      });
    }
  }
);
