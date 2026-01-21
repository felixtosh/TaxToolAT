"use client";

import { useState, useEffect, useCallback, useMemo, startTransition } from "react";
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
import { useAuth } from "@/components/auth";

const SOURCES_COLLECTION = "sources";

export function useSources() {
  const { userId } = useAuth();
  const [sources, setSources] = useState<TransactionSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Create operations context
  const ctx: OperationsContext = useMemo(
    () => ({
      db,
      userId: userId ?? "",
    }),
    [userId]
  );

  // Realtime listener for sources - this stays in the hook
  useEffect(() => {
    if (!userId) {
      setSources([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const q = query(
      collection(db, SOURCES_COLLECTION),
      where("userId", "==", userId),
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

        // Use startTransition to batch updates and prevent flicker
        // where loading=false but sources is still empty
        startTransition(() => {
          setSources(data);
          setLoading(false);
        });
      },
      (err) => {
        console.error("Error fetching sources:", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

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
