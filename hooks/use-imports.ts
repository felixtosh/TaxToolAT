"use client";

import { useState, useEffect, useCallback } from "react";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  Timestamp,
  where,
  writeBatch,
  getDocs,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { ImportRecord } from "@/types/import";

const IMPORTS_COLLECTION = "imports";
const TRANSACTIONS_COLLECTION = "transactions";
const MOCK_USER_ID = "dev-user-123";

export function useImports(sourceId?: string) {
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!sourceId) {
      setImports([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const q = query(
      collection(db, IMPORTS_COLLECTION),
      where("sourceId", "==", sourceId),
      where("userId", "==", MOCK_USER_ID),
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
  }, [sourceId]);

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
      await setDoc(docRef, {
        ...data,
        userId: MOCK_USER_ID,
        createdAt: Timestamp.now(),
      });
    },
    []
  );

  /**
   * Delete an import and all its associated transactions
   */
  const deleteImport = useCallback(async (importId: string) => {
    // Find all transactions with this importJobId
    const txQuery = query(
      collection(db, TRANSACTIONS_COLLECTION),
      where("importJobId", "==", importId)
    );
    const txSnapshot = await getDocs(txQuery);

    // Batch delete transactions (Firestore has 500 doc limit per batch)
    const BATCH_SIZE = 500;
    const docs = txSnapshot.docs;

    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      const chunk = docs.slice(i, i + BATCH_SIZE);

      for (const txDoc of chunk) {
        batch.delete(txDoc.ref);
      }

      await batch.commit();
    }

    // Delete the import record
    await deleteDoc(doc(db, IMPORTS_COLLECTION, importId));
  }, []);

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
