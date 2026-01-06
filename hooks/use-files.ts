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
  connectFileToTransaction,
  disconnectFileFromTransaction,
  getFilesForTransaction,
  getTransactionsForFile,
  acceptTransactionSuggestion,
  dismissTransactionSuggestion,
} from "@/lib/operations";

const FILES_COLLECTION = "files";
const MOCK_USER_ID = "dev-user-123";

export function useFiles(filters?: FileFilters) {
  const [files, setFiles] = useState<TaxFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const ctx: OperationsContext = useMemo(
    () => ({
      db,
      userId: MOCK_USER_ID,
    }),
    []
  );

  // Realtime listener for files
  useEffect(() => {
    setLoading(true);

    const q = query(
      collection(db, FILES_COLLECTION),
      where("userId", "==", MOCK_USER_ID),
      orderBy("uploadedAt", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        let data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as TaxFile[];

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
  }, [filters?.search, filters?.hasConnections, filters?.extractionComplete]);

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
    async (fileId: string): Promise<{ deletedConnections: number }> => {
      return deleteFile(ctx, fileId);
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
  const [files, setFiles] = useState<TaxFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const ctx: OperationsContext = useMemo(
    () => ({
      db,
      userId: MOCK_USER_ID,
    }),
    []
  );

  useEffect(() => {
    if (!transactionId) {
      setFiles([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Listen for changes to files that include this transaction
    const q = query(
      collection(db, FILES_COLLECTION),
      where("userId", "==", MOCK_USER_ID),
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
  }, [transactionId]);

  const connectFile = useCallback(
    async (fileId: string): Promise<string> => {
      if (!transactionId) throw new Error("No transaction selected");
      return connectFileToTransaction(ctx, fileId, transactionId, "manual");
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
