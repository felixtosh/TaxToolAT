"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { ImportRecord } from "@/types/import";
import { deleteImport as deleteImportOp } from "@/lib/operations";
import { useAuth } from "@/components/auth";

const IMPORTS_COLLECTION = "imports";

export function useImports(sourceId?: string) {
  const { userId } = useAuth();
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!sourceId || !userId) {
      setImports([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const q = query(
      collection(db, IMPORTS_COLLECTION),
      where("sourceId", "==", sourceId),
      where("userId", "==", userId),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as ImportRecord[];

        setImports(data);
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching imports:", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [sourceId, userId]);

  /**
   * Create a new import record with a specific ID
   * The ID should match the importJobId stored on transactions
   */
  const createImport = useCallback(
    async (
      importId: string,
      data: Omit<ImportRecord, "id" | "createdAt" | "userId">
    ): Promise<void> => {
      const docRef = doc(db, IMPORTS_COLLECTION, importId);
      if (!userId) return;
      await setDoc(docRef, {
        ...data,
        userId,
        createdAt: Timestamp.now(),
      });
    },
    [userId]
  );

  const ctx = useMemo(() => ({ db, userId: userId ?? "" }), [userId]);

  /**
   * Delete an import and all its associated transactions
   */
  const deleteImport = useCallback(
    async (importId: string) => {
      await deleteImportOp(ctx, importId);
    },
    [ctx]
  );

  /**
   * Get a single import by ID (from the already-loaded imports)
   */
  const getImportById = useCallback(
    (importId: string): ImportRecord | undefined => {
      return imports.find((imp) => imp.id === importId);
    },
    [imports]
  );

  return {
    imports,
    loading,
    error,
    createImport,
    deleteImport,
    getImportById,
  };
}
