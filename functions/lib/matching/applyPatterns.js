"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyPatternsToTransactions = void 0;
exports.applyAllPatternsToTransactions = applyAllPatternsToTransactions;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const partner_matcher_1 = require("../utils/partner-matcher");
const db = (0, firestore_1.getFirestore)();
// ============================================================================
// Pattern Matching
// ============================================================================
function findBestMatch(txPartner, txName, partners) {
    let bestMatch = null;
    for (const partner of partners) {
        if (!partner.learnedPatterns || partner.learnedPatterns.length === 0)
            continue;
        for (const pattern of partner.learnedPatterns) {
            const textToMatch = pattern.field === "partner" ? txPartner : txName;
            if (!textToMatch)
                continue;
            if ((0, partner_matcher_1.globMatch)(pattern.pattern, textToMatch)) {
                if (!bestMatch || pattern.confidence > bestMatch.confidence) {
                    bestMatch = {
                        partnerId: partner.id,
                        partnerName: partner.name,
                        confidence: pattern.confidence,
                    };
                }
            }
        }
    }
    return bestMatch;
}
// ============================================================================
// Background Worker
// ============================================================================
/**
 * Apply all learned patterns to unassigned transactions
 * Called after batch learning completes
 * No limits - processes ALL transactions using pagination
 */
async function applyAllPatternsToTransactions(userId) {
    console.log(`Applying patterns to all transactions for user ${userId}`);
    // Fetch all partners with patterns
    const partnersSnapshot = await db
        .collection("partners")
        .where("userId", "==", userId)
        .get();
    const partners = partnersSnapshot.docs
        .filter((doc) => {
        const data = doc.data();
        return data.learnedPatterns && data.learnedPatterns.length > 0;
    })
        .map((doc) => ({
        id: doc.id,
        name: doc.data().name,
        learnedPatterns: doc.data().learnedPatterns,
    }));
    if (partners.length === 0) {
        console.log("No partners with patterns found");
        return { processed: 0, matched: 0 };
    }
    console.log(`Found ${partners.length} partners with patterns`);
    let processed = 0;
    let matched = 0;
    let cursor = null;
    // Process in batches using pagination
    while (true) {
        // Build query
        let query = db
            .collection("transactions")
            .where("userId", "==", userId)
            .orderBy("date", "desc")
            .limit(500);
        if (cursor) {
            query = query.startAfter(cursor);
        }
        const batch = await query.get();
        if (batch.empty)
            break;
        // Filter to unassigned (client-side because null query is unreliable)
        const unassigned = batch.docs.filter((doc) => !doc.data().partnerId);
        if (unassigned.length > 0) {
            const updates = db.batch();
            let batchMatchCount = 0;
            for (const doc of unassigned) {
                const data = doc.data();
                const match = findBestMatch(data.partner || null, data.name || "", partners);
                if (match && match.confidence >= 89) {
                    updates.update(doc.ref, {
                        partnerId: match.partnerId,
                        partnerType: "user",
                        partnerMatchConfidence: match.confidence,
                        partnerMatchedBy: "auto",
                        partnerSuggestions: [{
                                partnerId: match.partnerId,
                                partnerType: "user",
                                confidence: match.confidence,
                                source: "pattern",
                            }],
                        updatedAt: firestore_1.FieldValue.serverTimestamp(),
                    });
                    batchMatchCount++;
                }
            }
            if (batchMatchCount > 0) {
                await updates.commit();
                matched += batchMatchCount;
            }
        }
        processed += batch.docs.length;
        cursor = batch.docs[batch.docs.length - 1];
        console.log(`Processed ${processed} transactions, matched ${matched} so far`);
        // Safety limit - process max 10,000 transactions per run
        if (processed >= 10000) {
            console.log("Reached safety limit of 10,000 transactions");
            break;
        }
    }
    console.log(`Completed: processed ${processed}, matched ${matched}`);
    return { processed, matched };
}
/**
 * Callable function to manually trigger pattern application
 */
exports.applyPatternsToTransactions = (0, https_1.onCall)({
    region: "europe-west1",
    memory: "512MiB",
    timeoutSeconds: 540,
}, async (request) => {
    const userId = request.auth?.uid || "dev-user-123";
    return await applyAllPatternsToTransactions(userId);
});
//# sourceMappingURL=applyPatterns.js.map