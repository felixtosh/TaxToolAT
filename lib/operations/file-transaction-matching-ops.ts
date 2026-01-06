/**
 * File-Transaction Matching Operations
 *
 * Operations for accepting/dismissing transaction suggestions
 * and managing file-transaction connections from matching.
 */

import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  writeBatch,
  Timestamp,
  arrayUnion,
  orderBy,
} from "firebase/firestore";
import {
  TaxFile,
  TransactionSuggestion,
  TransactionMatchSource,
} from "@/types/file";
import { Transaction } from "@/types/transaction";
import { OperationsContext } from "./types";
import {
  scoreTransactionMatch,
  toTransactionSuggestion,
  TRANSACTION_MATCH_CONFIG,
} from "@/lib/matching/transaction-matcher";

const FILES_COLLECTION = "files";
const TRANSACTIONS_COLLECTION = "transactions";
const FILE_CONNECTIONS_COLLECTION = "fileConnections";

/**
 * Get transaction suggestions for a file (from stored data)
 */
export async function getTransactionSuggestionsForFile(
  ctx: OperationsContext,
  fileId: string
): Promise<TransactionSuggestion[]> {
  const fileDoc = await getDoc(doc(ctx.db, FILES_COLLECTION, fileId));

  if (!fileDoc.exists() || fileDoc.data().userId !== ctx.userId) {
    return [];
  }

  return fileDoc.data().transactionSuggestions || [];
}

/**
 * Accept a transaction suggestion (creates connection)
 */
export async function acceptTransactionSuggestion(
  ctx: OperationsContext,
  fileId: string,
  transactionId: string,
  confidence: number,
  matchSources: TransactionMatchSource[]
): Promise<string> {
  const fileRef = doc(ctx.db, FILES_COLLECTION, fileId);
  const file = await getDoc(fileRef);

  if (!file.exists() || file.data().userId !== ctx.userId) {
    throw new Error("File not found or access denied");
  }

  const txRef = doc(ctx.db, TRANSACTIONS_COLLECTION, transactionId);
  const tx = await getDoc(txRef);

  if (!tx.exists() || tx.data().userId !== ctx.userId) {
    throw new Error("Transaction not found or access denied");
  }

  // Check if already connected
  const existingQ = query(
    collection(ctx.db, FILE_CONNECTIONS_COLLECTION),
    where("fileId", "==", fileId),
    where("transactionId", "==", transactionId),
    where("userId", "==", ctx.userId)
  );
  const existingSnap = await getDocs(existingQ);
  if (!existingSnap.empty) {
    return existingSnap.docs[0].id; // Already connected
  }

  const now = Timestamp.now();
  const batch = writeBatch(ctx.db);

  // 1. Create connection document
  const connectionRef = doc(collection(ctx.db, FILE_CONNECTIONS_COLLECTION));
  batch.set(connectionRef, {
    fileId,
    transactionId,
    userId: ctx.userId,
    connectionType: "suggestion_accepted",
    matchSources,
    matchConfidence: confidence,
    createdAt: now,
  });

  // 2. Update file's transactionIds array and remove from suggestions
  const currentSuggestions = file.data().transactionSuggestions || [];
  const filteredSuggestions = currentSuggestions.filter(
    (s: TransactionSuggestion) => s.transactionId !== transactionId
  );

  batch.update(fileRef, {
    transactionIds: arrayUnion(transactionId),
    transactionSuggestions: filteredSuggestions,
    updatedAt: now,
  });

  // 3. Update transaction's fileIds array
  batch.update(txRef, {
    fileIds: arrayUnion(fileId),
    updatedAt: now,
  });

  await batch.commit();
  return connectionRef.id;
}

/**
 * Dismiss a transaction suggestion (removes from suggestions list)
 */
