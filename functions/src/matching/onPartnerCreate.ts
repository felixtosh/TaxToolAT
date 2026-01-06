import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import {
  matchTransaction,
  shouldAutoApply,
  PartnerData,
  TransactionData,
} from "../utils/partner-matcher";

const db = getFirestore();

/**
 * Triggered when a new user partner is created
 * Re-matches unmatched transactions for that user
 */
export const onPartnerCreate = onDocumentCreated(
  {
    document: "partners/{partnerId}",
    region: "europe-west1",
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const partnerData = snapshot.data();
    const partnerId = snapshot.id;
    const userId = partnerData.userId;

    console.log(`New partner created: ${partnerData.name} (${partnerId}) for user ${userId}`);

    try {
      // Get unmatched transactions for this user (no partnerId set)
      const unmatchedSnapshot = await db
        .collection("transactions")
        .where("userId", "==", userId)
        .where("partnerId", "==", null)
        .limit(500)
        .get();

      if (unmatchedSnapshot.empty) {
        console.log(`No unmatched transactions found for user ${userId}`);
        return;
      }

      console.log(`Found ${unmatchedSnapshot.size} unmatched transactions`);

      // Get all partners for matching
      const userPartnersSnapshot = await db
        .collection("partners")
        .where("userId", "==", userId)
        .where("isActive", "==", true)
        .get();

      // Build map of partnerId -> Set<transactionIds> for manual removals
      const partnerManualRemovals = new Map<string, Set<string>>();

      const userPartners: PartnerData[] = userPartnersSnapshot.docs.map((doc) => {
        const data = doc.data();

        // Track manual removals for this partner
        const removals = data.manualRemovals || [];
        if (removals.length > 0) {
          partnerManualRemovals.set(
            doc.id,
            new Set(removals.map((r: { transactionId: string }) => r.transactionId))
          );
        }

        return {
          id: doc.id,
          name: data.name,
          aliases: data.aliases || [],
          ibans: data.ibans || [],
          website: data.website,
          vatId: data.vatId,
        };
      });

      const globalPartnersSnapshot = await db
        .collection("globalPartners")
        .where("isActive", "==", true)
        .get();

      const globalPartners: PartnerData[] = globalPartnersSnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name,
          aliases: data.aliases || [],
          ibans: data.ibans || [],
          website: data.website,
          vatId: data.vatId,
          patterns: data.patterns || [],
        };
      });

      // Process each unmatched transaction
      const batch = db.batch();
      let batchCount = 0;
      let autoMatched = 0;
      let suggestionsAdded = 0;
      const BATCH_LIMIT = 500;

      for (const txDoc of unmatchedSnapshot.docs) {
        const txData = txDoc.data();
        const transaction: TransactionData = {
          id: txDoc.id,
          partner: txData.partner || null,
          partnerIban: txData.partnerIban || null,
          name: txData.name || "",
          reference: txData.reference || null,
        };

        const matches = matchTransaction(transaction, userPartners, globalPartners);

        if (matches.length > 0) {
          // Filter out matches where user explicitly removed this transaction from the partner
          const filteredMatches = matches.filter((m) => {
            const removals = partnerManualRemovals.get(m.partnerId);
            if (removals && removals.has(txDoc.id)) {
              console.log(`  -> Skipping partner ${m.partnerId} - tx ${txDoc.id} was manually removed`);
              return false;
            }
            return true;
          });

          if (filteredMatches.length === 0) {
            // All matches were filtered out due to manual removals
            continue;
          }

          const topMatch = filteredMatches[0];
          const updates: Record<string, unknown> = {
            partnerSuggestions: filteredMatches.map((m) => ({
              partnerId: m.partnerId,
              partnerType: m.partnerType,
              confidence: m.confidence,
              source: m.source,
            })),
            updatedAt: FieldValue.serverTimestamp(),
          };

          if (shouldAutoApply(topMatch.confidence)) {
            updates.partnerId = topMatch.partnerId;
            updates.partnerType = topMatch.partnerType;
            updates.partnerMatchConfidence = topMatch.confidence;
            updates.partnerMatchedBy = "auto";
            autoMatched++;
          } else {
            suggestionsAdded++;
          }

          batch.update(txDoc.ref, updates);
          batchCount++;

          if (batchCount >= BATCH_LIMIT) {
            await batch.commit();
            console.log(`Committed batch of ${batchCount} updates`);
            batchCount = 0;
          }
        }
      }

      if (batchCount > 0) {
        await batch.commit();
      }

      console.log(
        `Partner ${partnerData.name}: auto-matched ${autoMatched} transactions, added suggestions to ${suggestionsAdded}`
      );
    } catch (error) {
      console.error(`Error re-matching transactions for partner ${partnerId}:`, error);
    }
  }
);
