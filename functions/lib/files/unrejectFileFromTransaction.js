"use strict";
/**
 * Remove a file from a transaction's rejected list
 * Allows the file to be auto-matched to this transaction again
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.unrejectFileFromTransactionCallable = void 0;
const firestore_1 = require("firebase-admin/firestore");
const createCallable_1 = require("../utils/createCallable");
exports.unrejectFileFromTransactionCallable = (0, createCallable_1.createCallable)({ name: "unrejectFileFromTransaction" }, async (ctx, request) => {
    const { fileId, transactionId } = request;
    if (!fileId) {
        throw new createCallable_1.HttpsError("invalid-argument", "fileId is required");
    }
    if (!transactionId) {
        throw new createCallable_1.HttpsError("invalid-argument", "transactionId is required");
    }
    // Verify transaction exists and belongs to user
    const transactionRef = ctx.db.collection("transactions").doc(transactionId);
    const transactionSnap = await transactionRef.get();
    if (!transactionSnap.exists) {
        throw new createCallable_1.HttpsError("not-found", "Transaction not found");
    }
    const txData = transactionSnap.data();
    if (txData.userId !== ctx.userId) {
        throw new createCallable_1.HttpsError("permission-denied", "Access denied");
    }
    // Remove the file from rejectedFileIds
    await transactionRef.update({
        rejectedFileIds: firestore_1.FieldValue.arrayRemove(fileId),
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    });
    console.log(`[unrejectFileFromTransaction] Unrejected file ${fileId} from transaction ${transactionId}`, {
        userId: ctx.userId,
    });
    return { success: true };
});
//# sourceMappingURL=unrejectFileFromTransaction.js.map