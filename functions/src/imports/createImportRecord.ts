/**
 * Create an import record after transaction import completes
 */

import { Timestamp } from "firebase-admin/firestore";
import { createCallable, HttpsError } from "../utils/createCallable";

interface FieldMapping {
  csvColumn: string;
  targetField: string | null;
  confidence: number;
  userConfirmed: boolean;
  keepAsMetadata: boolean;
  format?: string | null;
}

interface ParseOptions {
  delimiter?: string;
  encoding?: string;
  hasHeader?: boolean;
  skipRows?: number;
}

interface CreateImportRecordRequest {
  importJobId: string;
  sourceId: string;
  fileName: string;
  importedCount: number;
  skippedCount: number;
  errorCount: number;
  totalRows: number;
  csvStoragePath?: string | null;
  csvDownloadUrl?: string | null;
  parseOptions?: ParseOptions | null;
  fieldMappings?: FieldMapping[] | null;
}

interface CreateImportRecordResponse {
  success: boolean;
  importId: string;
}

export const createImportRecordCallable = createCallable<
  CreateImportRecordRequest,
  CreateImportRecordResponse
>(
  { name: "createImportRecord" },
  async (ctx, request) => {
    const {
      importJobId,
      sourceId,
      fileName,
      importedCount,
      skippedCount,
      errorCount,
      totalRows,
      csvStoragePath,
      csvDownloadUrl,
      parseOptions,
      fieldMappings,
    } = request;

    if (!importJobId || !sourceId || !fileName) {
      throw new HttpsError(
        "invalid-argument",
        "importJobId, sourceId, and fileName are required"
      );
    }

    // Verify source ownership
    const sourceRef = ctx.db.collection("sources").doc(sourceId);
    const sourceSnap = await sourceRef.get();

    if (!sourceSnap.exists) {
      throw new HttpsError("not-found", "Source not found");
    }

    if (sourceSnap.data()!.userId !== ctx.userId) {
      throw new HttpsError("permission-denied", "Source access denied");
    }

    // Create the import record
    const importDocRef = ctx.db.collection("imports").doc(importJobId);

    const importRecordData = {
      sourceId,
      fileName,
      importedCount: importedCount || 0,
      skippedCount: skippedCount || 0,
      errorCount: errorCount || 0,
      totalRows: totalRows || 0,
      userId: ctx.userId,
      createdAt: Timestamp.now(),
      // CSV storage fields - use null for queryability
      csvStoragePath: csvStoragePath ?? null,
      csvDownloadUrl: csvDownloadUrl ?? null,
      // Parse options and mappings for re-mapping feature
      parseOptions: parseOptions ?? null,
      fieldMappings: fieldMappings ?? null,
    };

    await importDocRef.set(importRecordData);

    console.log(`[createImportRecord] Created import record ${importJobId}`, {
      userId: ctx.userId,
      sourceId,
      importedCount,
      skippedCount,
      errorCount,
    });

    return {
      success: true,
      importId: importJobId,
    };
  }
);
