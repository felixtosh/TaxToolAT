"use strict";
/**
 * Soft-delete a user partner and unlink from all transactions/files
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUserPartnerCallable = void 0;
const firestore_1 = require("firebase-admin/firestore");
const createCallable_1 = require("../utils/createCallable");
const BATCH_SIZE = 500;
exports.deleteUserPartnerCallable = (0, createCallable_1.createCallable)({
    name: "deleteUserPartner",
    timeoutSeconds: 120,
    memory: "512MiB",
}, async (ctx, request) => {
    const { partnerId } = request;
    if (!partnerId) {
        throw new createCallable_1.HttpsError("invalid-argument", "partnerId is required");
    }
    // Verify ownership
    const partnerRef = ctx.db.collection("partners").doc(partnerId);
    const partnerSnap = await partnerRef.get();
    if (!partnerSnap.exists) {
        throw new createCallable_1.HttpsError("not-found", "Partner not found");
    }
    if (partnerSnap.data().userId !== ctx.userId) {
        throw new createCallable_1.HttpsError("permission-denied", "Access denied");
    }
    const now = firestore_1.Timestamp.now();
    let unlinkedTransactions = 0;
    let unlinkedFiles = 0;
    // 1. Soft delete the partner
    await partnerRef.update({
        isActive: false,
        updatedAt: now,
    });
    // 2. Find and unlink all transactions with this partner
    const transactionsQuery = await ctx.db
        .collection("transactions")
        .where("userId", "==", ctx.userId)
        .where("partnerId", "==", partnerId)
        .get();
    if (!transactionsQuery.empty) {
        for (let i = 0; i < transactionsQuery.docs.length; i += BATCH_SIZE) {
            const batch = ctx.db.batch();
            const chunk = transactionsQuery.docs.slice(i, i + BATCH_SIZE);
            for (const txDoc of chunk) {
                batch.update(txDoc.ref, {
                    partnerId: null,
                    partnerType: null,
                    partnerMatchedBy: null,
                    partnerMatchConfidence: null,
                    updatedAt: now,
                });
                unlinkedTransactions++;
            }
            await batch.commit();
        }
    }
    // 3. Find and unlink all files with this partner
    const filesQuery = await ctx.db
        .collection("files")
        .where("userId", "==", ctx.userId)
        .where("partnerId", "==", partnerId)
        .get();
    if (!filesQuery.empty) {
        for (let i = 0; i < filesQuery.docs.length; i += BATCH_SIZE) {
            const batch = ctx.db.batch();
            const chunk = filesQuery.docs.slice(i, i + BATCH_SIZE);
            for (const fileDoc of chunk) {
                batch.update(fileDoc.ref, {
                    partnerId: null,
                    partnerType: null,
                    partnerMatchedBy: null,
                    partnerMatchConfidence: null,
                    updatedAt: now,
                });
                unlinkedFiles++;
            }
            await batch.commit();
        }
    }
    console.log(`[deleteUserPartner] Deleted partner ${partnerId}`, {
        userId: ctx.userId,
        unlinkedTransactions,
        unlinkedFiles,
    });
    return {
        success: true,
        unlinkedTransactions,
        unlinkedFiles,
    };
});
//# sourceMappingURL=deleteUserPartner.js.map