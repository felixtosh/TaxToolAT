"use strict";
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
exports.onTransactionPartnerChange = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const firestore_2 = require("firebase-admin/firestore");
const category_matcher_1 = require("../utils/category-matcher");
const db = (0, firestore_2.getFirestore)();
/**
 * Triggered when a transaction is updated.
 * Re-matches categories when partnerId is newly assigned.
 */
exports.onTransactionPartnerChange = (0, firestore_1.onDocumentUpdated)({
    document: "transactions/{transactionId}",
    region: "europe-west1",
}, async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const transactionId = event.params.transactionId;
    if (!before || !after)
        return;
    // Only trigger when partnerId is newly assigned (was null, now has value)
    // OR when partnerId changed to a different partner
    const partnerWasAssigned = !before.partnerId && after.partnerId;
    const partnerChanged = before.partnerId !== after.partnerId && after.partnerId;
    if (!partnerWasAssigned && !partnerChanged) {
        return;
    }
    const userId = after.userId;
    const hasFiles = after.fileIds && after.fileIds.length > 0;
    const hasCategory = !!after.noReceiptCategoryId;
    console.log(`Partner ${after.partnerId} assigned to transaction ${transactionId}, triggering automations`);
    // Queue receipt search if transaction has no files
    if (!hasFiles) {
        try {
            const { queueReceiptSearchForTransaction } = await Promise.resolve().then(() => __importStar(require("../workers/runReceiptSearchForTransaction")));
            queueReceiptSearchForTransaction({
                transactionId,
                userId,
                partnerId: after.partnerId,
            })
                .then((result) => {
                if (result.skipped) {
                    console.log(`[onTransactionPartnerChange] Receipt search skipped: ${result.skipReason}`);
                }
                else {
                    console.log(`[onTransactionPartnerChange] Receipt search queued for ${transactionId}`);
                }
            })
                .catch((err) => {
                console.error(`[onTransactionPartnerChange] Failed to queue receipt search:`, err);
            });
        }
        catch (err) {
            console.error(`[onTransactionPartnerChange] Failed to import receipt search module:`, err);
        }
    }
    // Skip category matching if already has category or files
    if (hasCategory || hasFiles) {
        return;
    }
    try {
        // Get all active categories for this user
        const categoriesSnapshot = await db
            .collection("noReceiptCategories")
            .where("userId", "==", userId)
            .where("isActive", "==", true)
            .get();
        if (categoriesSnapshot.empty) {
            console.log(`No active categories found for user ${userId}`);
            return;
        }
        // Build map of categoryId -> Set<transactionIds> for manual removals
        const categoryManualRemovals = new Map();
        const categories = categoriesSnapshot.docs.map((doc) => {
            const data = doc.data();
            const removals = data.manualRemovals || [];
            if (removals.length > 0) {
                categoryManualRemovals.set(doc.id, new Set(removals.map((r) => r.transactionId)));
            }
            return {
                id: doc.id,
                userId: data.userId,
                templateId: data.templateId,
                name: data.name,
                matchedPartnerIds: data.matchedPartnerIds || [],
                learnedPatterns: data.learnedPatterns || [],
                manualRemovals: removals,
                transactionCount: data.transactionCount || 0,
                isActive: data.isActive,
            };
        });
        // Build transaction data for matching
        const transaction = {
            id: transactionId,
            partner: after.partner || null,
            partnerId: after.partnerId || null,
            name: after.name || "",
            reference: after.reference || null,
            noReceiptCategoryId: after.noReceiptCategoryId || null,
            fileIds: after.fileIds || [],
        };
        if (!(0, category_matcher_1.isEligibleForCategoryMatching)(transaction)) {
            return;
        }
        // Match transaction to categories
        const matches = (0, category_matcher_1.matchTransactionToCategories)(transaction, categories, categoryManualRemovals);
        if (matches.length > 0) {
            const topMatch = matches[0];
            const updates = {
                categorySuggestions: matches.map((m) => ({
                    categoryId: m.categoryId,
                    templateId: m.templateId,
                    confidence: m.confidence,
                    source: m.source,
                })),
                updatedAt: firestore_2.FieldValue.serverTimestamp(),
            };
            if ((0, category_matcher_1.shouldAutoApplyCategory)(topMatch.confidence)) {
                updates.noReceiptCategoryId = topMatch.categoryId;
                updates.noReceiptCategoryTemplateId = topMatch.templateId;
                updates.noReceiptCategoryConfidence = topMatch.confidence;
                updates.noReceiptCategoryMatchedBy = "auto";
                updates.isComplete = true;
                // Also link partner to category
                const category = categories.find((c) => c.id === topMatch.categoryId);
                if (category && after.partnerId && !category.matchedPartnerIds.includes(after.partnerId)) {
                    await db.collection("noReceiptCategories").doc(topMatch.categoryId).update({
                        matchedPartnerIds: firestore_2.FieldValue.arrayUnion(after.partnerId),
                        updatedAt: firestore_2.FieldValue.serverTimestamp(),
                    });
                    console.log(`Linked partner ${after.partnerId} to category ${topMatch.templateId}`);
                }
                console.log(`Auto-matched transaction ${transactionId} to category ${topMatch.templateId} (${topMatch.confidence}%)`);
            }
            else {
                console.log(`Added ${matches.length} category suggestions to transaction ${transactionId}`);
            }
            await db.collection("transactions").doc(transactionId).update(updates);
        }
    }
    catch (error) {
        console.error(`Error re-matching categories for transaction ${transactionId}:`, error);
    }
});
//# sourceMappingURL=onTransactionPartnerChange.js.map