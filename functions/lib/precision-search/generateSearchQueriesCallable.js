"use strict";
/**
 * Callable Cloud Function for generating Gmail search queries
 * Uses Gemini Flash Lite for intelligent suggestions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSearchQueriesCallable = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const generateQueriesWithGemini_1 = require("./generateQueriesWithGemini");
const db = (0, firestore_1.getFirestore)();
/**
 * Generate Gmail search queries for a transaction using Gemini
 */
exports.generateSearchQueriesCallable = (0, https_1.onCall)({
    region: "europe-west1",
    memory: "256MiB",
}, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be authenticated");
    }
    const { transaction, maxQueries = 8 } = request.data;
    if (!transaction || !transaction.name) {
        throw new https_1.HttpsError("invalid-argument", "Transaction with name is required");
    }
    // Fetch partner data if partnerId is provided
    let partnerData;
    if (transaction.partnerId) {
        const collection = transaction.partnerType === "global" ? "globalPartners" : "partners";
        const partnerDoc = await db.collection(collection).doc(transaction.partnerId).get();
        if (partnerDoc.exists) {
            const data = partnerDoc.data();
            partnerData = {
                name: data.name,
                emailDomains: data.emailDomains,
                website: data.website,
                ibans: data.ibans,
                vatId: data.vatId,
                aliases: data.aliases,
                fileSourcePatterns: data.fileSourcePatterns,
            };
        }
    }
    // Generate typed suggestions using Gemini (sorted by search effectiveness)
    const suggestions = await (0, generateQueriesWithGemini_1.generateTypedQueriesWithGemini)({
        name: transaction.name,
        partner: transaction.partner,
        description: transaction.description,
        reference: transaction.reference,
        amount: transaction.amount,
    }, partnerData, maxQueries);
    // Also return plain queries for backward compatibility
    const queries = suggestions.map((s) => s.query);
    return {
        queries,
        suggestions,
    };
});
//# sourceMappingURL=generateSearchQueriesCallable.js.map