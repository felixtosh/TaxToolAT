"use strict";
/**
 * Mark a file as "not an invoice" (user override)
 * Clears extracted data and resets downstream matching.
 * Preserves manually-set partner assignments.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.markFileAsNotInvoiceCallable = void 0;
const firestore_1 = require("firebase-admin/firestore");
const createCallable_1 = require("../utils/createCallable");
exports.markFileAsNotInvoiceCallable = (0, createCallable_1.createCallable)({ name: "markFileAsNotInvoice" }, async (ctx, request) => {
    const { fileId, reason } = request;
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
        isNotInvoice: true,
        notInvoiceReason: reason || "Marked by user",
        classificationComplete: true,
        // Clear all extracted data since it's not an invoice
        extractedDate: null,
        extractedAmount: null,
        extractedCurrency: null,
        extractedVatPercent: null,
        extractedPartner: null,
        extractedVatId: null,
        extractedIban: null,
        extractedAddress: null,
        extractedText: null,
        extractedRaw: null,
        extractedAdditionalFields: null,
        extractedFields: null,
        extractionConfidence: null,
        invoiceDirection: null,
        // Mark extraction as complete (nothing to extract for non-invoices)
        extractionComplete: true,
        // Reset downstream matching
        partnerMatchComplete: false,
        partnerSuggestions: [],
        transactionMatchComplete: false,
        transactionSuggestions: [],
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    };
    // Only clear partner if NOT manually set (preserve user's intentional choice)
    if (fileData.partnerMatchedBy !== "manual") {
        updates.partnerId = null;
        updates.partnerType = null;
        updates.partnerMatchedBy = null;
        updates.partnerMatchConfidence = null;
    }
    await fileRef.update(updates);
    console.log(`[markFileAsNotInvoice] Marked file ${fileId} as not invoice`, {
        userId: ctx.userId,
        reason: reason || "Marked by user",
    });
    return { success: true };
});
//# sourceMappingURL=markFileAsNotInvoice.js.map