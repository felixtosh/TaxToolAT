"use strict";
/**
 * Create a new file record (after uploading to storage)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFileCallable = void 0;
const firestore_1 = require("firebase-admin/firestore");
const createCallable_1 = require("../utils/createCallable");
exports.createFileCallable = (0, createCallable_1.createCallable)({ name: "createFile" }, async (ctx, request) => {
    const { data } = request;
    if (!data?.fileName) {
        throw new createCallable_1.HttpsError("invalid-argument", "fileName is required");
    }
    if (!data?.storagePath) {
        throw new createCallable_1.HttpsError("invalid-argument", "storagePath is required");
    }
    if (!data?.downloadUrl) {
        throw new createCallable_1.HttpsError("invalid-argument", "downloadUrl is required");
    }
    const now = firestore_1.Timestamp.now();
    // Build file object, excluding undefined values
    const newFile = {
        userId: ctx.userId,
        fileName: data.fileName,
        fileType: data.fileType || "application/octet-stream",
        fileSize: data.fileSize || 0,
        storagePath: data.storagePath,
        downloadUrl: data.downloadUrl,
        extractionComplete: false,
        transactionIds: [],
        uploadedAt: now,
        createdAt: now,
        updatedAt: now,
    };
    // Add optional fields only if they have values
    if (data.thumbnailUrl)
        newFile.thumbnailUrl = data.thumbnailUrl;
    if (data.contentHash)
        newFile.contentHash = data.contentHash;
    if (data.sourceType)
        newFile.sourceType = data.sourceType;
    if (data.sourceSearchPattern)
        newFile.sourceSearchPattern = data.sourceSearchPattern;
    if (data.sourceResultType)
        newFile.sourceResultType = data.sourceResultType;
    if (data.sourceUrl)
        newFile.sourceUrl = data.sourceUrl;
    if (data.sourceDomain)
        newFile.sourceDomain = data.sourceDomain;
    if (data.sourceRunId)
        newFile.sourceRunId = data.sourceRunId;
    if (data.sourceCollectorId)
        newFile.sourceCollectorId = data.sourceCollectorId;
    if (data.gmailMessageId)
        newFile.gmailMessageId = data.gmailMessageId;
    if (data.gmailIntegrationId)
        newFile.gmailIntegrationId = data.gmailIntegrationId;
    if (data.gmailIntegrationEmail)
        newFile.gmailIntegrationEmail = data.gmailIntegrationEmail;
    if (data.gmailSubject)
        newFile.gmailSubject = data.gmailSubject;
    if (data.gmailAttachmentId)
        newFile.gmailAttachmentId = data.gmailAttachmentId;
    if (data.gmailSenderEmail)
        newFile.gmailSenderEmail = data.gmailSenderEmail;
    if (data.gmailSenderDomain)
        newFile.gmailSenderDomain = data.gmailSenderDomain;
    if (data.gmailSenderName)
        newFile.gmailSenderName = data.gmailSenderName;
    if (data.gmailEmailDate) {
        const dateObj = new Date(data.gmailEmailDate);
        if (!isNaN(dateObj.getTime())) {
            newFile.gmailEmailDate = firestore_1.Timestamp.fromDate(dateObj);
        }
    }
    const docRef = await ctx.db.collection("files").add(newFile);
    console.log(`[createFile] Created file ${docRef.id}`, {
        userId: ctx.userId,
        fileName: data.fileName,
    });
    return {
        success: true,
        fileId: docRef.id,
    };
});
//# sourceMappingURL=createFile.js.map