"use strict";
/**
 * Restore a soft-deleted file
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.restoreFileCallable = void 0;
const firestore_1 = require("firebase-admin/firestore");
const createCallable_1 = require("../utils/createCallable");
exports.restoreFileCallable = (0, createCallable_1.createCallable)({ name: "restoreFile" }, async (ctx, request) => {
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
    if (!fileData.deletedAt) {
        // File is not deleted, nothing to restore
        return { success: true };
    }
    await fileRef.update({
        deletedAt: null,
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    });
    console.log(`[restoreFile] Restored file ${fileId}`, {
        userId: ctx.userId,
    });
    return { success: true };
});
//# sourceMappingURL=restoreFile.js.map