export async function dismissTransactionSuggestion(
  ctx: OperationsContext,
  fileId: string,
  transactionId: string
): Promise<void> {
  const fileRef = doc(ctx.db, FILES_COLLECTION, fileId);
  const fileDoc = await getDoc(fileRef);

  if (!fileDoc.exists() || fileDoc.data().userId !== ctx.userId) {
    throw new Error("File not found or access denied");
  }

  const currentSuggestions = fileDoc.data().transactionSuggestions || [];
  const filteredSuggestions = currentSuggestions.filter(
    (s: TransactionSuggestion) => s.transactionId !== transactionId
  );

  await updateDoc(fileRef, {
    transactionSuggestions: filteredSuggestions,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Find potential transaction matches for a file (client-side matching)
 * Used for real-time suggestions in the UI
 */
export async function findTransactionMatchesForFile(
  ctx: OperationsContext,
  file: TaxFile,
  options?: {
    dateRangeDays?: number;
    minConfidence?: number;
    limit?: number;
  }
): Promise<TransactionSuggestion[]> {
  const {
    dateRangeDays = TRANSACTION_MATCH_CONFIG.DATE_RANGE_DAYS,
    minConfidence = TRANSACTION_MATCH_CONFIG.SUGGESTION_THRESHOLD,
    limit = TRANSACTION_MATCH_CONFIG.MAX_SUGGESTIONS,
  } = options || {};

  // Can't match without extracted data
  if (!file.extractionComplete || !file.extractedDate || file.extractedAmount == null) {
    return [];
  }

  const centerDate = file.extractedDate.toDate();
  const startDate = new Date(centerDate);
  startDate.setDate(startDate.getDate() - dateRangeDays);
  const endDate = new Date(centerDate);
  endDate.setDate(endDate.getDate() + dateRangeDays);

  // Query transactions in date range
  const q = query(
    collection(ctx.db, TRANSACTIONS_COLLECTION),
    where("userId", "==", ctx.userId),
    where("date", ">=", Timestamp.fromDate(startDate)),
    where("date", "<=", Timestamp.fromDate(endDate)),
    orderBy("date", "desc")
  );

  const snapshot = await getDocs(q);
  const transactions = snapshot.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as Transaction[];

  // Exclude already connected transactions
  const connectedIds = new Set(file.transactionIds || []);
  const candidates = transactions.filter((tx) => !connectedIds.has(tx.id));

  // Score and filter
  const matches = candidates
    .map((tx) => scoreTransactionMatch(file, tx))
    .filter((m) => m.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit)
    .map(toTransactionSuggestion);

  return matches;
}

/**
 * Re-run transaction matching for a file
 * Useful when file or transactions have been updated
 */
export async function refreshTransactionMatches(
  ctx: OperationsContext,
  fileId: string
): Promise<TransactionSuggestion[]> {
  const fileDoc = await getDoc(doc(ctx.db, FILES_COLLECTION, fileId));

  if (!fileDoc.exists() || fileDoc.data().userId !== ctx.userId) {
    throw new Error("File not found or access denied");
  }

  const file = { id: fileDoc.id, ...fileDoc.data() } as TaxFile;

  // Find new matches
  const suggestions = await findTransactionMatchesForFile(ctx, file);

  // Update file with new suggestions
  await updateDoc(doc(ctx.db, FILES_COLLECTION, fileId), {
    transactionSuggestions: suggestions,
    transactionMatchedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });

  return suggestions;
}

/**
 * Get files that have pending transaction suggestions
 */
export async function getFilesWithPendingSuggestions(
  ctx: OperationsContext,
  limit?: number
): Promise<TaxFile[]> {
  // Query all files for user
  const q = query(
    collection(ctx.db, FILES_COLLECTION),
    where("userId", "==", ctx.userId),
    where("extractionComplete", "==", true),
    orderBy("uploadedAt", "desc")
  );

  const snapshot = await getDocs(q);
  let files = snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }) as TaxFile)
    .filter(
      (f) => f.transactionSuggestions && f.transactionSuggestions.length > 0
    );

  if (limit) {
    files = files.slice(0, limit);
  }

  return files;
}

/**
 * Get count of files with pending suggestions (for badge display)
 */
export async function countFilesWithPendingSuggestions(
  ctx: OperationsContext
): Promise<number> {
  const files = await getFilesWithPendingSuggestions(ctx);
  return files.length;
}
