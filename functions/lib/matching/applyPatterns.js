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
/**
 * Try to match a pattern against transaction text using multiple strategies:
 * 1. Individual fields (name, partner, reference)
 * 2. Combined text in different orderings
 *
 * This handles cases where the relevant text might be in any field,
 * and patterns were learned from a specific field ordering.
 */
function matchPatternFlexible(pattern, txName, txPartner, txReference) {
    // Build all possible text combinations to try
    const textsToTry = [];
    // Individual fields (most specific)
    if (txName)
        textsToTry.push(txName.toLowerCase());
    if (txPartner)
        textsToTry.push(txPartner.toLowerCase());
    if (txReference)
        textsToTry.push(txReference.toLowerCase());
    // Combined: name + partner (common order)
    const namePartner = [txName, txPartner].filter(Boolean).join(" ").toLowerCase();
    if (namePartner)
        textsToTry.push(namePartner);
    // Combined: partner + name (reverse order - handles cases where fields are swapped)
    const partnerName = [txPartner, txName].filter(Boolean).join(" ").toLowerCase();
    if (partnerName && partnerName !== namePartner)
        textsToTry.push(partnerName);
    // Combined: all fields in standard order
    const allFields = [txName, txPartner, txReference].filter(Boolean).join(" ").toLowerCase();
    if (allFields && allFields !== namePartner && allFields !== partnerName)
        textsToTry.push(allFields);
    // Combined: all fields with partner first
    const partnerFirst = [txPartner, txName, txReference].filter(Boolean).join(" ").toLowerCase();
    if (partnerFirst && !textsToTry.includes(partnerFirst))
        textsToTry.push(partnerFirst);
    // Try matching against each text variant
    for (const text of textsToTry) {
        if ((0, partner_matcher_1.globMatch)(pattern, text)) {
            return true;
        }
    }
    return false;
}
function findBestMatch(txId, txPartner, txName, txReference, partners) {
    let bestMatch = null;
    // Check if we have any text to match
    const hasText = txName || txPartner || txReference;
    if (!hasText)
        return null;
    for (const partner of partners) {
        if (!partner.learnedPatterns || partner.learnedPatterns.length === 0)
            continue;
        // CRITICAL: Skip this partner if user manually removed this transaction from it
        if (partner.manualRemovalIds.has(txId)) {
            continue;
        }
        for (const pattern of partner.learnedPatterns) {
            // Use flexible matching that tries multiple field combinations
            if (matchPatternFlexible(pattern.pattern, txName, txPartner, txReference)) {
                // Use pattern confidence directly, no penalty
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
        .map((doc) => {
        const data = doc.data();
        // Build set of transaction IDs that user manually removed from this partner
        const manualRemovals = data.manualRemovals || [];
        const manualRemovalIds = new Set(manualRemovals.map((r) => r.transactionId));
        return {
            id: doc.id,
            name: data.name,
            learnedPatterns: data.learnedPatterns,
            manualRemovalIds,
        };
    });
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
                const match = findBestMatch(doc.id, data.partner || null, data.name || "", data.reference || null, partners);
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
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be logged in");
    }
    const userId = request.auth.uid;
    return await applyAllPatternsToTransactions(userId);
});
//# sourceMappingURL=applyPatterns.js.map