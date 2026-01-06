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
  deleteDoc,
  Timestamp,
} from "firebase/firestore";
import { TransactionSource, SourceFormData, SavedFieldMapping } from "@/types/source";
import { normalizeIban } from "@/lib/import/deduplication";
import { OperationsContext } from "./types";
import { deleteImportsBySource } from "./import-ops";
import { deleteTransactionsBySource } from "./transaction-ops";

const SOURCES_COLLECTION = "sources";

/**
 * List all active sources for the current user
 */
export async function listSources(ctx: OperationsContext): Promise<TransactionSource[]> {
  const q = query(
    collection(ctx.db, SOURCES_COLLECTION),
    where("userId", "==", ctx.userId),
    where("isActive", "==", true),
    orderBy("name", "asc")
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as TransactionSource[];
}

/**
 * Get a single source by ID
 */
export async function getSourceById(
  ctx: OperationsContext,
  sourceId: string
): Promise<TransactionSource | null> {
  const docRef = doc(ctx.db, SOURCES_COLLECTION, sourceId);
  const snapshot = await getDoc(docRef);

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data();
  // Verify ownership
  if (data.userId !== ctx.userId) {
    return null;
  }

  return { id: snapshot.id, ...data } as TransactionSource;
}

/**
 * Create a new source
 */
export async function createSource(
  ctx: OperationsContext,
  data: SourceFormData
): Promise<string> {
  const now = Timestamp.now();
  const newSource = {
    name: data.name,
    iban: normalizeIban(data.iban),
    bic: data.bic || null,
    bankName: data.bankName || null,
    currency: data.currency,
    type: data.type,
    isActive: true,
    userId: ctx.userId,
    createdAt: now,
    updatedAt: now,
  };

  const docRef = await addDoc(collection(ctx.db, SOURCES_COLLECTION), newSource);
  return docRef.id;
}

/**
 * Update a source
 */
export async function updateSource(
  ctx: OperationsContext,
  sourceId: string,
  data: Partial<Omit<TransactionSource, "id" | "userId" | "createdAt">>
): Promise<void> {
  // Verify ownership first
  const existing = await getSourceById(ctx, sourceId);
  if (!existing) {
    throw new Error(`Source ${sourceId} not found or access denied`);
  }

  const docRef = doc(ctx.db, SOURCES_COLLECTION, sourceId);
  await updateDoc(docRef, {
    ...data,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Delete a source and all associated imports/transactions
 *
 * This performs a cascade delete:
 * 1. Deletes all imports for this source (and their transactions)
 * 2. Deletes any remaining transactions without an import
 * 3. Deletes the source document itself
 */
export async function deleteSource(
  ctx: OperationsContext,
  sourceId: string
): Promise<{ deletedImports: number; deletedTransactions: number }> {
  // Verify ownership first
  const existing = await getSourceById(ctx, sourceId);
  if (!existing) {
    throw new Error(`Source ${sourceId} not found or access denied`);
  }

  // 1. Delete all imports (which cascade-deletes their transactions)
  const importResult = await deleteImportsBySource(ctx, sourceId);

  // 2. Delete any orphaned transactions (e.g., those without importJobId)
  const txResult = await deleteTransactionsBySource(ctx, sourceId);

  // 3. Delete the source document itself
  const docRef = doc(ctx.db, SOURCES_COLLECTION, sourceId);
  await deleteDoc(docRef);

  return {
    deletedImports: importResult.deletedImports,
    deletedTransactions: importResult.deletedTransactions + txResult.deleted,
  };
}

/**
 * Save field mappings for future imports
 */
export async function saveFieldMappings(
  ctx: OperationsContext,
  sourceId: string,
  mappings: SavedFieldMapping
): Promise<void> {
  // Verify ownership first
  const existing = await getSourceById(ctx, sourceId);
  if (!existing) {
    throw new Error(`Source ${sourceId} not found or access denied`);
  }

  const docRef = doc(ctx.db, SOURCES_COLLECTION, sourceId);
  await updateDoc(docRef, {
    fieldMappings: mappings,
    updatedAt: Timestamp.now(),
  });
}
