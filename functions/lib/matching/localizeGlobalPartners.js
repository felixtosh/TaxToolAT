"use strict";
/**
 * Post-processing step to convert global partner assignments to local partners.
 *
 * This runs AFTER matching completes and:
 * 1. Finds all transactions with partnerType: "global"
 * 2. Groups them by global partner ID
 * 3. Creates ONE local partner per global partner (or reuses existing)
 * 4. Batch updates all transactions to use the local partner ID
 *
 * This approach is:
 * - Fast: One query to find all global assignments, one batch write per partner
 * - Race-condition safe: Creates local partners sequentially, not in parallel
 * - Idempotent: Can run multiple times safely (checks for existing local partners)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.localizeGlobalPartnerAssignments = localizeGlobalPartnerAssignments;
const firestore_1 = require("firebase-admin/firestore");
const db = (0, firestore_1.getFirestore)();
/**
 * Convert all global partner assignments for a user to local partners.
 */
async function localizeGlobalPartnerAssignments(userId) {
    // 1. Find all transactions with partnerType: "global"
    const globalAssignmentsSnapshot = await db
        .collection("transactions")
        .where("userId", "==", userId)
        .where("partnerType", "==", "global")
        .get();
    if (globalAssignmentsSnapshot.empty) {
        return { partnersCreated: 0, transactionsUpdated: 0 };
    }
    console.log(`Found ${globalAssignmentsSnapshot.size} transactions with global partner assignments`);
    // 2. Group transactions by global partner ID
    const txsByGlobalPartnerId = new Map();
    for (const doc of globalAssignmentsSnapshot.docs) {
        const data = doc.data();
        const globalPartnerId = data.partnerId;
        if (!globalPartnerId)
            continue;
        const existing = txsByGlobalPartnerId.get(globalPartnerId) || [];
        existing.push(doc.id);
        txsByGlobalPartnerId.set(globalPartnerId, existing);
    }
    console.log(`Grouped into ${txsByGlobalPartnerId.size} unique global partners`);
    // 3. For each global partner, create/find local partner and update transactions
    let partnersCreated = 0;
    let transactionsUpdated = 0;
    for (const [globalPartnerId, transactionIds] of txsByGlobalPartnerId) {
        try {
            // Check if user already has a local partner linked to this global partner
            const existingLocalSnapshot = await db
                .collection("partners")
                .where("userId", "==", userId)
                .where("globalPartnerId", "==", globalPartnerId)
                .where("isActive", "==", true)
                .limit(1)
                .get();
            let localPartnerId;
            if (!existingLocalSnapshot.empty) {
                // Reuse existing local partner
                localPartnerId = existingLocalSnapshot.docs[0].id;
                console.log(`Reusing existing local partner ${localPartnerId} for global ${globalPartnerId}`);
            }
            else {
                // Create new local partner from global partner data
                const globalDoc = await db.collection("globalPartners").doc(globalPartnerId).get();
                if (!globalDoc.exists) {
                    console.error(`Global partner ${globalPartnerId} not found, skipping ${transactionIds.length} transactions`);
                    continue;
                }
                const globalData = globalDoc.data();
                const now = firestore_1.Timestamp.now();
                const newPartner = {
                    userId,
                    globalPartnerId,
                    name: globalData.name || "",
                    aliases: globalData.aliases || [],
                    address: globalData.address || null,
                    country: globalData.country || null,
                    vatId: globalData.vatId || null,
                    ibans: globalData.ibans || [],
                    website: globalData.website || null,
                    notes: null,
                    defaultCategoryId: null,
                    isActive: true,
                    createdAt: now,
                    updatedAt: now,
                };
                const docRef = await db.collection("partners").add(newPartner);
                localPartnerId = docRef.id;
                partnersCreated++;
                console.log(`Created local partner ${localPartnerId} from global ${globalPartnerId} (${globalData.name})`);
            }
            // 4. Batch update all transactions for this global partner
            const batch = db.batch();
            for (const txId of transactionIds) {
                const txRef = db.collection("transactions").doc(txId);
                batch.update(txRef, {
                    partnerId: localPartnerId,
                    partnerType: "user",
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                });
            }
            await batch.commit();
            transactionsUpdated += transactionIds.length;
            console.log(`Updated ${transactionIds.length} transactions to use local partner ${localPartnerId}`);
        }
        catch (err) {
            console.error(`Failed to localize global partner ${globalPartnerId}:`, err);
            // Continue with other partners
        }
    }
    // 5. Also update partnerSuggestions that reference global partners
    // This is a separate pass to handle suggestions (not just assignments)
    await localizeGlobalPartnerSuggestions(userId);
    return { partnersCreated, transactionsUpdated };
}
/**
 * Update partnerSuggestions arrays to use local partner IDs instead of global.
 * This ensures navigation works for suggestions too.
 */
async function localizeGlobalPartnerSuggestions(userId) {
    // Build a map of globalPartnerId -> localPartnerId for this user
    const localPartnersSnapshot = await db
        .collection("partners")
        .where("userId", "==", userId)
        .where("isActive", "==", true)
        .get();
    const globalToLocalMap = new Map();
    for (const doc of localPartnersSnapshot.docs) {
        const data = doc.data();
        if (data.globalPartnerId) {
            globalToLocalMap.set(data.globalPartnerId, doc.id);
        }
    }
    if (globalToLocalMap.size === 0) {
        return; // No local partners linked to global ones
    }
    // Find transactions with suggestions that might have global partners
    // We can't query inside arrays, so we fetch recent transactions and check client-side
    const recentTxSnapshot = await db
        .collection("transactions")
        .where("userId", "==", userId)
        .orderBy("updatedAt", "desc")
        .limit(500)
        .get();
    const batch = db.batch();
    let updateCount = 0;
    for (const doc of recentTxSnapshot.docs) {
        const data = doc.data();
        const suggestions = data.partnerSuggestions;
        if (!suggestions || suggestions.length === 0)
            continue;
        // Check if any suggestion references a global partner we have a local copy for
        let needsUpdate = false;
        const updatedSuggestions = suggestions.map((s) => {
            if (s.partnerType === "global" && globalToLocalMap.has(s.partnerId)) {
                needsUpdate = true;
                return {
                    ...s,
                    partnerId: globalToLocalMap.get(s.partnerId),
                    partnerType: "user",
                };
            }
            return s;
        });
        if (needsUpdate) {
            batch.update(doc.ref, {
                partnerSuggestions: updatedSuggestions,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            updateCount++;
        }
    }
    if (updateCount > 0) {
        await batch.commit();
        console.log(`Updated partnerSuggestions in ${updateCount} transactions`);
    }
}
//# sourceMappingURL=localizeGlobalPartners.js.map