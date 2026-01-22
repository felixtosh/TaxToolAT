/**
 * Remove a file from a transaction's rejected list
 * Allows the file to be auto-matched to this transaction again
 */

import { FieldValue } from "firebase-admin/firestore";
import { createCallable, HttpsError } from "../utils/createCallable";

interface UnrejectFileFromTransactionRequest {
  fileId: string;
  transactionId: string;
}

interface UnrejectFileFromTransactionResponse {
  success: boolean;
}

export const unrejectFileFromTransactionCallable = createCallable<
  UnrejectFileFromTransactionRequest,
  UnrejectFileFromTransactionResponse
>(
  { name: "unrejectFileFromTransaction" },
  async (ctx, request) => {
    const { fileId, transactionId } = request;

    if (!fileId) {
      throw new HttpsError("invalid-argument", "fileId is required");
    }
    if (!transactionId) {
      throw new HttpsError("invalid-argument", "transactionId is required");
    }

    // Verify transaction exists and belongs to user
    const transactionRef = ctx.db.collection("transactions").doc(transactionId);
    const transactionSnap = await transactionRef.get();

    if (!transactionSnap.exists) {
      throw new HttpsError("not-found", "Transaction not found");
    }

    const txData = transactionSnap.data()!;
    if (txData.userId !== ctx.userId) {
      throw new HttpsError("permission-denied", "Access denied");
    }

    // Remove the file from rejectedFileIds
    await transactionRef.update({
      rejectedFileIds: FieldValue.arrayRemove(fileId),
      updatedAt: FieldValue.serverTimestamp(),
    });

    console.log(`[unrejectFileFromTransaction] Unrejected file ${fileId} from transaction ${transactionId}`, {
      userId: ctx.userId,
    });

    return { success: true };
  }
);
