import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { mapFieldsToBoundingBoxes } from "./boundingBoxMapper";
import {
  extractDocument,
  getDefaultProvider,
  generateTextBlocks,
} from "./documentExtractor";

const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");
// Note: Gemini uses Vertex AI with service account auth (no API key needed)
const db = getFirestore();

/**
 * Triggered when a new file document is created in Firestore
 * Extracts text and structured data from the file using:
 *
 * Provider options (set EXTRACTION_PROVIDER env var):
 * - "vision-claude": Google Cloud Vision API for OCR + Claude Haiku for parsing
 * - "gemini": Gemini Flash for native PDF vision + extraction
 */
export const extractFileData = onDocumentCreated(
  {
    document: "files/{fileId}",
    region: "europe-west1",
    timeoutSeconds: 120,
    memory: "512MiB",
    secrets: [anthropicApiKey], // Only needed if using vision-claude provider
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

    const t0 = Date.now();
    console.log(`[${new Date().toISOString()}] Starting extraction for file: ${fileData.fileName} (${fileId})`);

    try {
      // 1. Download file from Firebase Storage
      const storagePath = fileData.storagePath;
      if (!storagePath) {
        throw new Error("No storage path found for file");
      }

      const storage = getStorage();
      const bucket = storage.bucket();
      const file = bucket.file(storagePath);

      const t1 = Date.now();
      const [fileBuffer] = await file.download();
      const t2 = Date.now();
      console.log(`[+${t2 - t0}ms] Downloaded file: ${fileBuffer.length} bytes (download took ${t2 - t1}ms)`);

      // 2. Extract text and structured data using configured provider
      const provider = getDefaultProvider();
      const geminiModel = process.env.GEMINI_MODEL || "gemini-2.0-flash-lite-001";
      console.log(`[+${Date.now() - t0}ms] Starting ${provider} extraction (model: ${geminiModel})`);

      const t3 = Date.now();
      const result = await extractDocument(fileBuffer, fileData.fileType, {
        provider,
        anthropicApiKey: anthropicApiKey.value(), // Only used if provider is vision-claude
        geminiModel,
      });
      const t4 = Date.now();

      console.log(`[+${t4 - t0}ms] Extraction complete (${result.provider}) - API took ${t4 - t3}ms`, {
        textLength: result.text.length,
        date: result.extracted.date,
        amount: result.extracted.amount,
        partner: result.extracted.partner,
        confidence: result.extracted.confidence,
      });

      // 3. Map extracted fields to bounding boxes
      // For Gemini, generate simple text blocks for search (no positional data)
      const t5 = Date.now();
      const blocksForMapping = result.blocks.length > 0
        ? result.blocks
        : generateTextBlocks(result.text);
      const fieldsWithLocations = mapFieldsToBoundingBoxes(result.extracted, blocksForMapping);
      console.log(`[+${Date.now() - t0}ms] Mapped ${fieldsWithLocations.length} fields (took ${Date.now() - t5}ms)`);

      // 4. Update Firestore document with extracted data
      const updateData: Record<string, unknown> = {
        extractedText: result.text,
        extractionConfidence: Math.round(result.extracted.confidence * 100),
        extractionProvider: result.provider, // Track which provider was used
        extractionComplete: true,
        extractionError: null,
        extractedFields: fieldsWithLocations,
        updatedAt: Timestamp.now(),
      };

      // Add extracted fields if found
      const extracted = result.extracted;
      if (extracted.date) {
        // Parse ISO date string to Timestamp
        const dateParts = extracted.date.split("-");
        if (dateParts.length === 3) {
          const date = new Date(
            parseInt(dateParts[0]),
            parseInt(dateParts[1]) - 1,
            parseInt(dateParts[2])
          );
          updateData.extractedDate = Timestamp.fromDate(date);
        }
      }

      if (extracted.amount !== null) {
        updateData.extractedAmount = extracted.amount;
      }

      if (extracted.currency) {
        updateData.extractedCurrency = extracted.currency;
      }

      if (extracted.vatPercent !== null) {
        updateData.extractedVatPercent = extracted.vatPercent;
      }

      if (extracted.partner) {
        updateData.extractedPartner = extracted.partner;
      }

      if (extracted.vatId) {
        updateData.extractedVatId = extracted.vatId;
      }

      if (extracted.iban) {
        updateData.extractedIban = extracted.iban;
      }

      if (extracted.address) {
        updateData.extractedAddress = extracted.address;
      }

      const t6 = Date.now();
      await db.collection("files").doc(fileId).update(updateData);
      const tEnd = Date.now();
      console.log(`[+${tEnd - t0}ms] DONE - Firestore write took ${tEnd - t6}ms | Total: ${tEnd - t0}ms`);
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
