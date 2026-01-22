"use strict";
/**
 * Remove partner assignment from a transaction
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.removePartnerFromTransactionCallable = void 0;
const firestore_1 = require("firebase-admin/firestore");
const createCallable_1 = require("../utils/createCallable");
exports.removePartnerFromTransactionCallable = (0, createCallable_1.createCallable)({ name: "removePartnerFromTransaction" }, async (ctx, request) => {
    const { transactionId } = request;
    if (!transactionId) {
        throw new createCallable_1.HttpsError("invalid-argument", "transactionId is required");
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
    // Clear partner assignment
    await transactionRef.update({
        partnerId: null,
        partnerType: null,
        partnerMatchedBy: null,
        partnerMatchConfidence: null,
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    });
    console.log(`[removePartnerFromTransaction] Removed partner from transaction ${transactionId}`, {
        userId: ctx.userId,
    });
    return { success: true };
});
//# sourceMappingURL=removePartnerFromTransaction.js.map