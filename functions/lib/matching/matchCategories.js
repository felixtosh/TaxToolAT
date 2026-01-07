"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchCategories = void 0;
exports.matchCategoriesForUser = matchCategoriesForUser;
exports.matchCategoriesForTransactions = matchCategoriesForTransactions;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const category_matcher_1 = require("../utils/category-matcher");
const db = (0, firestore_1.getFirestore)();
/**
 * Callable function to manually trigger category matching
 * Can match specific transactions or all unmatched ones
 */
exports.matchCategories = (0, https_1.onCall)({
    region: "europe-west1",
    memory: "512MiB",
}, async (request) => {
    // Use authenticated user ID or fall back to mock user for development
    const userId = request.auth?.uid || "dev-user-123";
    const { transactionIds, matchAll } = request.data;
    console.log(`Category matching triggered by user ${userId}`, {
        transactionIds,
        matchAll,
    });
    return matchCategoriesForUser(userId, transactionIds, matchAll);
});
/**
 * Internal helper to match categories for a specific user.
 * Called from the callable function and from matchPartners chaining.
 */
async function matchCategoriesForUser(userId, transactionIds, matchAll) {
    // Get user's no-receipt categories
    const categoriesSnapshot = await db
        .collection("noReceiptCategories")
        .where("userId", "==", userId)
        .where("isActive", "==", true)
        .get();
    if (categoriesSnapshot.empty) {
        console.log(`No active categories found for user ${userId}`);
        return { processed: 0, autoMatched: 0, withSuggestions: 0 };
    }
    // Build map of categoryId -> Set<transactionIds> for manual removals
    const categoryManualRemovals = new Map();
    const categories = categoriesSnapshot.docs.map((doc) => {
        const data = doc.data();
        // Track manual removals for this category
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
            isActive: data.isActive,
        };
    });
    console.log(`Found ${categories.length} active categories`);
    // Get transactions to match
    let transactionsSnapshot;
    if (!matchAll && transactionIds && transactionIds.length > 0) {
        // Fetch specific transactions
        const docs = await Promise.all(transactionIds.map((id) => db.collection("transactions").doc(id).get()));
        transactionsSnapshot = docs.filter((doc) => doc.exists && doc.data()?.userId === userId);
    }
    else if (!matchAll) {
        // Only transactions without category and without files
        const query = await db
            .collection("transactions")
            .where("userId", "==", userId)
            .where("noReceiptCategoryId", "==", null)
            .limit(1000)
            .get();
        transactionsSnapshot = query.docs;
    }
    else {
        // All transactions (force re-match)
        const query = await db
            .collection("transactions")
            .where("userId", "==", userId)
            .limit(1000)
            .get();
        transactionsSnapshot = query.docs;
    }
    const transactions = Array.isArray(transactionsSnapshot)
        ? transactionsSnapshot
        : transactionsSnapshot;
    let processed = 0;
    let autoMatched = 0;
    let withSuggestions = 0;
    let batch = db.batch();
    let batchCount = 0;
    for (const txDoc of transactions) {
        if (!txDoc.exists)
            continue;
        const txData = txDoc.data();
        const transaction = {
            id: txDoc.id,
            partner: txData.partner || null,
            partnerId: txData.partnerId || null,
            name: txData.name || "",
            reference: txData.reference || null,
            noReceiptCategoryId: txData.noReceiptCategoryId || null,
            fileIds: txData.fileIds || [],
        };
        // Skip if not eligible (has category or files)
        if (!(0, category_matcher_1.isEligibleForCategoryMatching)(transaction)) {
            continue;
        }
        const matches = (0, category_matcher_1.matchTransactionToCategories)(transaction, categories, categoryManualRemovals);
        processed++;
        if (matches.length > 0) {
            const topMatch = matches[0];
            const updates = {
                categorySuggestions: matches.map((m) => ({
                    categoryId: m.categoryId,
                    templateId: m.templateId,
                    confidence: m.confidence,
                    source: m.source,
                })),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            };
            if ((0, category_matcher_1.shouldAutoApplyCategory)(topMatch.confidence)) {
                updates.noReceiptCategoryId = topMatch.categoryId;
                updates.noReceiptCategoryTemplateId = topMatch.templateId;
                updates.noReceiptCategoryConfidence = topMatch.confidence;
                updates.noReceiptCategoryMatchedBy = "auto";
                autoMatched++;
                console.log(`Auto-matched tx ${txDoc.id} to category ${topMatch.templateId} (${topMatch.confidence}%)`);
            }
            else {
                withSuggestions++;
            }
            batch.update(txDoc.ref, updates);
            batchCount++;
            if (batchCount >= 500) {
                await batch.commit();
                batch = db.batch();
                batchCount = 0;
            }
        }
    }
    if (batchCount > 0) {
        await batch.commit();
    }
    console.log(`Category matching complete: ${processed} processed, ${autoMatched} auto-matched, ${withSuggestions} with suggestions`);
    return {
        processed,
        autoMatched,
        withSuggestions,
    };
}
/**
 * Match categories for specific transaction IDs.
 * Called after partner matching completes.
 */
async function matchCategoriesForTransactions(userId, transactionIds) {
    if (!transactionIds || transactionIds.length === 0) {
        return { processed: 0, autoMatched: 0, withSuggestions: 0 };
    }
    console.log(`Chaining category matching for ${transactionIds.length} transactions`);
    return matchCategoriesForUser(userId, transactionIds, false);
}
//# sourceMappingURL=matchCategories.js.map