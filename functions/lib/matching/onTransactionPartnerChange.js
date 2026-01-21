"use strict";
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
    const partnerWasAssigned = !before.partnerId && after.partnerId;
    // Also skip if transaction already has a category or files
    const hasCategory = !!after.noReceiptCategoryId;
    const hasFiles = after.fileIds && after.fileIds.length > 0;
    if (!partnerWasAssigned || hasCategory || hasFiles) {
        return;
    }
    const userId = after.userId;
    console.log(`Partner ${after.partnerId} assigned to transaction ${transactionId}, re-matching categories`);
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