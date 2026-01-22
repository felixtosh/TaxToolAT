/**
 * Remove partner assignment from a transaction
 */

import { FieldValue } from "firebase-admin/firestore";
import { createCallable, HttpsError } from "../utils/createCallable";

interface RemovePartnerFromTransactionRequest {
  transactionId: string;
}

interface RemovePartnerFromTransactionResponse {
  success: boolean;
}

export const removePartnerFromTransactionCallable = createCallable<
  RemovePartnerFromTransactionRequest,
  RemovePartnerFromTransactionResponse
>(
  { name: "removePartnerFromTransaction" },
  async (ctx, request) => {
    const { transactionId } = request;

    if (!transactionId) {
      throw new HttpsError("invalid-argument", "transactionId is required");
    }

    // Verify transaction ownership
    const transactionRef = ctx.db.collection("transactions").doc(transactionId);
    const transactionSnap = await transactionRef.get();

    if (!transactionSnap.exists) {
      throw new HttpsError("not-found", "Transaction not found");
    }

    const txData = transactionSnap.data()!;
    if (txData.userId !== ctx.userId) {
      throw new HttpsError("permission-denied", "Access denied");
    }

    // Clear partner assignment
    await transactionRef.update({
      partnerId: null,
      partnerType: null,
      partnerMatchedBy: null,
      partnerMatchConfidence: null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    console.log(`[removePartnerFromTransaction] Removed partner from transaction ${transactionId}`, {
      userId: ctx.userId,
    });

    return { success: true };
  }
);
