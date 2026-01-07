import {
  collection,
  query,
  orderBy,
  where,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  addDoc,
  Timestamp,
  writeBatch,
  increment,
  arrayUnion,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/config";
import {
  UserNoReceiptCategory,
  NoReceiptCategoryId,
  CategoryLearnedPattern,
  CategoryManualRemoval,
  ReceiptLostEntry,
} from "@/types/no-receipt-category";
import { Transaction } from "@/types/transaction";
import { NO_RECEIPT_CATEGORY_TEMPLATES } from "@/lib/data/no-receipt-category-templates";
import { OperationsContext } from "./types";

const CATEGORIES_COLLECTION = "noReceiptCategories";
const TRANSACTIONS_COLLECTION = "transactions";

// ============ Category Management ============

/**
 * List all active no-receipt categories for the current user
 */
export async function listUserCategories(
  ctx: OperationsContext
): Promise<UserNoReceiptCategory[]> {
  const q = query(
    collection(ctx.db, CATEGORIES_COLLECTION),
    where("userId", "==", ctx.userId),
    where("isActive", "==", true),
    orderBy("name", "asc")
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as UserNoReceiptCategory[];
}

/**
 * Get a single category by ID
 */
export async function getUserCategory(
  ctx: OperationsContext,
  categoryId: string
): Promise<UserNoReceiptCategory | null> {
  const docRef = doc(ctx.db, CATEGORIES_COLLECTION, categoryId);
  const snapshot = await getDoc(docRef);

  if (!snapshot.exists()) return null;

  const data = snapshot.data();
  if (data.userId !== ctx.userId) return null;

  return { id: snapshot.id, ...data } as UserNoReceiptCategory;
}

/**
 * Update a category's fields
 */
export async function updateUserCategory(
  ctx: OperationsContext,
  categoryId: string,
  updates: Partial<Pick<UserNoReceiptCategory, "learnedPatterns" | "matchedPartnerIds">>
): Promise<void> {
  const category = await getUserCategory(ctx, categoryId);
  if (!category) {
    throw new Error(`Category ${categoryId} not found or access denied`);
  }

  await updateDoc(doc(ctx.db, CATEGORIES_COLLECTION, categoryId), {
    ...updates,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Get a category by template ID
 */
export async function getCategoryByTemplateId(
  ctx: OperationsContext,
  templateId: NoReceiptCategoryId
): Promise<UserNoReceiptCategory | null> {
  const q = query(
    collection(ctx.db, CATEGORIES_COLLECTION),
    where("userId", "==", ctx.userId),
    where("templateId", "==", templateId),
    where("isActive", "==", true)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;

  return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as UserNoReceiptCategory;
}

/**
 * Initialize user categories from templates.
 * Creates user-specific copies of all category templates.
 * Skips categories that already exist.
 */
export async function initializeUserCategories(
  ctx: OperationsContext
): Promise<{ created: number; skipped: number }> {
  const existing = await listUserCategories(ctx);
  const existingTemplateIds = new Set(existing.map((c) => c.templateId));

  const now = Timestamp.now();
  let created = 0;
  let skipped = 0;

  const batch = writeBatch(ctx.db);

  for (const template of NO_RECEIPT_CATEGORY_TEMPLATES) {
    if (existingTemplateIds.has(template.id)) {
      skipped++;
      continue;
    }

    const newCategory: Omit<UserNoReceiptCategory, "id"> = {
      userId: ctx.userId,
      templateId: template.id,
      name: template.name,
      description: template.description,
      helperText: template.helperText,
      matchedPartnerIds: [],
      learnedPatterns: [],
      transactionCount: 0,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = doc(collection(ctx.db, CATEGORIES_COLLECTION));
    batch.set(docRef, newCategory);
    created++;
  }

  if (created > 0) {
    await batch.commit();
  }

  console.log(`[Categories] Initialized ${created} categories, skipped ${skipped} existing`);
  return { created, skipped };
}

// ============ Transaction Category Assignment ============

/**
 * Assign a no-receipt category to a transaction.
 * Marks transaction as complete and clears any file connections.
 */
export async function assignCategoryToTransaction(
  ctx: OperationsContext,
  transactionId: string,
  categoryId: string,
  matchedBy: "manual" | "suggestion" | "auto",
  confidence?: number
): Promise<void> {
  // Verify transaction ownership
  const txDoc = doc(ctx.db, TRANSACTIONS_COLLECTION, transactionId);
  const txSnapshot = await getDoc(txDoc);

  if (!txSnapshot.exists() || txSnapshot.data().userId !== ctx.userId) {
    throw new Error(`Transaction ${transactionId} not found or access denied`);
  }

  // Verify category ownership
  const category = await getUserCategory(ctx, categoryId);
  if (!category) {
    throw new Error(`Category ${categoryId} not found or access denied`);
  }

  const txData = { id: transactionId, ...txSnapshot.data() } as Transaction;
  const batch = writeBatch(ctx.db);

  // Update transaction
  batch.update(txDoc, {
    noReceiptCategoryId: categoryId,
    noReceiptCategoryTemplateId: category.templateId,
    noReceiptCategoryMatchedBy: matchedBy,
    noReceiptCategoryConfidence: confidence || (matchedBy === "manual" ? 100 : null),
    isComplete: true,
    updatedAt: Timestamp.now(),
  });

  // Increment category transaction count
  const categoryRef = doc(ctx.db, CATEGORIES_COLLECTION, categoryId);
  batch.update(categoryRef, {
    transactionCount: increment(1),
    updatedAt: Timestamp.now(),
  });

  // If transaction has a partner and category doesn't have this partner, add it
  if (txData.partnerId && matchedBy === "manual") {
    if (!category.matchedPartnerIds.includes(txData.partnerId)) {
      batch.update(categoryRef, {
        matchedPartnerIds: arrayUnion(txData.partnerId),
      });
      console.log(`[Category] Added partner ${txData.partnerId} to category ${categoryId}`);
    }
  }

  await batch.commit();

  // Learn patterns from this assignment (non-blocking)
  if (matchedBy === "manual" || matchedBy === "suggestion") {
    learnCategoryPatternFromTransaction(ctx, categoryId, txData).catch((error) => {
      console.error("Failed to learn category pattern:", error);
    });
  }
}

/**
 * Assign "receipt lost" category with required reason/description.
 * Creates an Eigenbeleg (self-generated receipt) entry.
 */
export async function assignReceiptLostCategory(
  ctx: OperationsContext,
  transactionId: string,
  reason: string,
  description: string
): Promise<void> {
  // Find the receipt-lost category
  const category = await getCategoryByTemplateId(ctx, "receipt-lost");
  if (!category) {
    // Initialize categories first
    await initializeUserCategories(ctx);
    const freshCategory = await getCategoryByTemplateId(ctx, "receipt-lost");
    if (!freshCategory) {
      throw new Error("Failed to find or create receipt-lost category");
    }
    return assignReceiptLostCategory(ctx, transactionId, reason, description);
  }

  // Verify transaction ownership
  const txDoc = doc(ctx.db, TRANSACTIONS_COLLECTION, transactionId);
  const txSnapshot = await getDoc(txDoc);

  if (!txSnapshot.exists() || txSnapshot.data().userId !== ctx.userId) {
    throw new Error(`Transaction ${transactionId} not found or access denied`);
  }

  const now = Timestamp.now();

  // Create receipt lost entry (Eigenbeleg)
  const receiptLostEntry: ReceiptLostEntry = {
    reason: reason.trim(),
    description: description.trim(),
    createdAt: now,
    confirmed: true,
  };

  const batch = writeBatch(ctx.db);

  // Update transaction
  batch.update(txDoc, {
    noReceiptCategoryId: category.id,
    noReceiptCategoryTemplateId: "receipt-lost",
    noReceiptCategoryMatchedBy: "manual",
    noReceiptCategoryConfidence: 100,
    receiptLostEntry,
    isComplete: true,
    updatedAt: now,
  });

  // Increment category transaction count
  const categoryRef = doc(ctx.db, CATEGORIES_COLLECTION, category.id);
  batch.update(categoryRef, {
    transactionCount: increment(1),
    updatedAt: now,
  });

  await batch.commit();
}

/**
 * Remove category assignment from a transaction.
 * Marks transaction as incomplete.
 * If category was system-recommended (auto/suggestion), tracks as manual removal (false positive).
 */
export async function removeCategoryFromTransaction(
  ctx: OperationsContext,
  transactionId: string
): Promise<void> {
  const txDoc = doc(ctx.db, TRANSACTIONS_COLLECTION, transactionId);
  const txSnapshot = await getDoc(txDoc);

  if (!txSnapshot.exists() || txSnapshot.data().userId !== ctx.userId) {
    throw new Error(`Transaction ${transactionId} not found or access denied`);
  }

  const txData = txSnapshot.data();
  const categoryId = txData.noReceiptCategoryId;
  const matchedBy = txData.noReceiptCategoryMatchedBy;

  if (!categoryId) {
    // No category assigned, nothing to do
    return;
  }

  // Check if this was a system-recommended assignment (auto or suggestion)
  const wasSystemRecommended = matchedBy === "auto" || matchedBy === "suggestion";

  const batch = writeBatch(ctx.db);

  // Check if transaction has files (if so, it might still be complete)
  const hasFiles = txData.fileIds && txData.fileIds.length > 0;
  const hasDescription = txData.description && txData.description.trim().length > 0;

  // Clear category fields
  batch.update(txDoc, {
    noReceiptCategoryId: null,
    noReceiptCategoryTemplateId: null,
    noReceiptCategoryMatchedBy: null,
    noReceiptCategoryConfidence: null,
    receiptLostEntry: null,
    // Only mark incomplete if no files attached
    isComplete: hasFiles && hasDescription,
    updatedAt: Timestamp.now(),
  });

  // Decrement category transaction count
  const categoryRef = doc(ctx.db, CATEGORIES_COLLECTION, categoryId);
  batch.update(categoryRef, {
    transactionCount: increment(-1),
    updatedAt: Timestamp.now(),
  });

  await batch.commit();

  // Build transaction text for pattern matching
  const transactionText = [txData.partner, txData.name].filter(Boolean).join(" ");

  // If this was a system-recommended assignment, track as false positive
  if (wasSystemRecommended) {
    try {
      const categorySnapshot = await getDoc(categoryRef);

      if (categorySnapshot.exists()) {
        const categoryData = categorySnapshot.data();
        const existingRemovals: CategoryManualRemoval[] = categoryData.manualRemovals || [];

        // Check if this transaction is already in manualRemovals (prevent duplicates)
        const alreadyRemoved = existingRemovals.some((r) => r.transactionId === transactionId);

        if (!alreadyRemoved) {
          // Store as manual removal (false positive) for pattern learning
          const removalEntry: CategoryManualRemoval = {
            transactionId,
            removedAt: Timestamp.now(),
            partner: txData.partner || null,
            name: txData.name || "",
          };

          await updateDoc(categoryRef, {
            manualRemovals: arrayUnion(removalEntry),
            updatedAt: Timestamp.now(),
          });

          console.log(`[Category Manual Removal] Stored false positive for category ${categoryId}: tx ${transactionId}`);
        } else {
          console.log(`[Category Manual Removal] Tx ${transactionId} already in manualRemovals, skipping`);
        }
      }

      // Unlearn patterns from this false positive (non-blocking)
      unlearnCategoryPatternFromTransaction(ctx, categoryId, transactionId, transactionText).catch((error) => {
        console.error("Failed to unlearn category pattern:", error);
      });
    } catch (error) {
      console.error("Failed to store category manual removal:", error);
      // Don't throw - manual removal tracking is non-critical
    }
  }

  // Also unlearn patterns for manual removals (user explicitly disconnected)
  if (matchedBy === "manual") {
    unlearnCategoryPatternFromTransaction(ctx, categoryId, transactionId, transactionText).catch((error) => {
      console.error("Failed to unlearn category pattern on manual removal:", error);
    });
  }

  // Trigger re-matching to find a new category for this transaction
  triggerCategoryMatching([transactionId]).catch((error) => {
    console.error("Failed to trigger category re-matching:", error);
  });
}

/**
 * Trigger category matching for specific transactions via Cloud Function.
 * Non-blocking - runs in background.
 */
async function triggerCategoryMatching(transactionIds: string[]): Promise<void> {
  const matchCategories = httpsCallable<
    { transactionIds: string[] },
    { processed: number; autoMatched: number; withSuggestions: number }
  >(functions, "matchCategories");

  const result = await matchCategories({ transactionIds });
  console.log(
    `[Category Re-match] Processed ${result.data.processed}, auto-matched ${result.data.autoMatched}, suggestions ${result.data.withSuggestions}`
  );
}

// ============ Pattern Learning ============

/**
 * Remove a transaction from learned patterns when it's removed from a category.
 * If a pattern has no remaining source transactions, remove it entirely.
 * If the removal is a false positive, also reduce confidence on matching patterns.
 */
async function unlearnCategoryPatternFromTransaction(
  ctx: OperationsContext,
  categoryId: string,
  transactionId: string,
  transactionText: string
): Promise<void> {
  const category = await getUserCategory(ctx, categoryId);
  if (!category || category.learnedPatterns.length === 0) return;

  // Find patterns that reference this transaction
  const updatedPatterns = category.learnedPatterns
    .map((pattern) => {
      // Remove transaction from source list
      const newSourceIds = pattern.sourceTransactionIds.filter(
        (id) => id !== transactionId
      );

      // If this transaction was a source, update the pattern
      if (newSourceIds.length !== pattern.sourceTransactionIds.length) {
        // If no more sources, mark for removal (return null)
        if (newSourceIds.length === 0) {
          console.log(`[Category Pattern] Removing pattern "${pattern.pattern}" - no source transactions remaining`);
          return null;
        }

        // Reduce confidence since we lost a source
        const newConfidence = Math.max(50, pattern.confidence - 5);

        return {
          ...pattern,
          sourceTransactionIds: newSourceIds,
          confidence: newConfidence,
        };
      }

      // Check if this transaction's text matches this pattern (even if not in sources)
      // If so, reduce confidence as a false positive signal
      const patternRegex = new RegExp(
        "^" + pattern.pattern.toLowerCase().replace(/\*/g, ".*") + "$"
      );
      if (patternRegex.test(transactionText.toLowerCase())) {
        // This is a false positive - reduce confidence significantly
        const newConfidence = Math.max(40, pattern.confidence - 15);
        console.log(`[Category Pattern] Reducing confidence on "${pattern.pattern}" due to false positive (${pattern.confidence} -> ${newConfidence})`);

        // If confidence drops too low, remove the pattern
        if (newConfidence <= 40) {
          console.log(`[Category Pattern] Removing pattern "${pattern.pattern}" - confidence too low`);
          return null;
        }

        return {
          ...pattern,
          confidence: newConfidence,
        };
      }

      return pattern;
    })
    .filter((p): p is CategoryLearnedPattern => p !== null);

  // Update if patterns changed
  if (updatedPatterns.length !== category.learnedPatterns.length ||
      JSON.stringify(updatedPatterns) !== JSON.stringify(category.learnedPatterns)) {
    await updateDoc(doc(ctx.db, CATEGORIES_COLLECTION, categoryId), {
      learnedPatterns: updatedPatterns,
      patternsUpdatedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }
}

/**
 * Learn a pattern from a transaction assigned to a category.
 * Creates glob patterns from transaction text for future matching.
 */
async function learnCategoryPatternFromTransaction(
  ctx: OperationsContext,
  categoryId: string,
  transaction: Transaction
): Promise<void> {
  // Build text to analyze
  const textParts = [
    transaction.partner,
    transaction.name,
  ].filter(Boolean);

  if (textParts.length === 0) return;

  const text = textParts.join(" ").toLowerCase().trim();
  if (text.length < 3) return;

  // Simple pattern extraction:
  // - Extract significant words (length >= 3)
  // - Create glob patterns like "*word1*word2*"
  const words = text
    .replace(/[^a-z0-9äöüß\s]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3)
    .slice(0, 3); // Max 3 words

  if (words.length === 0) return;

  const pattern = "*" + words.join("*") + "*";

  // Check if pattern already exists
  const category = await getUserCategory(ctx, categoryId);
  if (!category) return;

  const existingPattern = category.learnedPatterns.find(
    (p) => p.pattern.toLowerCase() === pattern.toLowerCase()
  );

  if (existingPattern) {
    // Update existing pattern with new source transaction
    if (!existingPattern.sourceTransactionIds.includes(transaction.id)) {
      const updatedPatterns = category.learnedPatterns.map((p) =>
        p.pattern.toLowerCase() === pattern.toLowerCase()
          ? {
              ...p,
              sourceTransactionIds: [...p.sourceTransactionIds, transaction.id],
              confidence: Math.min(100, p.confidence + 2), // Slight boost
            }
          : p
      );

      await updateDoc(doc(ctx.db, CATEGORIES_COLLECTION, categoryId), {
        learnedPatterns: updatedPatterns,
        patternsUpdatedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    }
  } else {
    // Create new pattern
    const newPattern: CategoryLearnedPattern = {
      pattern,
      confidence: 75, // Start at 75%
      createdAt: Timestamp.now(),
      sourceTransactionIds: [transaction.id],
    };

    await updateDoc(doc(ctx.db, CATEGORIES_COLLECTION, categoryId), {
      learnedPatterns: arrayUnion(newPattern),
      patternsUpdatedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    console.log(`[Category Pattern] Learned new pattern "${pattern}" for category ${categoryId}`);
  }
}

/**
 * Add a partner to a category's matched partners list.
 */
export async function addPartnerToCategory(
  ctx: OperationsContext,
  categoryId: string,
  partnerId: string
): Promise<void> {
  const category = await getUserCategory(ctx, categoryId);
  if (!category) {
    throw new Error(`Category ${categoryId} not found or access denied`);
  }

  if (category.matchedPartnerIds.includes(partnerId)) {
    // Already added
    return;
  }

  await updateDoc(doc(ctx.db, CATEGORIES_COLLECTION, categoryId), {
    matchedPartnerIds: arrayUnion(partnerId),
    updatedAt: Timestamp.now(),
  });
}

/**
 * Remove a partner from a category's matched partners list.
 */
export async function removePartnerFromCategory(
  ctx: OperationsContext,
  categoryId: string,
  partnerId: string
): Promise<void> {
  const category = await getUserCategory(ctx, categoryId);
  if (!category) {
    throw new Error(`Category ${categoryId} not found or access denied`);
  }

  const updatedPartnerIds = category.matchedPartnerIds.filter(
    (id) => id !== partnerId
  );

  await updateDoc(doc(ctx.db, CATEGORIES_COLLECTION, categoryId), {
    matchedPartnerIds: updatedPartnerIds,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Remove a manual removal entry from a category.
 * This allows the transaction to be auto-matched to this category again.
 */
export async function clearManualRemoval(
  ctx: OperationsContext,
  categoryId: string,
  transactionId: string
): Promise<void> {
  const category = await getUserCategory(ctx, categoryId);
  if (!category) {
    throw new Error(`Category ${categoryId} not found or access denied`);
  }

  const existingRemovals = category.manualRemovals || [];
  const updatedRemovals = existingRemovals.filter(
    (r) => r.transactionId !== transactionId
  );

  await updateDoc(doc(ctx.db, CATEGORIES_COLLECTION, categoryId), {
    manualRemovals: updatedRemovals,
    updatedAt: Timestamp.now(),
  });

  console.log(`[Category] Cleared manual removal for tx ${transactionId} from category ${categoryId}`);

  // Trigger re-matching for this transaction since it's now eligible again
  triggerCategoryMatching([transactionId]).catch((error) => {
    console.error("Failed to trigger category re-matching after clearing removal:", error);
  });
}

// ============ Admin Functions ============

/**
 * Retrigger category initialization for a user.
 * - Creates any missing categories from templates
 * - Auto-migrates orphaned category references (by name matching)
 * - Recalculates transaction counts
 */
export async function retriggerUserCategories(
  ctx: OperationsContext
): Promise<{ created: number; migrated: number; recalculated: number }> {
  // 1. Initialize any missing categories
  const { created } = await initializeUserCategories(ctx);

  // 2. Get all categories (fresh)
  const categories = await listUserCategories(ctx);
  const categoryByTemplateId = new Map(categories.map((c) => [c.templateId, c]));
  const categoryByName = new Map(
    categories.map((c) => [c.name.toLowerCase(), c])
  );

  // 3. Find transactions with orphaned categories and migrate them
  const orphanedQuery = query(
    collection(ctx.db, TRANSACTIONS_COLLECTION),
    where("userId", "==", ctx.userId),
    where("noReceiptCategoryId", "!=", null)
  );

  const orphanedSnapshot = await getDocs(orphanedQuery);
  let migrated = 0;

  const batch = writeBatch(ctx.db);
  let batchCount = 0;
  const MAX_BATCH_SIZE = 450;

  for (const txDoc of orphanedSnapshot.docs) {
    const txData = txDoc.data();
    const categoryId = txData.noReceiptCategoryId;

    // Check if category still exists
    const categoryExists = categories.some((c) => c.id === categoryId);

    if (!categoryExists) {
      // Try to migrate by template ID first, then by name
      let newCategory: UserNoReceiptCategory | undefined;

      if (txData.noReceiptCategoryTemplateId) {
        newCategory = categoryByTemplateId.get(txData.noReceiptCategoryTemplateId);
      }

      if (!newCategory) {
        // Try fuzzy name match - this handles renamed categories
        const templateName = NO_RECEIPT_CATEGORY_TEMPLATES.find(
          (t) => t.id === txData.noReceiptCategoryTemplateId
        )?.name;

        if (templateName) {
          newCategory = categoryByName.get(templateName.toLowerCase());
        }
      }

      if (newCategory) {
        batch.update(txDoc.ref, {
          noReceiptCategoryId: newCategory.id,
          updatedAt: Timestamp.now(),
        });
        migrated++;
        batchCount++;
      } else {
        // Can't migrate - clear the category
        batch.update(txDoc.ref, {
          noReceiptCategoryId: null,
          noReceiptCategoryTemplateId: null,
          noReceiptCategoryMatchedBy: null,
          noReceiptCategoryConfidence: null,
          isComplete: false,
          updatedAt: Timestamp.now(),
        });
        batchCount++;
      }

      // Commit batch if approaching limit
      if (batchCount >= MAX_BATCH_SIZE) {
        await batch.commit();
        batchCount = 0;
      }
    }
  }

  // Commit remaining
  if (batchCount > 0) {
    await batch.commit();
  }

  // 4. Recalculate transaction counts for each category
  let recalculated = 0;
  for (const category of categories) {
    const countQuery = query(
      collection(ctx.db, TRANSACTIONS_COLLECTION),
      where("userId", "==", ctx.userId),
      where("noReceiptCategoryId", "==", category.id)
    );

    const countSnapshot = await getDocs(countQuery);
    const actualCount = countSnapshot.size;

    if (category.transactionCount !== actualCount) {
      await updateDoc(doc(ctx.db, CATEGORIES_COLLECTION, category.id), {
        transactionCount: actualCount,
        updatedAt: Timestamp.now(),
      });
      recalculated++;
    }
  }

  console.log(
    `[Categories] Retrigger complete: ${created} created, ${migrated} migrated, ${recalculated} recalculated`
  );

  return { created, migrated, recalculated };
}

/**
 * Check if user has initialized their categories
 */
export async function hasUserCategories(ctx: OperationsContext): Promise<boolean> {
  const categories = await listUserCategories(ctx);
  return categories.length > 0;
}

/**
 * Get category statistics for admin view
 */
export async function getCategoryStats(
  ctx: OperationsContext
): Promise<
  Array<{
    category: UserNoReceiptCategory;
    actualTransactionCount: number;
    matchedPartnersCount: number;
    patternsCount: number;
  }>
> {
  const categories = await listUserCategories(ctx);

  const stats = await Promise.all(
    categories.map(async (category) => {
      // Get actual transaction count
      const countQuery = query(
        collection(ctx.db, TRANSACTIONS_COLLECTION),
        where("userId", "==", ctx.userId),
        where("noReceiptCategoryId", "==", category.id)
      );
      const countSnapshot = await getDocs(countQuery);

      return {
        category,
        actualTransactionCount: countSnapshot.size,
        matchedPartnersCount: category.matchedPartnerIds.length,
        patternsCount: category.learnedPatterns.length,
      };
    })
  );

  return stats;
}
