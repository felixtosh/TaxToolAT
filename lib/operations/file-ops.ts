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
  writeBatch,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import {
  TaxFile,
  FileConnection,
  FileFilters,
  FileCreateData,
  FileExtractionData,
} from "@/types/file";
import { Transaction } from "@/types/transaction";
import { FileSourceType, ManualFileRemoval } from "@/types/partner";
import { OperationsContext } from "./types";

const PARTNERS_COLLECTION = "partners";

/**
 * Source info for tracking how a file was found when connecting
 */
export interface FileConnectionSourceInfo {
  /** Where the file was found */
  sourceType: FileSourceType;
  /** The search pattern/query used */
  searchPattern?: string;
  /** For Gmail: which integration (account) */
  gmailIntegrationId?: string;
  /** For Gmail: message ID */
  gmailMessageId?: string;
}

const FILES_COLLECTION = "files";
const FILE_CONNECTIONS_COLLECTION = "fileConnections";
const TRANSACTIONS_COLLECTION = "transactions";

// === Partner Resolution ===

export type PartnerMatchedBy = "manual" | "suggestion" | "auto" | null;

/**
 * Resolve partner conflict between file and transaction.
 * Implements bidirectional sync with manual-wins priority.
 *
 * Rules:
 * - Neither has partner → no sync
 * - Only one has partner → sync to the other
 * - Manual wins over auto/suggestion
 * - Both manual → no sync (keep both as-is, they both chose intentionally)
 * - Both auto → higher confidence wins, tie goes to transaction (bank statement)
 */
export function resolvePartnerConflict(
  filePartnerId: string | null | undefined,
  fileMatchedBy: PartnerMatchedBy,
  fileConfidence: number | null | undefined,
  txPartnerId: string | null | undefined,
  txMatchedBy: PartnerMatchedBy,
  txConfidence: number | null | undefined
): { winnerId: string | null; source: "file" | "transaction" | null; shouldSync: boolean } {
  const filePid = filePartnerId ?? null;
  const txPid = txPartnerId ?? null;

  // Neither has partner
  if (!filePid && !txPid) {
    return { winnerId: null, source: null, shouldSync: false };
  }

  // Only file has partner → sync to transaction
  if (filePid && !txPid) {
    return { winnerId: filePid, source: "file", shouldSync: true };
  }

  // Only transaction has partner → sync to file
  if (txPid && !filePid) {
    return { winnerId: txPid, source: "transaction", shouldSync: true };
  }

  // Both have partners - determine winner
  const fileIsManual = fileMatchedBy === "manual";
  const txIsManual = txMatchedBy === "manual";

  // Both manual → no sync (both were intentional choices)
  if (fileIsManual && txIsManual) {
    return { winnerId: null, source: null, shouldSync: false };
  }

  // File is manual, transaction is not → file wins, sync to transaction
  if (fileIsManual && !txIsManual) {
    return { winnerId: filePid!, source: "file", shouldSync: true };
  }

  // Transaction is manual, file is not → transaction wins, sync to file
  if (txIsManual && !fileIsManual) {
    return { winnerId: txPid!, source: "transaction", shouldSync: true };
  }

  // Both auto/suggestion → higher confidence wins
  const fileConf = fileConfidence ?? 0;
  const txConf = txConfidence ?? 0;

  if (fileConf > txConf) {
    return { winnerId: filePid!, source: "file", shouldSync: true };
  } else if (txConf > fileConf) {
    return { winnerId: txPid!, source: "transaction", shouldSync: true };
  }

  // Equal confidence → transaction wins (bank statement is primary source)
  return { winnerId: txPid!, source: "transaction", shouldSync: true };
}

/**
 * List all files for the current user with optional filters
 */
