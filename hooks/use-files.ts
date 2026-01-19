"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { collection, query, orderBy, onSnapshot, where } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import {
  TaxFile,
  FileFilters,
  FileCreateData,
  FileExtractionData,
  TransactionSuggestion,
  TransactionMatchSource,
} from "@/types/file";
import {
  OperationsContext,
  listFiles,
  getFile,
  createFile,
  updateFile,
  updateFileExtraction,
  deleteFile,
  softDeleteFile,
  restoreFile,
  markFileAsNotInvoice,
  unmarkFileAsNotInvoice,
  connectFileToTransaction,
  disconnectFileFromTransaction,
  getFilesForTransaction,
  getTransactionsForFile,
  acceptTransactionSuggestion,
  dismissTransactionSuggestion,
  FileConnectionSourceInfo,
} from "@/lib/operations";
import { useAuth } from "@/components/auth";

const FILES_COLLECTION = "files";

export function useFiles(filters?: FileFilters) {
  const { userId } = useAuth();
  const [files, setFiles] = useState<TaxFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const ctx: OperationsContext = useMemo(
    () => ({
      db,
      userId: userId ?? "",
    }),
    [userId]
  );

  // Realtime listener for files
  useEffect(() => {
    if (!userId) {
      setFiles([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const q = query(
      collection(db, FILES_COLLECTION),
      where("userId", "==", userId),
      orderBy("uploadedAt", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        let data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as TaxFile[];

        // Filter out soft-deleted files by default
        if (!filters?.includeDeleted) {
          data = data.filter((f) => !f.deletedAt);
        }

        // Apply client-side filters
        if (filters?.search) {
          const searchLower = filters.search.toLowerCase();
          data = data.filter(
            (f) =>
              f.fileName.toLowerCase().includes(searchLower) ||
              (f.extractedPartner?.toLowerCase() || "").includes(searchLower)
          );
        }

        if (filters?.hasConnections !== undefined) {
          data = data.filter((f) =>
            filters.hasConnections
              ? f.transactionIds.length > 0
              : f.transactionIds.length === 0
          );
        }

        if (filters?.extractionComplete !== undefined) {
          data = data.filter((f) => f.extractionComplete === filters.extractionComplete);
        }

        // Filter by isNotInvoice status
        if (filters?.isNotInvoice !== undefined) {
          data = data.filter((f) =>
            filters.isNotInvoice ? f.isNotInvoice === true : f.isNotInvoice !== true
          );
        }

        setFiles(data);
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching files:", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId, filters?.search, filters?.hasConnections, filters?.extractionComplete, filters?.includeDeleted, filters?.isNotInvoice]);

  const create = useCallback(
    async (data: FileCreateData): Promise<string> => {
      return createFile(ctx, data);
    },
    [ctx]
  );

  const update = useCallback(
    async (fileId: string, data: Partial<Pick<TaxFile, "fileName" | "thumbnailUrl">>): Promise<void> => {
      await updateFile(ctx, fileId, data);
    },
    [ctx]
  );

  const updateExtraction = useCallback(
    async (fileId: string, data: FileExtractionData): Promise<void> => {
      await updateFileExtraction(ctx, fileId, data);
    },
    [ctx]
  );

  const remove = useCallback(
    async (fileId: string, soft = false): Promise<{ deletedConnections: number }> => {
      if (soft) {
        return softDeleteFile(ctx, fileId);
      }
      return deleteFile(ctx, fileId);
    },
    [ctx]
  );

  const restore = useCallback(
    async (fileId: string): Promise<void> => {
      return restoreFile(ctx, fileId);
    },
    [ctx]
  );

  const markAsNotInvoice = useCallback(
    async (fileId: string, reason?: string): Promise<void> => {
      return markFileAsNotInvoice(ctx, fileId, reason);
    },
    [ctx]
  );

  const unmarkAsNotInvoice = useCallback(
    async (fileId: string): Promise<void> => {
      return unmarkFileAsNotInvoice(ctx, fileId);
    },
    [ctx]
  );

  const getFileById = useCallback(
    (fileId: string): TaxFile | undefined => {
      return files.find((f) => f.id === fileId);
    },
    [files]
  );

  const connectToTransaction = useCallback(
    async (
      fileId: string,
      transactionId: string,
      connectionType: "manual" | "auto_matched" = "manual",
      matchConfidence?: number
    ): Promise<string> => {
      return connectFileToTransaction(ctx, fileId, transactionId, connectionType, matchConfidence);
    },
    [ctx]
  );

  const disconnectFromTransaction = useCallback(
    async (fileId: string, transactionId: string): Promise<void> => {
      await disconnectFileFromTransaction(ctx, fileId, transactionId);
    },
    [ctx]
  );

  const fetchFilesForTransaction = useCallback(
    async (transactionId: string): Promise<TaxFile[]> => {
      return getFilesForTransaction(ctx, transactionId);
    },
    [ctx]
  );

  const acceptSuggestion = useCallback(
    async (
      fileId: string,
      transactionId: string,
      confidence: number,
      matchSources: TransactionMatchSource[]
    ): Promise<string> => {
      return acceptTransactionSuggestion(ctx, fileId, transactionId, confidence, matchSources);
    },
    [ctx]
  );

  const dismissSuggestion = useCallback(
    async (fileId: string, transactionId: string): Promise<void> => {
      await dismissTransactionSuggestion(ctx, fileId, transactionId);
    },
    [ctx]
  );

  return {
    files,
    loading,
    error,
    create,
    update,
    updateExtraction,
    remove,
    restore,
    markAsNotInvoice,
    unmarkAsNotInvoice,
    getFileById,
    connectToTransaction,
    disconnectFromTransaction,
    fetchFilesForTransaction,
    acceptSuggestion,
    dismissSuggestion,
  };
}

/**
 * Hook to get files for a specific transaction with realtime updates
 */
export function useTransactionFiles(transactionId: string | null) {
  const { userId } = useAuth();
  const [files, setFiles] = useState<TaxFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const ctx: OperationsContext = useMemo(
    () => ({
      db,
      userId: userId ?? "",
    }),
    [userId]
  );

  useEffect(() => {
    if (!transactionId || !userId) {
      setFiles([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Listen for changes to files that include this transaction
    const q = query(
      collection(db, FILES_COLLECTION),
      where("userId", "==", userId),
      where("transactionIds", "array-contains", transactionId)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as TaxFile[];

        setFiles(data);
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching transaction files:", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [transactionId, userId]);

  const connectFile = useCallback(
    async (fileId: string, sourceInfo?: FileConnectionSourceInfo): Promise<string> => {
      if (!transactionId) throw new Error("No transaction selected");
      return connectFileToTransaction(
        ctx,
        fileId,
        transactionId,
        "manual",
        undefined,
        sourceInfo
      );
    },
    [ctx, transactionId]
  );

  const disconnectFile = useCallback(
    async (fileId: string): Promise<void> => {
      if (!transactionId) throw new Error("No transaction selected");
      await disconnectFileFromTransaction(ctx, fileId, transactionId);
    },
    [ctx, transactionId]
  );

  return {
    files,
    loading,
    error,
    connectFile,
    disconnectFile,
  };
}
