"use strict";
/**
 * Bulk update multiple transactions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.bulkUpdateTransactionsCallable = void 0;
const firestore_1 = require("firebase-admin/firestore");
const createCallable_1 = require("../utils/createCallable");
const BATCH_SIZE = 500; // Firestore batch limit
exports.bulkUpdateTransactionsCallable = (0, createCallable_1.createCallable)({
    name: "bulkUpdateTransactions",
    timeoutSeconds: 120, // Allow more time for bulk operations
    memory: "512MiB",
}, async (ctx, request) => {
    const { ids, data } = request;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        throw new createCallable_1.HttpsError("invalid-argument", "Transaction IDs array is required");
    }
    if (ids.length > 1000) {
        throw new createCallable_1.HttpsError("invalid-argument", "Cannot update more than 1000 transactions at once");
    }
    const result = {
        success: 0,
        failed: 0,
        errors: [],
    };
    // Build update data
    const updateData = {};
    for (const [key, value] of Object.entries(data)) {
        if (value !== undefined) {
            updateData[key] = value;
        }
    }
    updateData.updatedAt = firestore_1.FieldValue.serverTimestamp();
    // Process in batches
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batchIds = ids.slice(i, i + BATCH_SIZE);
        const batch = ctx.db.batch();
        const validIds = [];
        // First verify ownership of all transactions in this batch
        for (const id of batchIds) {
            try {
                const transactionRef = ctx.db.collection("transactions").doc(id);
                const transactionSnap = await transactionRef.get();
                if (!transactionSnap.exists) {
                    result.failed++;
                    result.errors.push({ id, error: "Not found" });
                    continue;
                }
                const transactionData = transactionSnap.data();
                if (transactionData?.userId !== ctx.userId) {
                    result.failed++;
                    result.errors.push({ id, error: "Access denied" });
                    continue;
                }
                // Build per-transaction update (may need to adjust isComplete)
                const txUpdateData = { ...updateData };
                // Automatically manage isComplete based on noReceiptCategoryId changes
                // Green row = file attached OR no-receipt category assigned
                if (data.noReceiptCategoryId !== undefined) {
                    const currentFileIds = transactionData?.fileIds || [];
                    const hasFiles = currentFileIds.length > 0;
                    if (data.noReceiptCategoryId) {
                        // Category being assigned -> mark complete
                        txUpdateData.isComplete = true;
                    }
                    else if (!hasFiles) {
                        // Category being removed AND no files -> mark incomplete
                        txUpdateData.isComplete = false;
                    }
                    // If category removed but has files, keep isComplete unchanged
                }
                batch.update(transactionRef, txUpdateData);
                validIds.push(id);
            }
            catch (err) {
                result.failed++;
                result.errors.push({ id, error: String(err) });
            }
        }
        // Commit batch
        if (validIds.length > 0) {
            try {
                await batch.commit();
                result.success += validIds.length;
            }
            catch (err) {
                // Batch failed, mark all as failed
                result.failed += validIds.length;
                for (const id of validIds) {
                    result.errors.push({ id, error: `Batch commit failed: ${err}` });
                }
            }
        }
    }
    console.log(`[bulkUpdateTransactions] Completed`, {
        userId: ctx.userId,
        requested: ids.length,
        success: result.success,
        failed: result.failed,
    });
    return result;
});
//# sourceMappingURL=bulkUpdateTransactions.js.map