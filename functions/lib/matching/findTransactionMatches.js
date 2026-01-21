"use strict";
/**
 * Cloud Function: Find Transaction Matches for File (Callable)
 *
 * Called from the UI when user opens the "Connect Transaction to File" dialog.
 * Scores transactions server-side using the same algorithm as auto-matching.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.findTransactionMatchesForFile = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const transactionScoring_1 = require("./transactionScoring");
const db = (0, firestore_1.getFirestore)();
// === Helper Functions ===
/**
 * Convert Firestore Timestamp to ISO string for JSON serialization
 */
function toISOString(timestamp) {
    return timestamp.toDate().toISOString();
}
/**
 * Convert ISO string to Firestore Timestamp
 */
function toTimestamp(isoString) {
    return firestore_1.Timestamp.fromDate(new Date(isoString));
}
/**
 * Check if transaction name/partner matches search query
 */
function matchesSearchQuery(txData, query) {
    const lowerQuery = query.toLowerCase();
    const name = (txData.name || "").toLowerCase();
    const partner = (txData.partner || "").toLowerCase();
    const reference = (txData.reference || "").toLowerCase();
    return (name.includes(lowerQuery) ||
        partner.includes(lowerQuery) ||
        reference.includes(lowerQuery));
}
// === Main Callable Function ===
exports.findTransactionMatchesForFile = (0, https_1.onCall)({
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 30,
}, async (request) => {
    // === Auth Check ===
    if (!request.auth?.uid) {
        throw new https_1.HttpsError("unauthenticated", "Must be logged in");
    }
    const userId = request.auth.uid;
    const { fileId, fileInfo, excludeTransactionIds = [], searchQuery, limit = transactionScoring_1.SCORING_CONFIG.MAX_RESULTS } = request.data;
    // === Validate Input ===
    if (!fileId && !fileInfo) {
        throw new https_1.HttpsError("invalid-argument", "Must provide either fileId or fileInfo");
    }
    // === Get File Data ===
    let fileData;
    if (fileId) {
        // Fetch from Firestore
        const fileDoc = await db.collection("files").doc(fileId).get();
        if (!fileDoc.exists) {
            throw new https_1.HttpsError("not-found", `File not found: ${fileId}`);
        }
        const docData = fileDoc.data();
        // Verify ownership
        if (docData.userId !== userId) {
            throw new https_1.HttpsError("permission-denied", "Cannot access this file");
        }
        fileData = {
            extractedAmount: docData.extractedAmount,
            extractedCurrency: docData.extractedCurrency,
            extractedDate: docData.extractedDate,
            extractedPartner: docData.extractedPartner,
            extractedIban: docData.extractedIban,
            extractedText: docData.extractedText,
            partnerId: docData.partnerId,
        };
    }
    else {
        // Use provided fileInfo
        fileData = {
            extractedAmount: fileInfo.extractedAmount,
            extractedCurrency: fileInfo.extractedCurrency,
            extractedDate: fileInfo.extractedDate
                ? toTimestamp(fileInfo.extractedDate)
                : null,
            extractedPartner: fileInfo.extractedPartner,
            extractedIban: fileInfo.extractedIban,
            extractedText: fileInfo.extractedText,
            partnerId: fileInfo.partnerId,
        };
    }
    const t0 = Date.now();
    // === Query Candidate Transactions ===
    let transactions = [];
    let dateRangeStr = "";
    if (fileData.extractedDate) {
        // Query within date range
        const centerDate = fileData.extractedDate.toDate();
        const startDate = new Date(centerDate);
        startDate.setDate(startDate.getDate() - transactionScoring_1.SCORING_CONFIG.DATE_RANGE_DAYS);
        const endDate = new Date(centerDate);
        endDate.setDate(endDate.getDate() + transactionScoring_1.SCORING_CONFIG.DATE_RANGE_DAYS);
        dateRangeStr = `${startDate.toISOString().split("T")[0]} to ${endDate.toISOString().split("T")[0]}`;
        const snapshot = await db
            .collection("transactions")
            .where("userId", "==", userId)
            .where("date", ">=", firestore_1.Timestamp.fromDate(startDate))
            .where("date", "<=", firestore_1.Timestamp.fromDate(endDate))
            .orderBy("date", "desc")
            .limit(500)
            .get();
        transactions = snapshot.docs;
    }
    else {
        // No date? Query recent transactions
        dateRangeStr = "recent (no file date)";
        const snapshot = await db
            .collection("transactions")
            .where("userId", "==", userId)
            .orderBy("date", "desc")
            .limit(200)
            .get();
        transactions = snapshot.docs;
    }
    console.log(`[FindMatches] Found ${transactions.length} candidate transactions (${dateRangeStr})`);
    // === Filter and Score ===
    const excludeSet = new Set(excludeTransactionIds);
    // Fetch partner aliases if file has an assigned partner
    let partnerAliases = [];
    if (fileData.partnerId) {
        try {
            const partnerDoc = await db
                .collection("partners")
                .doc(fileData.partnerId)
                .get();
            if (partnerDoc.exists) {
                const partnerData = partnerDoc.data();
                partnerAliases = [
                    partnerData.name,
                    ...(partnerData.aliases || []),
                ].filter(Boolean);
            }
        }
        catch (error) {
            console.warn("[FindMatches] Failed to fetch partner aliases:", error);
        }
    }
    // Filter candidates
    let candidates = transactions.filter((doc) => {
        // Exclude already connected
        if (excludeSet.has(doc.id))
            return false;
        // Apply search query filter if provided
        if (searchQuery && !matchesSearchQuery(doc.data(), searchQuery)) {
            return false;
        }
        return true;
    });
    const totalCandidates = candidates.length;
    // Score each transaction
    const allScores = candidates.map((doc) => {
        const txData = doc.data();
        return (0, transactionScoring_1.scoreTransaction)({
            extractedAmount: fileData.extractedAmount,
            extractedCurrency: fileData.extractedCurrency,
            extractedDate: fileData.extractedDate,
            extractedPartner: fileData.extractedPartner,
            extractedIban: fileData.extractedIban,
            extractedText: fileData.extractedText,
            partnerId: fileData.partnerId,
        }, {
            id: doc.id,
            amount: txData.amount,
            date: txData.date,
            currency: txData.currency,
            name: txData.name,
            partner: txData.partner,
            partnerName: txData.partnerName,
            partnerId: txData.partnerId,
            partnerIban: txData.partnerIban,
            reference: txData.reference,
        }, partnerAliases);
    });
    // Sort by confidence and take top results
    // Include ALL results (not just above threshold) so UI can show full list
    const matches = allScores
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, limit)
        .map((m) => ({
        transactionId: m.transactionId,
        confidence: m.confidence,
        matchSources: m.matchSources,
        breakdown: m.breakdown,
        preview: {
            date: toISOString(m.preview.date),
            amount: m.preview.amount,
            currency: m.preview.currency,
            name: m.preview.name,
            partner: m.preview.partner,
        },
    }));
    const elapsed = Date.now() - t0;
    // Log summary
    const aboveThreshold = matches.filter((m) => m.confidence >= transactionScoring_1.SCORING_CONFIG.SUGGESTION_THRESHOLD).length;
    console.log(`[FindMatches] Returning ${matches.length} matches (${aboveThreshold} above ${transactionScoring_1.SCORING_CONFIG.SUGGESTION_THRESHOLD}% threshold) in ${elapsed}ms`);
    // Log top match for debugging
    if (matches.length > 0) {
        const top = matches[0];
        console.log(`[FindMatches] Top match: ${top.confidence}% - "${top.preview.name}" | ${(0, transactionScoring_1.formatScoreBreakdown)(top.breakdown)}`);
    }
    return {
        matches,
        totalCandidates,
    };
});
//# sourceMappingURL=findTransactionMatches.js.map