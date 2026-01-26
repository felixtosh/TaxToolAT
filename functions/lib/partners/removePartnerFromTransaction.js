"use strict";
/**
 * Remove partner assignment from a transaction
 * Records false positives (auto-assigned transactions that user removed) for pattern relearning
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.removePartnerFromTransactionCallable = void 0;
const firestore_1 = require("firebase-admin/firestore");
const createCallable_1 = require("../utils/createCallable");
const MAX_MANUAL_REMOVALS = 50; // Cap to prevent unbounded growth
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
    const previousPartnerId = txData.partnerId;
    const previousMatchedBy = txData.partnerMatchedBy;
    const previousPartnerType = txData.partnerType;
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
        previousPartnerId,
        previousMatchedBy,
    });
    // Record as false positive if this was an auto/AI-matched user partner
    // This helps pattern learning avoid the same mistake
    const wasAutoAssigned = previousMatchedBy === "auto" || previousMatchedBy === "ai";
    if (previousPartnerId && previousPartnerType === "user" && wasAutoAssigned) {
        try {
            const partnerRef = ctx.db.collection("partners").doc(previousPartnerId);
            const partnerSnap = await partnerRef.get();
            if (partnerSnap.exists && partnerSnap.data()?.userId === ctx.userId) {
                // Add to manualRemovals (false positives list)
                const existingRemovals = partnerSnap.data()?.manualRemovals || [];
                // Check if already recorded
                const alreadyRecorded = existingRemovals.some((r) => r.transactionId === transactionId);
                if (!alreadyRecorded) {
                    const removalRecord = {
                        transactionId,
                        removedAt: firestore_1.Timestamp.now(),
                        partner: txData.partner || null,
                        name: txData.name || "",
                    };
                    // Trim to max size, keeping most recent
                    const updatedRemovals = [...existingRemovals, removalRecord].slice(-MAX_MANUAL_REMOVALS);
                    await partnerRef.update({
                        manualRemovals: updatedRemovals,
                        updatedAt: firestore_1.FieldValue.serverTimestamp(),
                    });
                    console.log(`[removePartnerFromTransaction] Recorded false positive for partner ${previousPartnerId}`);
                    // Trigger pattern relearning to exclude this transaction
                    const { learnPatternsForPartnersBatch } = await Promise.resolve().then(() => __importStar(require("../matching/learnPartnerPatterns")));
                    learnPatternsForPartnersBatch(ctx.userId, [previousPartnerId])
                        .then((results) => {
                        console.log(`[removePartnerFromTransaction] Pattern relearning completed:`, results);
                    })
                        .catch((err) => {
                        console.error(`[removePartnerFromTransaction] Pattern relearning failed:`, err);
                    });
                }
            }
        }
        catch (err) {
            console.error(`[removePartnerFromTransaction] Failed to record false positive:`, err);
            // Don't fail the removal just because false positive recording failed
        }
    }
    return { success: true };
});
//# sourceMappingURL=removePartnerFromTransaction.js.map