import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { callVisionAPI } from "./visionApi";
import { parseWithClaude } from "./claudeParser";
import { mapFieldsToBoundingBoxes } from "./boundingBoxMapper";

const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");
const db = getFirestore();

/**
 * Triggered when a new file document is created in Firestore
 * Extracts text and structured data from the file using:
 * 1. Google Cloud Vision API for OCR
 * 2. Claude Haiku for structured field extraction
 */
export const extractFileData = onDocumentCreated(
  {
    document: "files/{fileId}",
    region: "europe-west1",
    timeoutSeconds: 120,
    memory: "512MiB",
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

    console.log(`Starting extraction for file: ${fileData.fileName} (${fileId})`);

    try {
      // 1. Download file from Firebase Storage
      const storagePath = fileData.storagePath;
      if (!storagePath) {
        throw new Error("No storage path found for file");
      }

      const storage = getStorage();
      const bucket = storage.bucket();
      const file = bucket.file(storagePath);

      const [fileBuffer] = await file.download();
      console.log(`Downloaded file: ${fileBuffer.length} bytes`);

      // 2. Call Google Cloud Vision API for OCR
      console.log("Calling Vision API...");
      const ocrResult = await callVisionAPI(fileBuffer, fileData.fileType);
      console.log(`OCR complete: ${ocrResult.text.length} chars, ${ocrResult.blocks.length} blocks`);

      if (!ocrResult.text || ocrResult.text.trim().length === 0) {
        throw new Error("No text extracted from document");
      }

      // 3. Call Claude Haiku to parse extracted text
      console.log("Calling Claude Haiku for parsing...");
      const extracted = await parseWithClaude(ocrResult.text, anthropicApiKey.value());
      console.log(`Extraction complete:`, {
        date: extracted.date,
        amount: extracted.amount,
        currency: extracted.currency,
        vatPercent: extracted.vatPercent,
        partner: extracted.partner,
        vatId: extracted.vatId,
        iban: extracted.iban,
        address: extracted.address,
        confidence: extracted.confidence,
      });

      // 4. Map extracted fields to bounding boxes
      const fieldsWithLocations = mapFieldsToBoundingBoxes(extracted, ocrResult.blocks);
      console.log(`Mapped ${fieldsWithLocations.length} fields to bounding boxes`);

      // 5. Update Firestore document with extracted data
      const updateData: Record<string, unknown> = {
        extractedText: ocrResult.text,
        extractionConfidence: Math.round(extracted.confidence * 100),
        extractionComplete: true,
        extractionError: null,
        extractedFields: fieldsWithLocations,
        updatedAt: Timestamp.now(),
      };

      // Add extracted fields if found
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

      await db.collection("files").doc(fileId).update(updateData);
      console.log(`File ${fileId} extraction complete`);
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
