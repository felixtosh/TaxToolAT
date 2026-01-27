import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import {
  matchTransactionToCategories,
  shouldAutoApplyCategory,
  isEligibleForCategoryMatching,
  CategoryData,
  TransactionData,
} from "../utils/category-matcher";

const db = getFirestore();

/**
 * Triggered when a transaction is updated.
 * Re-matches categories when partnerId is newly assigned.
 */
export const onTransactionPartnerChange = onDocumentUpdated(
  {
    document: "transactions/{transactionId}",
    region: "europe-west1",
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const transactionId = event.params.transactionId;

    if (!before || !after) return;

    // Only trigger when partnerId is newly assigned (was null, now has value)
    // OR when partnerId changed to a different partner
    const partnerWasAssigned = !before.partnerId && after.partnerId;
    const partnerChanged = before.partnerId !== after.partnerId && after.partnerId;

    if (!partnerWasAssigned && !partnerChanged) {
      return;
    }

    const userId = after.userId;
    const hasFiles = after.fileIds && after.fileIds.length > 0;
    const hasCategory = !!after.noReceiptCategoryId;

    console.log(
      `Partner ${after.partnerId} assigned to transaction ${transactionId}, triggering automations`
    );

    // Queue receipt search if transaction has no files AND no no-receipt category
    // Transactions with a no-receipt category are considered complete
    if (!hasFiles && !hasCategory) {
      try {
        const { queueReceiptSearchForTransaction } = await import(
          "../workers/runReceiptSearchForTransaction"
        );

        queueReceiptSearchForTransaction({
          transactionId,
          userId,
          partnerId: after.partnerId,
        })
          .then((result) => {
            if (result.skipped) {
              console.log(`[onTransactionPartnerChange] Receipt search skipped: ${result.skipReason}`);
            } else {
              console.log(`[onTransactionPartnerChange] Receipt search queued for ${transactionId}`);
            }
          })
          .catch((err) => {
            console.error(`[onTransactionPartnerChange] Failed to queue receipt search:`, err);
          });
      } catch (err) {
        console.error(`[onTransactionPartnerChange] Failed to import receipt search module:`, err);
      }
    }

    // Skip category matching if already has category or files
    if (hasCategory || hasFiles) {
      return;
    }

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
      const categoryManualRemovals = new Map<string, Set<string>>();

      const categories: CategoryData[] = categoriesSnapshot.docs.map((doc) => {
        const data = doc.data();

        const removals = data.manualRemovals || [];
        if (removals.length > 0) {
          categoryManualRemovals.set(
            doc.id,
            new Set(removals.map((r: { transactionId: string }) => r.transactionId))
          );
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
      const transaction: TransactionData = {
        id: transactionId,
        partner: after.partner || null,
        partnerId: after.partnerId || null,
        name: after.name || "",
        reference: after.reference || null,
        noReceiptCategoryId: after.noReceiptCategoryId || null,
        fileIds: after.fileIds || [],
      };

      if (!isEligibleForCategoryMatching(transaction)) {
        return;
      }

      // Match transaction to categories
      const matches = matchTransactionToCategories(
        transaction,
        categories,
        categoryManualRemovals
      );

      if (matches.length > 0) {
        const topMatch = matches[0];
        const updates: Record<string, unknown> = {
          categorySuggestions: matches.map((m) => ({
            categoryId: m.categoryId,
            templateId: m.templateId,
            confidence: m.confidence,
            source: m.source,
          })),
          updatedAt: FieldValue.serverTimestamp(),
        };

        if (shouldAutoApplyCategory(topMatch.confidence)) {
          updates.noReceiptCategoryId = topMatch.categoryId;
          updates.noReceiptCategoryTemplateId = topMatch.templateId;
          updates.noReceiptCategoryConfidence = topMatch.confidence;
          updates.noReceiptCategoryMatchedBy = "auto";
          updates.isComplete = true;

          // Also link partner to category
          const category = categories.find((c) => c.id === topMatch.categoryId);
          if (category && after.partnerId && !category.matchedPartnerIds.includes(after.partnerId)) {
            await db.collection("noReceiptCategories").doc(topMatch.categoryId).update({
              matchedPartnerIds: FieldValue.arrayUnion(after.partnerId),
              updatedAt: FieldValue.serverTimestamp(),
            });
            console.log(`Linked partner ${after.partnerId} to category ${topMatch.templateId}`);
          }

          console.log(
            `Auto-matched transaction ${transactionId} to category ${topMatch.templateId} (${topMatch.confidence}%)`
          );
        } else {
          console.log(
            `Added ${matches.length} category suggestions to transaction ${transactionId}`
          );
        }

        await db.collection("transactions").doc(transactionId).update(updates);
      }
    } catch (error) {
      console.error(
        `Error re-matching categories for transaction ${transactionId}:`,
        error
      );
    }
  }
);
