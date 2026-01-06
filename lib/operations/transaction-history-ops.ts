import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  orderBy,
  query,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { OperationsContext } from "./types";
import { Transaction } from "@/types/transaction";
import { TransactionHistoryEntry, ChangeAuthor } from "@/types/transaction-history";

const TRANSACTIONS_COLLECTION = "transactions";
const HISTORY_SUBCOLLECTION = "history";

/**
 * Create a history entry before modifying a transaction.
 * This captures the current state of the fields that are about to change.
 */
export async function createHistoryEntry(
  ctx: OperationsContext,
  transactionId: string,
  changedFields: string[],
  changedBy: ChangeAuthor,
  changeReason?: string
): Promise<string> {
  // Get current transaction state
  const txnDoc = await getDoc(doc(ctx.db, TRANSACTIONS_COLLECTION, transactionId));
  if (!txnDoc.exists()) {
    throw new Error(`Transaction ${transactionId} not found`);
  }

  const currentState = txnDoc.data() as Transaction;

  // Verify ownership
  if (currentState.userId !== ctx.userId) {
    throw new Error(`Transaction ${transactionId} not found or access denied`);
  }

  // Only store the fields that are about to change
  const previousState: Partial<
    Pick<Transaction, "description" | "fileIds" | "isComplete">
  > = {};

  for (const field of changedFields) {
    if (field === "description" && "description" in currentState) {
      previousState.description = currentState.description;
    } else if (field === "fileIds" && "fileIds" in currentState) {
      previousState.fileIds = currentState.fileIds;
    } else if (field === "isComplete" && "isComplete" in currentState) {
      previousState.isComplete = currentState.isComplete;
    }
  }

  const historyEntry: Omit<TransactionHistoryEntry, "id"> = {
    previousState,
    changedFields,
    changedBy,
    changeReason,
    createdAt: Timestamp.now(),
  };

  const historyRef = collection(
    ctx.db,
    TRANSACTIONS_COLLECTION,
    transactionId,
    HISTORY_SUBCOLLECTION
  );
  const docRef = await addDoc(historyRef, historyEntry);

  return docRef.id;
}

/**
 * Get all history entries for a transaction, ordered by most recent first
 */
export async function getTransactionHistory(
  ctx: OperationsContext,
  transactionId: string
): Promise<TransactionHistoryEntry[]> {
  // First verify the transaction exists and belongs to the user
  const txnDoc = await getDoc(doc(ctx.db, TRANSACTIONS_COLLECTION, transactionId));
  if (!txnDoc.exists()) {
    throw new Error(`Transaction ${transactionId} not found`);
  }

  const txnData = txnDoc.data();
  if (txnData.userId !== ctx.userId) {
    throw new Error(`Transaction ${transactionId} not found or access denied`);
  }

  const historyRef = collection(
    ctx.db,
    TRANSACTIONS_COLLECTION,
    transactionId,
    HISTORY_SUBCOLLECTION
  );
  const q = query(historyRef, orderBy("createdAt", "desc"));

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as TransactionHistoryEntry[];
}

/**
 * Rollback a transaction to a previous state from history
 */
export async function rollbackTransaction(
  ctx: OperationsContext,
  transactionId: string,
  historyId: string,
  changedBy: ChangeAuthor
): Promise<void> {
  // Get the history entry
  const historyDoc = await getDoc(
    doc(ctx.db, TRANSACTIONS_COLLECTION, transactionId, HISTORY_SUBCOLLECTION, historyId)
  );

  if (!historyDoc.exists()) {
    throw new Error(`History entry ${historyId} not found`);
  }

  const historyEntry = historyDoc.data() as TransactionHistoryEntry;

  // Get the current transaction to verify ownership
  const txnDoc = await getDoc(doc(ctx.db, TRANSACTIONS_COLLECTION, transactionId));
  if (!txnDoc.exists()) {
    throw new Error(`Transaction ${transactionId} not found`);
  }

  const txnData = txnDoc.data();
  if (txnData.userId !== ctx.userId) {
    throw new Error(`Transaction ${transactionId} not found or access denied`);
  }

  // Create a new history entry for the rollback itself
  const changedFields = Object.keys(historyEntry.previousState);
  await createHistoryEntry(
    ctx,
    transactionId,
    changedFields,
    changedBy,
    `Rollback to state from ${historyEntry.createdAt.toDate().toISOString()}`
  );

  // Apply the previous state
  const txnRef = doc(ctx.db, TRANSACTIONS_COLLECTION, transactionId);
  await updateDoc(txnRef, {
    ...historyEntry.previousState,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Update a transaction with automatic history tracking
 */
export async function updateTransactionWithHistory(
  ctx: OperationsContext,
  transactionId: string,
  data: Partial<Pick<Transaction, "description" | "fileIds" | "isComplete">>,
  changedBy: ChangeAuthor,
  changeReason?: string
): Promise<void> {
  // Determine which fields are actually changing
  const changedFields = Object.keys(data).filter((k) => data[k as keyof typeof data] !== undefined);

  if (changedFields.length === 0) {
    return; // Nothing to update
  }

  // Create history entry first (captures current state)
  await createHistoryEntry(ctx, transactionId, changedFields, changedBy, changeReason);

  // Then update the transaction
  const txnRef = doc(ctx.db, TRANSACTIONS_COLLECTION, transactionId);
  await updateDoc(txnRef, {
    ...data,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Bulk update transactions with history tracking
 */
export async function bulkUpdateTransactionsWithHistory(
  ctx: OperationsContext,
  transactionIds: string[],
  data: Partial<Pick<Transaction, "description" | "isComplete">>,
  changedBy: ChangeAuthor,
  changeReason?: string
): Promise<{ success: number; failed: number; errors: Array<{ id: string; error: string }> }> {
  const result = {
    success: 0,
    failed: 0,
    errors: [] as Array<{ id: string; error: string }>,
  };

  for (const id of transactionIds) {
    try {
      await updateTransactionWithHistory(ctx, id, data, changedBy, changeReason);
      result.success++;
    } catch (err) {
      result.failed++;
      result.errors.push({ id, error: String(err) });
    }
  }

  return result;
}
