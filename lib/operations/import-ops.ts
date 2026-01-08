import {
  collection,
  query,
  orderBy,
  where,
  getDocs,
  getDoc,
  doc,
  deleteDoc,
  writeBatch,
} from "firebase/firestore";
import { ImportRecord } from "@/types/import";
import { OperationsContext } from "./types";
import { deleteFileConnectionsForTransaction } from "./file-ops";
import { deleteImportCSV } from "./csv-storage-ops";

const IMPORTS_COLLECTION = "imports";
const TRANSACTIONS_COLLECTION = "transactions";

/**
 * List all imports for a source
 */
export async function listImports(
  ctx: OperationsContext,
  sourceId: string
): Promise<ImportRecord[]> {
  const q = query(
    collection(ctx.db, IMPORTS_COLLECTION),
    where("sourceId", "==", sourceId),
    where("userId", "==", ctx.userId),
    orderBy("createdAt", "desc")
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  })) as ImportRecord[];
}

/**
 * Get a single import record by ID
 */
export async function getImportRecord(
  ctx: OperationsContext,
  importId: string
): Promise<ImportRecord | null> {
  const docRef = doc(ctx.db, IMPORTS_COLLECTION, importId);
  const snapshot = await getDoc(docRef);

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data();
  if (data.userId !== ctx.userId) {
    return null;
  }

  return { id: snapshot.id, ...data } as ImportRecord;
}

/**
 * Delete an import and all its associated transactions.
 * Also deletes the stored CSV file if one exists.
 */
export async function deleteImport(
  ctx: OperationsContext,
  importId: string
): Promise<{ deletedTransactions: number }> {
  // Get import record first to check for CSV storage path
  const importRecord = await getImportRecord(ctx, importId);

  // Delete stored CSV file if it exists
  if (importRecord?.csvStoragePath) {
    await deleteImportCSV(importRecord.csvStoragePath);
  }

  // Find all transactions with this importJobId
  const txQuery = query(
    collection(ctx.db, TRANSACTIONS_COLLECTION),
    where("importJobId", "==", importId),
    where("userId", "==", ctx.userId)
  );
  const txSnapshot = await getDocs(txQuery);

  // Batch delete transactions (Firestore has 500 doc limit per batch)
  const BATCH_SIZE = 500;
  const docs = txSnapshot.docs;
  let deletedTransactions = 0;

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const chunk = docs.slice(i, i + BATCH_SIZE);

    // Clean up file connections BEFORE deleting transactions
    for (const txDoc of chunk) {
      await deleteFileConnectionsForTransaction(ctx, txDoc.id);
    }

    // Then batch delete transactions
    const batch = writeBatch(ctx.db);
    for (const txDoc of chunk) {
      batch.delete(txDoc.ref);
      deletedTransactions++;
    }

    await batch.commit();
  }

  // Delete the import record
  await deleteDoc(doc(ctx.db, IMPORTS_COLLECTION, importId));

  return { deletedTransactions };
}

/**
 * Delete all imports for a source (and their transactions)
 * Used when deleting a bank account
 */
export async function deleteImportsBySource(
  ctx: OperationsContext,
  sourceId: string
): Promise<{ deletedImports: number; deletedTransactions: number }> {
  // Find all imports for this source
  const importsQuery = query(
    collection(ctx.db, IMPORTS_COLLECTION),
    where("sourceId", "==", sourceId),
    where("userId", "==", ctx.userId)
  );
  const importsSnapshot = await getDocs(importsQuery);

  let deletedImports = 0;
  let deletedTransactions = 0;

  // Delete each import and its transactions
  for (const importDoc of importsSnapshot.docs) {
    const result = await deleteImport(ctx, importDoc.id);
    deletedTransactions += result.deletedTransactions;
    deletedImports++;
  }

  return { deletedImports, deletedTransactions };
}
