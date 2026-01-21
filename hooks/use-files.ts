"use client";

import { useState, useEffect, useCallback, useMemo, startTransition } from "react";
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
  unrejectFileFromTransaction,
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
  // Store raw (unfiltered) files from Firestore
  const [rawFiles, setRawFiles] = useState<TaxFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const ctx: OperationsContext = useMemo(
    () => ({
      db,
      userId: userId ?? "",
    }),
    [userId]
  );

  // Realtime listener for files - only depends on userId, not filters
  useEffect(() => {
    if (!userId) {
      setRawFiles([]);
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
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as TaxFile[];

        // Use startTransition to batch updates and prevent flicker
        startTransition(() => {
          setRawFiles(data);
          setLoading(false);
        });
      },
      (err) => {
        console.error("Error fetching files:", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  // Apply filters client-side via useMemo - no loading state change
  const files = useMemo(() => {
    let data = rawFiles;

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

    // Filter by extracted date range
    if (filters?.extractedDateFrom || filters?.extractedDateTo) {
      data = data.filter((f) => {
        if (!f.extractedDate) return false;
        const fileDate = f.extractedDate.toDate();
        if (filters.extractedDateFrom && fileDate < filters.extractedDateFrom) return false;
        if (filters.extractedDateTo) {
          // Add 1 day to include the end date fully
          const endDate = new Date(filters.extractedDateTo);
          endDate.setDate(endDate.getDate() + 1);
          if (fileDate >= endDate) return false;
        }
        return true;
      });
    }

    // Filter by partner IDs
    if (filters?.partnerIds && filters.partnerIds.length > 0) {
      const partnerIdSet = new Set(filters.partnerIds);
      data = data.filter((f) => f.partnerId && partnerIdSet.has(f.partnerId));
    }

    // Filter by amount type (income/expense based on invoiceDirection)
    if (filters?.amountType && filters.amountType !== "all") {
      data = data.filter((f) => {
        if (!f.invoiceDirection) return false;
        // incoming = expense (we receive invoice), outgoing = income (we send invoice)
        if (filters.amountType === "expense") return f.invoiceDirection === "incoming";
        if (filters.amountType === "income") return f.invoiceDirection === "outgoing";
        return true;
      });
    }

    return data;
  }, [rawFiles, filters?.search, filters?.hasConnections, filters?.extractionComplete, filters?.includeDeleted, filters?.isNotInvoice, filters?.extractedDateFrom, filters?.extractedDateTo, filters?.partnerIds, filters?.amountType]);

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
      // Search all files, not just filtered ones
      return rawFiles.find((f) => f.id === fileId);
    },
    [rawFiles]
  );

  // Total count of files (excluding soft-deleted) for empty state logic
  const allFilesCount = useMemo(() => {
    return rawFiles.filter((f) => !f.deletedAt).length;
  }, [rawFiles]);

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
    allFilesCount,
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
        const data = snapshot.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }) as TaxFile)
          // Filter out deleted files (soft-deleted files still have transactionIds)
          .filter((file) => !file.deletedAt);

        // Use startTransition to batch updates and prevent flicker
        startTransition(() => {
          setFiles(data);
          setLoading(false);
        });
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
    async (fileId: string, reject: boolean = false): Promise<void> => {
      if (!transactionId) throw new Error("No transaction selected");
      await disconnectFileFromTransaction(ctx, fileId, transactionId, reject);
    },
    [ctx, transactionId]
  );

  const unrejectFile = useCallback(
    async (fileId: string): Promise<void> => {
      if (!transactionId) throw new Error("No transaction selected");
      await unrejectFileFromTransaction(ctx, fileId, transactionId);
    },
    [ctx, transactionId]
  );

  return {
    files,
    loading,
    error,
    connectFile,
    disconnectFile,
    unrejectFile,
  };
}
