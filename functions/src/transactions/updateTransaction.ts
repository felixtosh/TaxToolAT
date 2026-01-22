/**
 * Update a single transaction
 */

import { FieldValue } from "firebase-admin/firestore";
import { createCallable, HttpsError } from "../utils/createCallable";

interface UpdateTransactionRequest {
  /** Transaction ID to update */
  id: string;
  /** Fields to update */
  data: {
    description?: string | null;
    fileIds?: string[];
    isComplete?: boolean;
    partnerId?: string | null;
    partnerType?: "global" | "user" | null;
    partnerMatchConfidence?: number | null;
    partnerMatchedBy?: "auto" | "manual" | "ai" | "suggestion" | null;
    noReceiptCategoryId?: string | null;
    noReceiptCategoryTemplateId?: string | null;
    noReceiptCategoryMatchedBy?: "manual" | "suggestion" | "auto" | null;
    noReceiptCategoryConfidence?: number | null;
    receiptLostEntry?: {
      reason: string;
      description?: string;
      estimatedAmount?: number;
      dateRecorded: string;
    } | null;
    rejectedFileIds?: string[];
    aiSearchQueries?: string[] | null;
    aiSearchQueriesForPartnerId?: string | null;
    // Tax fields
    vatRate?: number | null;
    vatAmount?: number | null;
    isEuTransaction?: boolean | null;
    isReverseCharge?: boolean | null;
  };
}

interface UpdateTransactionResponse {
  success: boolean;
}

export const updateTransactionCallable = createCallable<
  UpdateTransactionRequest,
  UpdateTransactionResponse
>(
  { name: "updateTransaction" },
  async (ctx, request) => {
    const { id, data } = request;

    if (!id) {
      throw new HttpsError("invalid-argument", "Transaction ID is required");
    }

    // Verify ownership
    const transactionRef = ctx.db.collection("transactions").doc(id);
    const transactionSnap = await transactionRef.get();

    if (!transactionSnap.exists) {
      throw new HttpsError("not-found", "Transaction not found");
    }

    const transactionData = transactionSnap.data();
    if (transactionData?.userId !== ctx.userId) {
      throw new HttpsError("permission-denied", "Access denied");
    }

    // Build update object, filtering out undefined values
    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        updateData[key] = value;
      }
    }

    // Always update timestamp
    updateData.updatedAt = FieldValue.serverTimestamp();

    await transactionRef.update(updateData);

    console.log(`[updateTransaction] Updated transaction ${id}`, {
      userId: ctx.userId,
      fields: Object.keys(updateData),
    });

    return { success: true };
  }
);