export async function listFiles(
  ctx: OperationsContext,
  filters?: FileFilters & { limit?: number }
): Promise<TaxFile[]> {
  const constraints: Parameters<typeof query>[1][] = [
    where("userId", "==", ctx.userId),
    orderBy("uploadedAt", "desc"),
  ];

  if (filters?.extractionComplete !== undefined) {
    constraints.push(where("extractionComplete", "==", filters.extractionComplete));
  }

  const q = query(collection(ctx.db, FILES_COLLECTION), ...constraints);
  const snapshot = await getDocs(q);

  let files = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as TaxFile[];

  // Filter out soft-deleted files by default (unless includeDeleted is true)
  if (!filters?.includeDeleted) {
    files = files.filter((f) => !f.deletedAt);
  }

  // Client-side filters
  if (filters?.search) {
    const searchLower = filters.search.toLowerCase();
    files = files.filter(
      (f) =>
        f.fileName.toLowerCase().includes(searchLower) ||
        (f.extractedPartner?.toLowerCase() || "").includes(searchLower)
    );
  }

  if (filters?.hasConnections !== undefined) {
    files = files.filter((f) =>
      filters.hasConnections
        ? f.transactionIds.length > 0
        : f.transactionIds.length === 0
    );
  }

  // Filter by isNotInvoice status
  if (filters?.isNotInvoice !== undefined) {
    files = files.filter((f) =>
      filters.isNotInvoice ? f.isNotInvoice === true : f.isNotInvoice !== true
    );
  }

  if (filters?.uploadedFrom) {
    const fromTimestamp = Timestamp.fromDate(filters.uploadedFrom);
    files = files.filter((f) => f.uploadedAt.toMillis() >= fromTimestamp.toMillis());
  }

  if (filters?.uploadedTo) {
    const toTimestamp = Timestamp.fromDate(filters.uploadedTo);
    files = files.filter((f) => f.uploadedAt.toMillis() <= toTimestamp.toMillis());
  }

  if (filters?.extractedDateFrom) {
    const fromTimestamp = Timestamp.fromDate(filters.extractedDateFrom);
    files = files.filter(
      (f) => f.extractedDate && f.extractedDate.toMillis() >= fromTimestamp.toMillis()
    );
  }

  if (filters?.extractedDateTo) {
    const toTimestamp = Timestamp.fromDate(filters.extractedDateTo);
    files = files.filter(
      (f) => f.extractedDate && f.extractedDate.toMillis() <= toTimestamp.toMillis()
    );
  }

  if (filters?.limit) {
    files = files.slice(0, filters.limit);
  }

  return files;
}

/**
 * Get a single file by ID
 */
export async function getFile(
  ctx: OperationsContext,
  fileId: string
): Promise<TaxFile | null> {
  const docRef = doc(ctx.db, FILES_COLLECTION, fileId);
  const snapshot = await getDoc(docRef);

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data();
  if (data.userId !== ctx.userId) {
    return null;
  }

  return { id: snapshot.id, ...data } as TaxFile;
}

/**
 * Check if a file with the same content hash already exists
 */
export async function checkFileDuplicate(
  ctx: OperationsContext,
  contentHash: string
): Promise<TaxFile | null> {
  const q = query(
    collection(ctx.db, FILES_COLLECTION),
    where("userId", "==", ctx.userId),
    where("contentHash", "==", contentHash)
  );
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() } as TaxFile;
}

/**
 * Create a new file record (after uploading to storage)
 */
