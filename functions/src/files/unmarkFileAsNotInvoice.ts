/**
 * Unmark a file as "not an invoice" (restore as invoice)
 * Triggers re-extraction while preserving manually-set partner and transactions.
 */

import { FieldValue } from "firebase-admin/firestore";
import { createCallable, HttpsError } from "../utils/createCallable";

interface UnmarkFileAsNotInvoiceRequest {
  fileId: string;
}

interface UnmarkFileAsNotInvoiceResponse {
  success: boolean;
}

export const unmarkFileAsNotInvoiceCallable = createCallable<
  UnmarkFileAsNotInvoiceRequest,
  UnmarkFileAsNotInvoiceResponse
>(
  { name: "unmarkFileAsNotInvoice" },
  async (ctx, request) => {
    const { fileId } = request;

    if (!fileId) {
      throw new HttpsError("invalid-argument", "fileId is required");
    }

    const fileRef = ctx.db.collection("files").doc(fileId);
    const fileSnap = await fileRef.get();

    if (!fileSnap.exists) {
      throw new HttpsError("not-found", "File not found");
    }

    const fileData = fileSnap.data()!;
    if (fileData.userId !== ctx.userId) {
      throw new HttpsError("permission-denied", "Access denied");
    }

    // Build update object
    const updates: Record<string, unknown> = {
      isNotInvoice: false,
      notInvoiceReason: null,
      // Skip classification - user has confirmed it's an invoice
      classificationComplete: true,
      // Reset extraction to trigger re-extraction
      extractionComplete: false,
      extractionError: null,
      updatedAt: FieldValue.serverTimestamp(),
    };

    // Only reset partner if NOT manually set (preserve user's intentional choice)
    if (fileData.partnerMatchedBy !== "manual") {
      updates.partnerId = null;
      updates.partnerType = null;
      updates.partnerMatchedBy = null;
      updates.partnerMatchConfidence = null;
      updates.partnerMatchComplete = false;
      updates.partnerSuggestions = [];
    }

    // Check for manual transaction connections before resetting transaction matching
    const connectionsQuery = await ctx.db
      .collection("fileConnections")
      .where("fileId", "==", fileId)
      .where("connectionType", "==", "manual")
      .get();

    // Only reset transaction matching if no manual connections exist
    if (connectionsQuery.empty) {
      updates.transactionMatchComplete = false;
      updates.transactionSuggestions = [];
    }

    await fileRef.update(updates);

    console.log(`[unmarkFileAsNotInvoice] Unmarked file ${fileId} as invoice`, {
      userId: ctx.userId,
    });

    return { success: true };
  }
);
