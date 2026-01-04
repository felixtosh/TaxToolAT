"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { collection, query, orderBy, onSnapshot, where } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { TransactionSource, SourceFormData, SavedFieldMapping } from "@/types/source";
import {
  OperationsContext,
  createSource as createSourceOp,
  updateSource as updateSourceOp,
  deleteSource as deleteSourceOp,
  saveFieldMappings as saveFieldMappingsOp,
} from "@/lib/operations";

const SOURCES_COLLECTION = "sources";
const MOCK_USER_ID = "dev-user-123"; // Mock user for development

export function useSources() {
  const [sources, setSources] = useState<TransactionSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Create operations context
  const ctx: OperationsContext = useMemo(
    () => ({
      db,
      userId: MOCK_USER_ID,
    }),
    []
  );

  // Realtime listener for sources - this stays in the hook
  useEffect(() => {
    setLoading(true);

    const q = query(
      collection(db, SOURCES_COLLECTION),
      where("userId", "==", MOCK_USER_ID),
      where("isActive", "==", true),
      orderBy("name", "asc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as TransactionSource[];

        setSources(data);
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching sources:", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Mutations now call the operations layer
  const addSource = useCallback(
    async (data: SourceFormData): Promise<string> => {
      return createSourceOp(ctx, data);
    },
    [ctx]
  );

  const updateSource = useCallback(
    async (sourceId: string, data: Partial<TransactionSource>) => {
      await updateSourceOp(ctx, sourceId, data);
    },
    [ctx]
  );

  const deleteSource = useCallback(
    async (sourceId: string) => {
      await deleteSourceOp(ctx, sourceId);
    },
    [ctx]
  );

  const saveFieldMappings = useCallback(
    async (sourceId: string, mappings: SavedFieldMapping) => {
      await saveFieldMappingsOp(ctx, sourceId, mappings);
    },
    [ctx]
  );

  const getSourceById = useCallback(
    (sourceId: string): TransactionSource | undefined => {
      return sources.find((s) => s.id === sourceId);
    },
    [sources]
  );

  return {
    sources,
    loading,
    error,
    addSource,
    updateSource,
    deleteSource,
    saveFieldMappings,
    getSourceById,
  };
}