export async function createFile(
  ctx: OperationsContext,
  data: FileCreateData
): Promise<string> {
  const now = Timestamp.now();

  // Build file object, excluding undefined values (Firestore doesn't accept them)
  const newFile: Record<string, unknown> = {
    userId: ctx.userId,
    fileName: data.fileName,
    fileType: data.fileType,
    fileSize: data.fileSize,
    storagePath: data.storagePath,
    downloadUrl: data.downloadUrl,
    extractionComplete: false,
    transactionIds: [],
    uploadedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  // Only add optional fields if they have values
  if (data.thumbnailUrl) {
    newFile.thumbnailUrl = data.thumbnailUrl;
  }
  if (data.contentHash) {
    newFile.contentHash = data.contentHash;
  }

  // Source tracking
  if (data.sourceType) {
    newFile.sourceType = data.sourceType;
  }
  if (data.gmailMessageId) {
    newFile.gmailMessageId = data.gmailMessageId;
  }
  if (data.gmailIntegrationId) {
    newFile.gmailIntegrationId = data.gmailIntegrationId;
  }
  if (data.gmailSubject) {
    newFile.gmailSubject = data.gmailSubject;
  }

  const docRef = await addDoc(collection(ctx.db, FILES_COLLECTION), newFile);
  return docRef.id;
}

/**
 * Update a file's extraction results
 */
export async function updateFileExtraction(
  ctx: OperationsContext,
  fileId: string,
  data: FileExtractionData
): Promise<void> {
  const existing = await getFile(ctx, fileId);
  if (!existing) {
    throw new Error(`File ${fileId} not found or access denied`);
  }

  const docRef = doc(ctx.db, FILES_COLLECTION, fileId);
  await updateDoc(docRef, {
    ...data,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Update a file's metadata (not extraction data)
 */
export async function updateFile(
  ctx: OperationsContext,
  fileId: string,
  data: Partial<Pick<TaxFile, "fileName" | "thumbnailUrl">>
): Promise<void> {
  const existing = await getFile(ctx, fileId);
  if (!existing) {
    throw new Error(`File ${fileId} not found or access denied`);
  }

  const docRef = doc(ctx.db, FILES_COLLECTION, fileId);
  await updateDoc(docRef, {
    ...data,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Update the invoice direction for a file
 */
export async function updateFileDirection(
  ctx: OperationsContext,
  fileId: string,
  direction: "incoming" | "outgoing" | "unknown"
): Promise<void> {
  const existing = await getFile(ctx, fileId);
  if (!existing) {
    throw new Error(`File ${fileId} not found or access denied`);
  }

  const docRef = doc(ctx.db, FILES_COLLECTION, fileId);
  await updateDoc(docRef, {
    invoiceDirection: direction,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Retry extraction for a file that had an error
 * Calls the Cloud Function to re-run extraction
 * @param force - If true, bypasses checks and forces re-extraction (used to upgrade old files)
 */
export async function retryFileExtraction(
  ctx: OperationsContext,
  fileId: string,
  force?: boolean
): Promise<void> {
  const { getFunctions, httpsCallable } = await import("firebase/functions");
  const functions = getFunctions(undefined, "europe-west1");
  const retryFn = httpsCallable(functions, "retryFileExtraction");
  await retryFn({ fileId, force });
}

/**
 * Re-extract all files connected to a partner.
 * Used when a partner is marked as "this is my company" to recalculate counterparties.
 * Returns the number of files queued for re-extraction.
 */
export async function reextractFilesForPartner(
  ctx: OperationsContext,
  partnerId: string
): Promise<{ queuedCount: number; fileIds: string[] }> {
  // Find all files with this partner
  const q = query(
    collection(ctx.db, FILES_COLLECTION),
    where("userId", "==", ctx.userId),
    where("partnerId", "==", partnerId)
  );

  const snapshot = await getDocs(q);
  const fileIds: string[] = [];

  // Queue re-extraction for each file
  const { getFunctions, httpsCallable } = await import("firebase/functions");
  const functions = getFunctions(undefined, "europe-west1");
  const retryFn = httpsCallable(functions, "retryFileExtraction");

  for (const fileDoc of snapshot.docs) {
    try {
      await retryFn({ fileId: fileDoc.id, force: true });
      fileIds.push(fileDoc.id);
    } catch (error) {
      console.error(`Failed to queue re-extraction for file ${fileDoc.id}:`, error);
    }
  }

  return { queuedCount: fileIds.length, fileIds };
}

/**
 * Soft delete a file (Gmail files) - marks as deleted but keeps for deduplication
 * This prevents the file from being re-imported from Gmail
 */
export async function softDeleteFile(
  ctx: OperationsContext,
  fileId: string
): Promise<{ deletedConnections: number }> {
  const existing = await getFile(ctx, fileId);
  if (!existing) {
    throw new Error(`File ${fileId} not found or access denied`);
  }

  // 1. Delete all connections and update transactions
  const connectionsResult = await deleteFileConnections(ctx, fileId);

  // 2. Soft delete the file document (keep for deduplication)
  const docRef = doc(ctx.db, FILES_COLLECTION, fileId);
  await updateDoc(docRef, {
    deletedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });

  return { deletedConnections: connectionsResult.deleted };
}

/**
 * Restore a soft-deleted file
 */
export async function restoreFile(
  ctx: OperationsContext,
  fileId: string
): Promise<void> {
  const docRef = doc(ctx.db, FILES_COLLECTION, fileId);
  const snapshot = await getDoc(docRef);

  if (!snapshot.exists()) {
    throw new Error(`File ${fileId} not found`);
  }

  const data = snapshot.data();
  if (data.userId !== ctx.userId) {
    throw new Error(`File ${fileId} access denied`);
  }

  await updateDoc(docRef, {
    deletedAt: null,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Hard delete a file and all its connections (permanent deletion)
 */
export async function deleteFile(
  ctx: OperationsContext,
  fileId: string
): Promise<{ deletedConnections: number }> {
  const existing = await getFile(ctx, fileId);
  if (!existing) {
    throw new Error(`File ${fileId} not found or access denied`);
  }

  // 1. Delete all connections and update transactions
  const connectionsResult = await deleteFileConnections(ctx, fileId);

  // 2. Delete the file document
  const docRef = doc(ctx.db, FILES_COLLECTION, fileId);
  await deleteDoc(docRef);

  return { deletedConnections: connectionsResult.deleted };
}

/**
 * Mark a file as "not an invoice" (user override)
 * Clears extracted data and resets downstream matching.
 * Preserves manually-set partner assignments.
 */
export async function markFileAsNotInvoice(
  ctx: OperationsContext,
  fileId: string,
  reason?: string
): Promise<void> {
  const existing = await getFile(ctx, fileId);
  if (!existing) {
    throw new Error(`File ${fileId} not found or access denied`);
  }

  // Build update object
  const updates: Record<string, unknown> = {
    isNotInvoice: true,
    notInvoiceReason: reason || "Marked by user",
    classificationComplete: true, // Classification is done (user decided)
    // Clear all extracted data since it's not an invoice
    extractedDate: null,
    extractedAmount: null,
    extractedCurrency: null,
    extractedVatPercent: null,
    extractedPartner: null,
    extractedVatId: null,
    extractedIban: null,
    extractedAddress: null,
    extractedText: null,
    extractedRaw: null,
    extractedAdditionalFields: null,
    extractedFields: null,
    extractionConfidence: null,
    invoiceDirection: null,
    // Mark extraction as complete (nothing to extract for non-invoices)
    extractionComplete: true,
    // Reset downstream matching
    partnerMatchComplete: false,
    partnerSuggestions: [],
    transactionMatchComplete: false,
    transactionSuggestions: [],
    updatedAt: Timestamp.now(),
  };

  // Only clear partner if NOT manually set (preserve user's intentional choice)
  if (existing.partnerMatchedBy !== "manual") {
    updates.partnerId = null;
    updates.partnerType = null;
    updates.partnerMatchedBy = null;
    updates.partnerMatchConfidence = null;
  }

  const docRef = doc(ctx.db, FILES_COLLECTION, fileId);
  await updateDoc(docRef, updates);
}

/**
 * Unmark a file as "not an invoice" (restore as invoice)
 * Triggers re-extraction while preserving manually-set partner and transactions.
 */
export async function unmarkFileAsNotInvoice(
  ctx: OperationsContext,
  fileId: string
): Promise<void> {
  const existing = await getFile(ctx, fileId);
  if (!existing) {
    throw new Error(`File ${fileId} not found or access denied`);
  }

  // Build update object
  const updates: Record<string, unknown> = {
    isNotInvoice: false,
    notInvoiceReason: null,
    // Skip classification - user has confirmed it's an invoice
    classificationComplete: true,
    // Reset extraction to trigger re-extraction
    extractionComplete: false,
    extractionError: null,
    updatedAt: Timestamp.now(),
  };

  // Only reset partner if NOT manually set (preserve user's intentional choice)
  if (existing.partnerMatchedBy !== "manual") {
    updates.partnerId = null;
    updates.partnerType = null;
    updates.partnerMatchedBy = null;
    updates.partnerMatchConfidence = null;
    updates.partnerMatchComplete = false;
    updates.partnerSuggestions = [];
  }

  // Check for manual transaction connections before resetting transaction matching
  const connectionsQ = query(
    collection(ctx.db, FILE_CONNECTIONS_COLLECTION),
    where("fileId", "==", fileId),
    where("connectionType", "==", "manual")
  );
  const manualConnections = await getDocs(connectionsQ);

  // Only reset transaction matching if no manual connections exist
  if (manualConnections.empty) {
    updates.transactionMatchComplete = false;
    updates.transactionSuggestions = [];
  }

  const docRef = doc(ctx.db, FILES_COLLECTION, fileId);
  await updateDoc(docRef, updates);
}

// === File-Transaction Connection Operations ===

/**
 * Connect a file to a transaction (many-to-many)
 */
export async function connectFileToTransaction(
  ctx: OperationsContext,
  fileId: string,
  transactionId: string,
  connectionType: "manual" | "auto_matched" = "manual",
  matchConfidence?: number,
  sourceInfo?: FileConnectionSourceInfo
): Promise<string> {
  // Verify file ownership
  const file = await getFile(ctx, fileId);
  if (!file) {
    throw new Error(`File ${fileId} not found or access denied`);
  }

  // Verify transaction ownership
  const transactionDoc = await getDoc(doc(ctx.db, TRANSACTIONS_COLLECTION, transactionId));
  if (!transactionDoc.exists() || transactionDoc.data().userId !== ctx.userId) {
    throw new Error(`Transaction ${transactionId} not found or access denied`);
  }

  // Check if connection already exists
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

  // 1. Create junction document
  const connectionRef = doc(collection(ctx.db, FILE_CONNECTIONS_COLLECTION));
  // Build connection data, only including defined fields (Firestore doesn't allow undefined)
  const connectionData: Record<string, unknown> = {
    fileId,
    transactionId,
    userId: ctx.userId,
    connectionType,
    matchConfidence: matchConfidence ?? null,
    createdAt: now,
  };

  // Add source tracking fields only if provided
  if (sourceInfo?.sourceType) {
    connectionData.sourceType = sourceInfo.sourceType;
  }
  if (sourceInfo?.searchPattern) {
    connectionData.searchPattern = sourceInfo.searchPattern;
  }
  if (sourceInfo?.gmailIntegrationId) {
    connectionData.gmailIntegrationId = sourceInfo.gmailIntegrationId;
  }
  if (sourceInfo?.gmailMessageId) {
    connectionData.gmailMessageId = sourceInfo.gmailMessageId;
  }

  batch.set(connectionRef, connectionData);

  // 2. Update file's transactionIds array
  const fileRef = doc(ctx.db, FILES_COLLECTION, fileId);
  const fileUpdates: Record<string, unknown> = {
    transactionIds: arrayUnion(transactionId),
    updatedAt: now,
  };

  // 3. Update transaction's fileIds array and mark as complete
  const transactionRef = doc(ctx.db, TRANSACTIONS_COLLECTION, transactionId);
  const txData = transactionDoc.data();
  const transactionUpdates: Record<string, unknown> = {
    fileIds: arrayUnion(fileId),
    isComplete: true,
    updatedAt: now,
  };

  // 4. Partner sync: Resolve conflict and sync partner bidirectionally
  // Defer partner sync until extraction completes so file partner is authoritative.
  if (file.extractionComplete === true) {
    const resolution = resolvePartnerConflict(
      file.partnerId,
      file.partnerMatchedBy as PartnerMatchedBy,
      file.partnerMatchConfidence,
      txData.partnerId,
      txData.partnerMatchedBy as PartnerMatchedBy,
      txData.partnerMatchConfidence
    );

    if (resolution.shouldSync && resolution.winnerId) {
      if (resolution.source === "file") {
        // File wins → sync file's partner to transaction
        transactionUpdates.partnerId = file.partnerId;
        transactionUpdates.partnerType = file.partnerType;
        // Keep "auto" if syncing, unless file was manual
        transactionUpdates.partnerMatchedBy = file.partnerMatchedBy === "manual" ? "manual" : "auto";
        transactionUpdates.partnerMatchConfidence = file.partnerMatchConfidence ?? null;
        console.log(
          `[FileConnect] Synced partner ${file.partnerId} from file to transaction ${transactionId} ` +
          `(file: ${file.partnerMatchConfidence ?? 0}% vs tx: ${txData.partnerMatchConfidence ?? 0}%)`
        );
      } else if (resolution.source === "transaction") {
        // Transaction wins → sync transaction's partner to file
        fileUpdates.partnerId = txData.partnerId;
        fileUpdates.partnerType = txData.partnerType;
        // Keep "auto" if syncing, unless transaction was manual
        fileUpdates.partnerMatchedBy = txData.partnerMatchedBy === "manual" ? "manual" : "auto";
        fileUpdates.partnerMatchConfidence = txData.partnerMatchConfidence ?? null;
        console.log(
          `[FileConnect] Synced partner ${txData.partnerId} from transaction to file ${fileId} ` +
          `(tx: ${txData.partnerMatchConfidence ?? 0}% vs file: ${file.partnerMatchConfidence ?? 0}%)`
        );
      }
    }
  } else {
    console.log(
      `[FileConnect] Deferred partner sync for file ${fileId} until extraction completes`
    );
  }

  batch.update(fileRef, fileUpdates);
  batch.update(transactionRef, transactionUpdates);

  await batch.commit();
  return connectionRef.id;
}

/**
 * Disconnect a file from a transaction
 */
export async function disconnectFileFromTransaction(
  ctx: OperationsContext,
  fileId: string,
  transactionId: string
): Promise<void> {
  // Verify file exists and belongs to user
  const fileDoc = await getDoc(doc(ctx.db, FILES_COLLECTION, fileId));
  if (!fileDoc.exists()) {
    throw new Error(`File ${fileId} not found`);
  }
  if (fileDoc.data().userId !== ctx.userId) {
    throw new Error(`File ${fileId} access denied`);
  }

  // Find the connection document (may not exist for legacy connections)
  const q = query(
    collection(ctx.db, FILE_CONNECTIONS_COLLECTION),
    where("fileId", "==", fileId),
    where("transactionId", "==", transactionId),
    where("userId", "==", ctx.userId)
  );
  const snapshot = await getDocs(q);

  // Get transaction to check if this is the last file
  const transactionDoc = await getDoc(doc(ctx.db, TRANSACTIONS_COLLECTION, transactionId));
  if (!transactionDoc.exists()) {
    throw new Error(`Transaction ${transactionId} not found`);
  }
  const txData = transactionDoc.data();
  if (txData.userId !== ctx.userId) {
    throw new Error(`Transaction ${transactionId} access denied`);
  }
  const currentFileIds = txData.fileIds || [];
  const willHaveNoFiles = currentFileIds.length <= 1;
  const hasNoReceiptCategory = !!txData.noReceiptCategoryId;

  const now = Timestamp.now();
  const batch = writeBatch(ctx.db);

  // 1. Delete junction document if it exists
  if (!snapshot.empty) {
    batch.delete(snapshot.docs[0].ref);
  }

  // 2. Update file's transactionIds array
  const fileRef = doc(ctx.db, FILES_COLLECTION, fileId);
  batch.update(fileRef, {
    transactionIds: arrayRemove(transactionId),
    updatedAt: now,
  });

  // 3. Update transaction's fileIds array and potentially mark incomplete
  const transactionRef = doc(ctx.db, TRANSACTIONS_COLLECTION, transactionId);
  const transactionUpdate: Record<string, unknown> = {
    fileIds: arrayRemove(fileId),
    updatedAt: now,
  };

  // Mark incomplete only if no files remain AND no no-receipt category
  if (willHaveNoFiles && !hasNoReceiptCategory) {
    transactionUpdate.isComplete = false;
  }

  batch.update(transactionRef, transactionUpdate);

  await batch.commit();
}

/**
 * Get all files connected to a transaction
 */
export async function getFilesForTransaction(
  ctx: OperationsContext,
  transactionId: string
): Promise<TaxFile[]> {
  // Verify transaction ownership
  const transactionDoc = await getDoc(doc(ctx.db, TRANSACTIONS_COLLECTION, transactionId));
  if (!transactionDoc.exists() || transactionDoc.data().userId !== ctx.userId) {
    return [];
  }

  const fileIds = transactionDoc.data().fileIds || [];
  if (fileIds.length === 0) {
    return [];
  }

  // Fetch all files
  const files: TaxFile[] = [];
  for (const fileId of fileIds) {
    const file = await getFile(ctx, fileId);
    if (file) {
      files.push(file);
    }
  }

  return files;
}

/**
 * Get all connections for a file
 */
export async function getFileConnections(
  ctx: OperationsContext,
  fileId: string
): Promise<FileConnection[]> {
  const q = query(
    collection(ctx.db, FILE_CONNECTIONS_COLLECTION),
    where("fileId", "==", fileId),
    where("userId", "==", ctx.userId)
  );
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as FileConnection[];
}

/**
 * Get all transactions connected to a file
 */
export async function getTransactionsForFile(
  ctx: OperationsContext,
  fileId: string
): Promise<Transaction[]> {
  const file = await getFile(ctx, fileId);
  if (!file) {
    return [];
  }

  if (file.transactionIds.length === 0) {
    return [];
  }

  const transactions: Transaction[] = [];
  for (const transactionId of file.transactionIds) {
    const transactionDoc = await getDoc(doc(ctx.db, TRANSACTIONS_COLLECTION, transactionId));
    if (transactionDoc.exists() && transactionDoc.data().userId === ctx.userId) {
      transactions.push({
        id: transactionDoc.id,
        ...transactionDoc.data(),
      } as Transaction);
    }
  }

  return transactions;
}

/**
 * Delete all connections for a file (internal use)
 */
async function deleteFileConnections(
  ctx: OperationsContext,
  fileId: string
): Promise<{ deleted: number }> {
  const connections = await getFileConnections(ctx, fileId);

  if (connections.length === 0) {
    return { deleted: 0 };
  }

  const BATCH_SIZE = 500;
  let deleted = 0;
  const now = Timestamp.now();

  for (let i = 0; i < connections.length; i += BATCH_SIZE) {
    const chunk = connections.slice(i, i + BATCH_SIZE);

    // First, delete all connection documents (these always exist)
    const deleteBatch = writeBatch(ctx.db);
    for (const conn of chunk) {
      deleteBatch.delete(doc(ctx.db, FILE_CONNECTIONS_COLLECTION, conn.id));
      deleted++;
    }
    await deleteBatch.commit();

    // Then, update transactions that still exist (skip orphaned references)
    for (const conn of chunk) {
      const transactionRef = doc(ctx.db, TRANSACTIONS_COLLECTION, conn.transactionId);
      const transactionSnap = await getDoc(transactionRef);
      if (transactionSnap.exists()) {
        await updateDoc(transactionRef, {
          fileIds: arrayRemove(fileId),
          updatedAt: now,
        });
      }
    }
  }

  return { deleted };
}

// === Partner Assignment Operations ===

/**
 * Assign a partner to a file.
 * If the file was previously in manualFileRemovals for this partner (user changed mind),
 * clears it from the removals array.
 */
export async function assignPartnerToFile(
  ctx: OperationsContext,
  fileId: string,
  partnerId: string,
  partnerType: "user" | "global",
  matchedBy: "manual" | "suggestion" | "auto" = "manual",
  confidence?: number
): Promise<void> {
  const existing = await getFile(ctx, fileId);
  if (!existing) {
    throw new Error(`File ${fileId} not found or access denied`);
  }

  const docRef = doc(ctx.db, FILES_COLLECTION, fileId);
  await updateDoc(docRef, {
    partnerId,
    partnerType,
    partnerMatchedBy: matchedBy,
    partnerMatchConfidence: confidence ?? null,
    updatedAt: Timestamp.now(),
  });

  // Remove from manualFileRemovals if this file was previously removed
  // (user changed their mind about the removal)
  try {
    const partnerDocRef = doc(ctx.db, PARTNERS_COLLECTION, partnerId);
    const partnerSnapshot = await getDoc(partnerDocRef);

    if (partnerSnapshot.exists()) {
      const partnerData = partnerSnapshot.data();
      const manualFileRemovals = (partnerData.manualFileRemovals || []) as ManualFileRemoval[];

      if (manualFileRemovals.some((r) => r.fileId === fileId)) {
        const updatedRemovals = manualFileRemovals.filter((r) => r.fileId !== fileId);
        await updateDoc(partnerDocRef, {
          manualFileRemovals: updatedRemovals,
          updatedAt: Timestamp.now(),
        });
        console.log(
          `[Manual File Removal] Cleared false positive for file ${fileId} (user reassigned)`
        );
      }
    }
  } catch (error) {
    console.error("Failed to clear manual file removal on reassign:", error);
    // Non-critical - don't throw
  }
}

/**
 * Remove partner assignment from a file.
 * If the file was auto/suggestion matched, stores the removal as a false positive
 * in the partner's manualFileRemovals array for pattern learning.
 */
export async function removePartnerFromFile(
  ctx: OperationsContext,
  fileId: string
): Promise<void> {
  const existing = await getFile(ctx, fileId);
  if (!existing) {
    throw new Error(`File ${fileId} not found or access denied`);
  }

  const partnerId = existing.partnerId;
  const matchedBy = existing.partnerMatchedBy;

  // Determine if this was a system-recommended assignment
  const wasSystemRecommended = matchedBy === "auto" || matchedBy === "suggestion";

  // Clear the assignment
  const docRef = doc(ctx.db, FILES_COLLECTION, fileId);
  await updateDoc(docRef, {
    partnerId: null,
    partnerType: null,
    partnerMatchedBy: null,
    partnerMatchConfidence: null,
    updatedAt: Timestamp.now(),
  });

  // If this was a system-recommended assignment, track as false positive
  if (wasSystemRecommended && partnerId) {
    try {
      const partnerDocRef = doc(ctx.db, PARTNERS_COLLECTION, partnerId);
      const partnerSnapshot = await getDoc(partnerDocRef);

      if (partnerSnapshot.exists()) {
        const partnerData = partnerSnapshot.data();
        const existingRemovals = (partnerData.manualFileRemovals || []) as ManualFileRemoval[];

        // Check if this file is already in manualFileRemovals
        const alreadyRemoved = existingRemovals.some((r) => r.fileId === fileId);

        if (!alreadyRemoved) {
          const removalEntry: ManualFileRemoval = {
            fileId,
            removedAt: Timestamp.now(),
            extractedPartner: existing.extractedPartner || null,
            fileName: existing.fileName,
          };

          await updateDoc(partnerDocRef, {
            manualFileRemovals: arrayUnion(removalEntry),
            updatedAt: Timestamp.now(),
          });

          console.log(
            `[Manual File Removal] Stored false positive for partner ${partnerId}: file ${fileId}`
          );
        }
      }
    } catch (error) {
      console.error("Failed to store manual file removal:", error);
      // Non-critical - don't throw
    }
  }
}

/**
 * Delete all file connections for a transaction (used when transaction is deleted)
 */
export async function deleteFileConnectionsForTransaction(
  ctx: OperationsContext,
  transactionId: string
): Promise<{ deleted: number }> {
  const q = query(
    collection(ctx.db, FILE_CONNECTIONS_COLLECTION),
    where("transactionId", "==", transactionId),
    where("userId", "==", ctx.userId)
  );
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return { deleted: 0 };
  }

  const BATCH_SIZE = 500;
  let deleted = 0;
  const now = Timestamp.now();

  for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
    const batch = writeBatch(ctx.db);
    const chunk = snapshot.docs.slice(i, i + BATCH_SIZE);

    for (const docSnap of chunk) {
      const conn = docSnap.data() as FileConnection;

      // Delete connection document
      batch.delete(docSnap.ref);

      // Update file's transactionIds array
      const fileRef = doc(ctx.db, FILES_COLLECTION, conn.fileId);
      batch.update(fileRef, {
        transactionIds: arrayRemove(transactionId),
        updatedAt: now,
      });

      deleted++;
    }

    await batch.commit();
  }

  return { deleted };
}

// === Integration File Operations ===

/**
 * Soft delete all files for an integration that have NO transaction connections.
 * Files WITH connections are left unchanged (they're still useful).
 *
 * Used when disconnecting a Gmail integration - preserves files that are
 * connected to transactions while hiding orphaned files.
 *
 * @returns Count of files soft-deleted and skipped
 */
export async function softDeleteFilesForIntegration(
  ctx: OperationsContext,
  integrationId: string
): Promise<{ softDeleted: number; skipped: number }> {
  // Query all files for this integration
  const q = query(
    collection(ctx.db, FILES_COLLECTION),
    where("userId", "==", ctx.userId),
    where("gmailIntegrationId", "==", integrationId)
  );
  const snapshot = await getDocs(q);

  let softDeleted = 0;
  let skipped = 0;
  const now = Timestamp.now();

  const BATCH_SIZE = 500;
  let batch = writeBatch(ctx.db);
  let batchCount = 0;

  for (const fileDoc of snapshot.docs) {
    const data = fileDoc.data();

    // Skip already deleted files
    if (data.deletedAt) {
      continue;
    }

    // Skip files with transaction connections - they're still useful
    if (data.transactionIds && data.transactionIds.length > 0) {
      skipped++;
      continue;
    }

    // Soft delete this file
    batch.update(fileDoc.ref, {
      deletedAt: now,
      updatedAt: now,
    });
    softDeleted++;
    batchCount++;

    // Commit in batches
    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      batch = writeBatch(ctx.db);
      batchCount = 0;
    }
  }

  // Commit remaining
  if (batchCount > 0) {
    await batch.commit();
  }

  return { softDeleted, skipped };
}

/**
 * Restore all soft-deleted files for an integration.
 * Called when reconnecting a previously disconnected integration.
 *
 * @returns Count of files restored
 */
export async function restoreFilesForIntegration(
  ctx: OperationsContext,
  integrationId: string
): Promise<{ restored: number }> {
  // Query all files for this integration (including soft-deleted)
  const q = query(
    collection(ctx.db, FILES_COLLECTION),
    where("userId", "==", ctx.userId),
    where("gmailIntegrationId", "==", integrationId)
  );
  const snapshot = await getDocs(q);

  let restored = 0;
  const now = Timestamp.now();

  const BATCH_SIZE = 500;
  let batch = writeBatch(ctx.db);
  let batchCount = 0;

  for (const fileDoc of snapshot.docs) {
    const data = fileDoc.data();

    // Only restore files that were soft-deleted
    if (!data.deletedAt) {
      continue;
    }

    batch.update(fileDoc.ref, {
      deletedAt: null,
      updatedAt: now,
    });
    restored++;
    batchCount++;

    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      batch = writeBatch(ctx.db);
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  return { restored };
}

// === Bulk Operations ===

/**
 * Bulk soft delete multiple files
 */
export async function bulkSoftDeleteFiles(
  ctx: OperationsContext,
  fileIds: string[]
): Promise<{ deleted: number; errors: string[] }> {
  let deleted = 0;
  const errors: string[] = [];

  for (const fileId of fileIds) {
    try {
      await softDeleteFile(ctx, fileId);
      deleted++;
    } catch (error) {
      errors.push(
        `Failed to delete ${fileId}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  return { deleted, errors };
}

/**
 * Bulk mark files as not invoice
 */
export async function bulkMarkFilesAsNotInvoice(
  ctx: OperationsContext,
  fileIds: string[],
  reason?: string
): Promise<{ updated: number; errors: string[] }> {
  let updated = 0;
  const errors: string[] = [];

  for (const fileId of fileIds) {
    try {
      await markFileAsNotInvoice(ctx, fileId, reason);
      updated++;
    } catch (error) {
      errors.push(
        `Failed to update ${fileId}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  return { updated, errors };
}

/**
 * Bulk unmark files as not invoice (restore as invoice)
 */
export async function bulkUnmarkFilesAsNotInvoice(
  ctx: OperationsContext,
  fileIds: string[]
): Promise<{ updated: number; errors: string[] }> {
  let updated = 0;
  const errors: string[] = [];

  for (const fileId of fileIds) {
    try {
      await unmarkFileAsNotInvoice(ctx, fileId);
      updated++;
    } catch (error) {
      errors.push(
        `Failed to update ${fileId}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  return { updated, errors };
}
