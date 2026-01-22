"use strict";
/**
 * Create an import record after transaction import completes
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createImportRecordCallable = void 0;
const firestore_1 = require("firebase-admin/firestore");
const createCallable_1 = require("../utils/createCallable");
exports.createImportRecordCallable = (0, createCallable_1.createCallable)({ name: "createImportRecord" }, async (ctx, request) => {
    const { importJobId, sourceId, fileName, importedCount, skippedCount, errorCount, totalRows, csvStoragePath, csvDownloadUrl, parseOptions, fieldMappings, } = request;
    if (!importJobId || !sourceId || !fileName) {
        throw new createCallable_1.HttpsError("invalid-argument", "importJobId, sourceId, and fileName are required");
    }
    // Verify source ownership
    const sourceRef = ctx.db.collection("sources").doc(sourceId);
    const sourceSnap = await sourceRef.get();
    if (!sourceSnap.exists) {
        throw new createCallable_1.HttpsError("not-found", "Source not found");
    }
    if (sourceSnap.data().userId !== ctx.userId) {
        throw new createCallable_1.HttpsError("permission-denied", "Source access denied");
    }
    // Create the import record
    const importDocRef = ctx.db.collection("imports").doc(importJobId);
    const importRecordData = {
        sourceId,
        fileName,
        importedCount: importedCount || 0,
        skippedCount: skippedCount || 0,
        errorCount: errorCount || 0,
        totalRows: totalRows || 0,
        userId: ctx.userId,
        createdAt: firestore_1.Timestamp.now(),
        // CSV storage fields - use null for queryability
        csvStoragePath: csvStoragePath ?? null,
        csvDownloadUrl: csvDownloadUrl ?? null,
        // Parse options and mappings for re-mapping feature
        parseOptions: parseOptions ?? null,
        fieldMappings: fieldMappings ?? null,
    };
    await importDocRef.set(importRecordData);
    console.log(`[createImportRecord] Created import record ${importJobId}`, {
        userId: ctx.userId,
        sourceId,
        importedCount,
        skippedCount,
        errorCount,
    });
    return {
        success: true,
        importId: importJobId,
    };
});
//# sourceMappingURL=createImportRecord.js.map