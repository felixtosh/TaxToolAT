"use strict";
/**
 * Assign a partner to a transaction
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.assignPartnerToTransactionCallable = void 0;
const firestore_1 = require("firebase-admin/firestore");
const createCallable_1 = require("../utils/createCallable");
exports.assignPartnerToTransactionCallable = (0, createCallable_1.createCallable)({ name: "assignPartnerToTransaction" }, async (ctx, request) => {
    const { transactionId, partnerId, partnerType, matchedBy, confidence } = request;
    if (!transactionId) {
        throw new createCallable_1.HttpsError("invalid-argument", "transactionId is required");
    }
    if (!partnerId) {
        throw new createCallable_1.HttpsError("invalid-argument", "partnerId is required");
    }
    if (!partnerType) {
        throw new createCallable_1.HttpsError("invalid-argument", "partnerType is required");
    }
    if (!matchedBy) {
        throw new createCallable_1.HttpsError("invalid-argument", "matchedBy is required");
    }
    // Verify transaction ownership
    const transactionRef = ctx.db.collection("transactions").doc(transactionId);
    const transactionSnap = await transactionRef.get();
    if (!transactionSnap.exists) {
        throw new createCallable_1.HttpsError("not-found", "Transaction not found");
    }
    const txData = transactionSnap.data();
    if (txData.userId !== ctx.userId) {
        throw new createCallable_1.HttpsError("permission-denied", "Access denied");
    }
    // Verify partner exists
    const partnerRef = ctx.db.collection("partners").doc(partnerId);
    const partnerSnap = await partnerRef.get();
    if (!partnerSnap.exists) {
        throw new createCallable_1.HttpsError("not-found", "Partner not found");
    }
    // For user partners, verify ownership
    const partnerData = partnerSnap.data();
    if (partnerType === "user" && partnerData.userId !== ctx.userId) {
        throw new createCallable_1.HttpsError("permission-denied", "Partner access denied");
    }
    // Update transaction with partner assignment
    await transactionRef.update({
        partnerId,
        partnerType,
        partnerMatchedBy: matchedBy,
        partnerMatchConfidence: confidence ?? null,
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    });
    console.log(`[assignPartnerToTransaction] Assigned partner ${partnerId} to transaction ${transactionId}`, {
        userId: ctx.userId,
        partnerType,
        matchedBy,
    });
    return { success: true };
});
//# sourceMappingURL=assignPartnerToTransaction.js.map