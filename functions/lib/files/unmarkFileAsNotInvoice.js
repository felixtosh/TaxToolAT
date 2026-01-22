"use strict";
/**
 * Unmark a file as "not an invoice" (restore as invoice)
 * Triggers re-extraction while preserving manually-set partner and transactions.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.unmarkFileAsNotInvoiceCallable = void 0;
const firestore_1 = require("firebase-admin/firestore");
const createCallable_1 = require("../utils/createCallable");
exports.unmarkFileAsNotInvoiceCallable = (0, createCallable_1.createCallable)({ name: "unmarkFileAsNotInvoice" }, async (ctx, request) => {
    const { fileId } = request;
    if (!fileId) {
        throw new createCallable_1.HttpsError("invalid-argument", "fileId is required");
    }
    const fileRef = ctx.db.collection("files").doc(fileId);
    const fileSnap = await fileRef.get();
    if (!fileSnap.exists) {
        throw new createCallable_1.HttpsError("not-found", "File not found");
    }
    const fileData = fileSnap.data();
    if (fileData.userId !== ctx.userId) {
        throw new createCallable_1.HttpsError("permission-denied", "Access denied");
    }
    // Build update object
    const updates = {
        isNotInvoice: false,
        notInvoiceReason: null,
        // Skip classification - user has confirmed it's an invoice
        classificationComplete: true,
        // Reset extraction to trigger re-extraction
        extractionComplete: false,
        extractionError: null,
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
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
});
//# sourceMappingURL=unmarkFileAsNotInvoice.js.map