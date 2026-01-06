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
import { OperationsContext } from "./types";

const FILES_COLLECTION = "files";
const FILE_CONNECTIONS_COLLECTION = "fileConnections";
const TRANSACTIONS_COLLECTION = "transactions";

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
 * Delete a file and all its connections
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

// === File-Transaction Connection Operations ===

/**
 * Connect a file to a transaction (many-to-many)
 */
export async function connectFileToTransaction(
  ctx: OperationsContext,
  fileId: string,
  transactionId: string,
  connectionType: "manual" | "auto_matched" = "manual",
  matchConfidence?: number
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
  const connectionData: Omit<FileConnection, "id"> = {
    fileId,
    transactionId,
    userId: ctx.userId,
    connectionType,
    matchConfidence: matchConfidence ?? null,
    createdAt: now,
  };
  batch.set(connectionRef, connectionData);

  // 2. Update file's transactionIds array
  const fileRef = doc(ctx.db, FILES_COLLECTION, fileId);
  batch.update(fileRef, {
    transactionIds: arrayUnion(transactionId),
    updatedAt: now,
  });

  // 3. Update transaction's fileIds array and mark as complete
  const transactionRef = doc(ctx.db, TRANSACTIONS_COLLECTION, transactionId);
  batch.update(transactionRef, {
    fileIds: arrayUnion(fileId),
    isComplete: true,
    updatedAt: now,
  });

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
  // Find the connection document
  const q = query(
    collection(ctx.db, FILE_CONNECTIONS_COLLECTION),
    where("fileId", "==", fileId),
    where("transactionId", "==", transactionId),
    where("userId", "==", ctx.userId)
  );
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    throw new Error("Connection not found");
  }

  // Get transaction to check if this is the last file
  const transactionDoc = await getDoc(doc(ctx.db, TRANSACTIONS_COLLECTION, transactionId));
  const txData = transactionDoc.data();
  const currentFileIds = txData?.fileIds || [];
  const willHaveNoFiles = currentFileIds.length <= 1;
  const hasNoReceiptCategory = !!txData?.noReceiptCategoryId;

  const now = Timestamp.now();
  const batch = writeBatch(ctx.db);

  // 1. Delete junction document
  batch.delete(snapshot.docs[0].ref);

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
 * Assign a partner to a file
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
}

/**
 * Remove partner assignment from a file
 */
export async function removePartnerFromFile(
  ctx: OperationsContext,
  fileId: string
): Promise<void> {
  const existing = await getFile(ctx, fileId);
  if (!existing) {
    throw new Error(`File ${fileId} not found or access denied`);
  }

  const docRef = doc(ctx.db, FILES_COLLECTION, fileId);
  await updateDoc(docRef, {
    partnerId: null,
    partnerType: null,
    partnerMatchedBy: null,
    partnerMatchConfidence: null,
    updatedAt: Timestamp.now(),
  });
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
