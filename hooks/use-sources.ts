"use client";

import { useState, useEffect, useCallback, startTransition } from "react";
import { collection, query, orderBy, onSnapshot, where } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { callFunction } from "@/lib/firebase/callable";
import { TransactionSource, SourceFormData, SavedFieldMapping } from "@/types/source";
import { useAuth } from "@/components/auth";

const SOURCES_COLLECTION = "sources";

export function useSources() {
  const { userId } = useAuth();
  const [sources, setSources] = useState<TransactionSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

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

  // Mutations call Cloud Functions
  const addSource = useCallback(
    async (data: SourceFormData): Promise<string> => {
      const result = await callFunction<{ data: SourceFormData }, { sourceId: string }>(
        "createSource",
        { data }
      );
      return result.sourceId;
    },
    []
  );

  const updateSource = useCallback(
    async (sourceId: string, data: Partial<TransactionSource>) => {
      await callFunction("updateSource", { sourceId, data });
    },
    []
  );

  const deleteSource = useCallback(
    async (sourceId: string) => {
      await callFunction("deleteSource", { sourceId });
    },
    []
  );

  const saveFieldMappings = useCallback(
    async (sourceId: string, mappings: SavedFieldMapping) => {
      // Save field mappings by updating the source
      await callFunction("updateSource", {
        sourceId,
        data: { fieldMappings: mappings },
      });
    },
    []
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
