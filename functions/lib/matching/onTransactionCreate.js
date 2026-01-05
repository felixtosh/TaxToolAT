"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onTransactionCreate = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const firestore_2 = require("firebase-admin/firestore");
const partner_matcher_1 = require("../utils/partner-matcher");
const db = (0, firestore_2.getFirestore)();
/**
 * Triggered when a new transaction is created
 * Finds matching partners and either auto-assigns or stores suggestions
 */
exports.onTransactionCreate = (0, firestore_1.onDocumentCreated)({
    document: "transactions/{transactionId}",
    region: "europe-west1",
}, async (event) => {
    const snapshot = event.data;
    if (!snapshot)
        return;
    const transactionData = snapshot.data();
    const transactionId = snapshot.id;
    const userId = transactionData.userId;
    // Skip if already has a partner assigned
    if (transactionData.partnerId) {
        console.log(`Transaction ${transactionId} already has partner assigned`);
        return;
    }
    const transaction = {
        id: transactionId,
        partner: transactionData.partner || null,
        partnerIban: transactionData.partnerIban || null,
        name: transactionData.name || "",
    };
    try {
        // Get user's partners
        const userPartnersSnapshot = await db
            .collection("partners")
            .where("userId", "==", userId)
            .where("isActive", "==", true)
            .get();
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
        // Get global partners
        const globalPartnersSnapshot = await db
            .collection("globalPartners")
            .where("isActive", "==", true)
            .get();
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
        // Run matching
        const matches = (0, partner_matcher_1.matchTransaction)(transaction, userPartners, globalPartners);
        if (matches.length === 0) {
            console.log(`No matches found for transaction ${transactionId}`);
            return;
        }
        const topMatch = matches[0];
        const updates = {
            updatedAt: firestore_2.FieldValue.serverTimestamp(),
        };
        // Auto-apply if confidence >= 95%
        if ((0, partner_matcher_1.shouldAutoApply)(topMatch.confidence)) {
            updates.partnerId = topMatch.partnerId;
            updates.partnerType = topMatch.partnerType;
            updates.partnerMatchConfidence = topMatch.confidence;
            updates.partnerMatchedBy = "auto";
            console.log(`Auto-assigned partner ${topMatch.partnerName} to transaction ${transactionId} (${topMatch.confidence}% confidence)`);
        }
        // Store suggestions
        updates.partnerSuggestions = matches.map((m) => ({
            partnerId: m.partnerId,
            partnerType: m.partnerType,
            confidence: m.confidence,
            source: m.source,
        }));
        await snapshot.ref.update(updates);
        console.log(`Updated transaction ${transactionId} with ${matches.length} suggestions`);
    }
    catch (error) {
        console.error(`Error matching transaction ${transactionId}:`, error);
    }
});
//# sourceMappingURL=onTransactionCreate.js.map