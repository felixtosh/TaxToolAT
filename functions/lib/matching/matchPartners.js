"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchPartners = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const partner_matcher_1 = require("../utils/partner-matcher");
const db = (0, firestore_1.getFirestore)();
/**
 * Callable function to manually trigger partner matching
 * Can match specific transactions or all unmatched ones
 */
exports.matchPartners = (0, https_1.onCall)({
    region: "europe-west1",
    memory: "512MiB",
}, async (request) => {
    // Use authenticated user ID or fall back to mock user for development
    const userId = request.auth?.uid || "dev-user-123";
    const { transactionIds, matchAll } = request.data;
    console.log(`Manual matching triggered by user ${userId}`, { transactionIds, matchAll });
    // Get partners
    const [userPartnersSnapshot, globalPartnersSnapshot] = await Promise.all([
        db
            .collection("partners")
            .where("userId", "==", userId)
            .where("isActive", "==", true)
            .get(),
        db.collection("globalPartners").where("isActive", "==", true).get(),
    ]);
    const userPartners = userPartnersSnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
            id: doc.id,
            name: data.name,
            aliases: data.aliases || [],
            ibans: data.ibans || [],
            website: data.website,
            vatId: data.vatId,
            learnedPatterns: data.learnedPatterns || [],
        };
    });
    const globalPartners = globalPartnersSnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
            id: doc.id,
            name: data.name,
            aliases: data.aliases || [],
            ibans: data.ibans || [],
            website: data.website,
            vatId: data.vatId,
        };
    });
    // Get transactions to match
    let transactionsSnapshot;
    if (!matchAll && transactionIds && transactionIds.length > 0) {
        // Fetch specific transactions
        const docs = await Promise.all(transactionIds.map((id) => db.collection("transactions").doc(id).get()));
        transactionsSnapshot = docs.filter((doc) => doc.exists && doc.data()?.userId === userId);
    }
    else if (!matchAll) {
        // Only unmatched transactions
        const query = await db
            .collection("transactions")
            .where("userId", "==", userId)
            .where("partnerId", "==", null)
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
    const batch = db.batch();
    let batchCount = 0;
    for (const txDoc of transactions) {
        if (!txDoc.exists)
            continue;
        const txData = txDoc.data();
        const transaction = {
            id: txDoc.id,
            partner: txData.partner || null,
            partnerIban: txData.partnerIban || null,
            name: txData.name || "",
        };
        const matches = (0, partner_matcher_1.matchTransaction)(transaction, userPartners, globalPartners);
        processed++;
        if (matches.length > 0) {
            const topMatch = matches[0];
            const updates = {
                partnerSuggestions: matches.map((m) => ({
                    partnerId: m.partnerId,
                    partnerType: m.partnerType,
                    confidence: m.confidence,
                    source: m.source,
                })),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            };
            if ((0, partner_matcher_1.shouldAutoApply)(topMatch.confidence)) {
                updates.partnerId = topMatch.partnerId;
                updates.partnerType = topMatch.partnerType;
                updates.partnerMatchConfidence = topMatch.confidence;
                updates.partnerMatchedBy = "auto";
                autoMatched++;
            }
            else {
                withSuggestions++;
            }
            batch.update(txDoc.ref, updates);
            batchCount++;
            if (batchCount >= 500) {
                await batch.commit();
                batchCount = 0;
            }
        }
    }
    if (batchCount > 0) {
        await batch.commit();
    }
    console.log(`Matching complete: ${processed} processed, ${autoMatched} auto-matched, ${withSuggestions} with suggestions`);
    return {
        processed,
        autoMatched,
        withSuggestions,
    };
});
//# sourceMappingURL=matchPartners.js.map