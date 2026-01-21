import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import {
  TEST_SOURCE_ID,
  generateTestSource,
  generateTestTransactions,
} from "@/lib/test-data/generate-test-transactions";
import { OperationsContext } from "./types";

const SOURCES_COLLECTION = "sources";
const TRANSACTIONS_COLLECTION = "transactions";

/**
 * Check if test data is currently active for the current user
 */
export async function isTestDataActive(ctx: OperationsContext): Promise<boolean> {
  // Don't check if no userId
  if (!ctx.userId) {
    return false;
  }

  const docRef = doc(ctx.db, SOURCES_COLLECTION, TEST_SOURCE_ID);
  const docSnap = await getDoc(docRef);

  // Check if exists, is active, AND belongs to current user
  return docSnap.exists() &&
    docSnap.data()?.isActive === true &&
    docSnap.data()?.userId === ctx.userId;
}

/**
 * Activate test data - creates test source and 100 sample transactions
 */
export async function activateTestData(ctx: OperationsContext): Promise<{
  sourceId: string;
  transactionCount: number;
}> {
  // Validate userId is present
  if (!ctx.userId) {
    throw new Error("Cannot activate test data without a valid user ID");
  }

  // Generate test data
  const testSource = generateTestSource();
  const testTransactions = await generateTestTransactions();

  // Use batch write for atomic operation
  const batch = writeBatch(ctx.db);

  // Add the test source with specific ID, using actual user's ID
  const sourceRef = doc(ctx.db, SOURCES_COLLECTION, TEST_SOURCE_ID);
  batch.set(sourceRef, { ...testSource, userId: ctx.userId });

  // Add all transactions with actual user's ID
  for (const txn of testTransactions) {
    const txnRef = doc(ctx.db, TRANSACTIONS_COLLECTION, txn.id);
    batch.set(txnRef, { ...txn, userId: ctx.userId });
  }

  await batch.commit();

  return {
    sourceId: TEST_SOURCE_ID,
    transactionCount: testTransactions.length,
  };
}

/**
 * Deactivate test data - removes test source and all its transactions
 */
export async function deactivateTestData(ctx: OperationsContext): Promise<{
  deletedTransactions: number;
}> {
  // Validate userId is present
  if (!ctx.userId) {
    throw new Error("Cannot deactivate test data without a valid user ID");
  }

  // Find all transactions for this source AND user
  const q = query(
    collection(ctx.db, TRANSACTIONS_COLLECTION),
    where("sourceId", "==", TEST_SOURCE_ID),
    where("userId", "==", ctx.userId)
  );
  const snapshot = await getDocs(q);

  // Delete in batches (max 500 operations per batch)
  const BATCH_SIZE = 499; // Leave 1 for the source deletion
  let batch = writeBatch(ctx.db);
  let operationCount = 0;
  let deletedCount = 0;

  for (const docSnap of snapshot.docs) {
    batch.delete(docSnap.ref);
    operationCount++;
    deletedCount++;

    if (operationCount >= BATCH_SIZE) {
      await batch.commit();
      batch = writeBatch(ctx.db);
      operationCount = 0;
    }
  }

  // Delete the test source (only if it belongs to current user)
  const sourceRef = doc(ctx.db, SOURCES_COLLECTION, TEST_SOURCE_ID);
  const sourceSnap = await getDoc(sourceRef);

  if (sourceSnap.exists() && sourceSnap.data()?.userId === ctx.userId) {
    batch.delete(sourceRef);
  }

  await batch.commit();

  return { deletedTransactions: deletedCount };
}

/**
 * Toggle test data - convenience function
 */
export async function toggleTestData(
  ctx: OperationsContext,
  enable: boolean
): Promise<{ active: boolean; message: string }> {
  const currentlyActive = await isTestDataActive(ctx);

  if (enable && currentlyActive) {
    return { active: true, message: "Test data is already active" };
  }

  if (!enable && !currentlyActive) {
    return { active: false, message: "Test data is already inactive" };
  }

  if (enable) {
    const result = await activateTestData(ctx);
    return {
      active: true,
      message: `Created test source with ${result.transactionCount} transactions`,
    };
  } else {
    const result = await deactivateTestData(ctx);
    return {
      active: false,
      message: `Deleted test source and ${result.deletedTransactions} transactions`,
    };
  }
}
