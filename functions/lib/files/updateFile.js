"use strict";
/**
 * Update a file's metadata
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateFileCallable = void 0;
const firestore_1 = require("firebase-admin/firestore");
const createCallable_1 = require("../utils/createCallable");
const cancelWorkers_1 = require("../utils/cancelWorkers");
exports.updateFileCallable = (0, createCallable_1.createCallable)({ name: "updateFile" }, async (ctx, request) => {
    const { fileId, data } = request;
    if (!fileId) {
        throw new createCallable_1.HttpsError("invalid-argument", "fileId is required");
    }
    // Verify ownership
    const fileRef = ctx.db.collection("files").doc(fileId);
    const fileSnap = await fileRef.get();
    if (!fileSnap.exists) {
        throw new createCallable_1.HttpsError("not-found", "File not found");
    }
    if (fileSnap.data().userId !== ctx.userId) {
        throw new createCallable_1.HttpsError("permission-denied", "Access denied");
    }
    // Cancel running partner automation when user manually assigns or accepts suggestion
    const isManualPartnerAssignment = data.partnerId &&
        (data.partnerMatchedBy === "manual" || data.partnerMatchedBy === "suggestion");
    if (isManualPartnerAssignment) {
        (0, cancelWorkers_1.cancelPartnerWorkersForFile)(ctx.userId, fileId).catch((err) => {
            console.error("[updateFile] Failed to cancel partner workers:", err);
        });
    }
    // Build update object, converting dates and filtering undefined
    const updateData = {};
    for (const [key, value] of Object.entries(data)) {
        if (value === undefined)
            continue;
        // Handle date conversion
        if (key === "extractedDate" && value) {
            const dateObj = new Date(value);
            if (!isNaN(dateObj.getTime())) {
                updateData.extractedDate = firestore_1.Timestamp.fromDate(dateObj);
            }
        }
        else {
            updateData[key] = value;
        }
    }
    updateData.updatedAt = firestore_1.FieldValue.serverTimestamp();
    await fileRef.update(updateData);
    console.log(`[updateFile] Updated file ${fileId}`, {
        userId: ctx.userId,
        fields: Object.keys(updateData),
    });
    return { success: true };
});
//# sourceMappingURL=updateFile.js.map