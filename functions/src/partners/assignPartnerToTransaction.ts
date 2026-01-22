/**
 * Assign a partner to a transaction
 */

import { FieldValue } from "firebase-admin/firestore";
import { createCallable, HttpsError } from "../utils/createCallable";

interface AssignPartnerToTransactionRequest {
  transactionId: string;
  partnerId: string;
  partnerType: "global" | "user";
  matchedBy: "manual" | "suggestion";
  confidence?: number;
}

interface AssignPartnerToTransactionResponse {
  success: boolean;
}

export const assignPartnerToTransactionCallable = createCallable<
  AssignPartnerToTransactionRequest,
  AssignPartnerToTransactionResponse
>(
  { name: "assignPartnerToTransaction" },
  async (ctx, request) => {
    const { transactionId, partnerId, partnerType, matchedBy, confidence } = request;

    if (!transactionId) {
      throw new HttpsError("invalid-argument", "transactionId is required");
    }
    if (!partnerId) {
      throw new HttpsError("invalid-argument", "partnerId is required");
    }
    if (!partnerType) {
      throw new HttpsError("invalid-argument", "partnerType is required");
    }
    if (!matchedBy) {
      throw new HttpsError("invalid-argument", "matchedBy is required");
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

    // Verify partner exists
    const partnerRef = ctx.db.collection("partners").doc(partnerId);
    const partnerSnap = await partnerRef.get();

    if (!partnerSnap.exists) {
      throw new HttpsError("not-found", "Partner not found");
    }

    // For user partners, verify ownership
    const partnerData = partnerSnap.data()!;
    if (partnerType === "user" && partnerData.userId !== ctx.userId) {
      throw new HttpsError("permission-denied", "Partner access denied");
    }

    // Update transaction with partner assignment
    await transactionRef.update({
      partnerId,
      partnerType,
      partnerMatchedBy: matchedBy,
      partnerMatchConfidence: confidence ?? null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    console.log(`[assignPartnerToTransaction] Assigned partner ${partnerId} to transaction ${transactionId}`, {
      userId: ctx.userId,
      partnerType,
      matchedBy,
    });

    return { success: true };
  }
);
