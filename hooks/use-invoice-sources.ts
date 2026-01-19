"use client";

import { useState, useCallback, useMemo } from "react";
import { db } from "@/lib/firebase/config";
import {
  addInvoiceSource,
  removeInvoiceSource,
  updateInvoiceSource,
  promoteInvoiceLinkToSource,
  inferAndUpdateInvoiceFrequency,
  markSourceFetchSuccess,
  markSourceFetchFailure,
  AddInvoiceSourceData,
} from "@/lib/operations";
import { InvoiceSourceStatus } from "@/types/partner";
import { useAuth } from "@/components/auth";

interface UseInvoiceSourcesOptions {
  partnerId: string;
}

interface UseInvoiceSourcesResult {
  // Actions
  addSource: (url: string, label?: string) => Promise<string>;
  removeSource: (sourceId: string) => Promise<void>;
  toggleSourceStatus: (
    sourceId: string,
    newStatus: "active" | "paused"
  ) => Promise<void>;
  triggerFetch: (sourceId: string) => Promise<void>;
  promoteLink: (linkIndex: number) => Promise<string>;
  inferFrequency: (sourceId: string) => Promise<void>;

  // State
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook for managing invoice sources on a partner.
 * Uses the operations layer for all data access.
 */
export function useInvoiceSources({
  partnerId,
}: UseInvoiceSourcesOptions): UseInvoiceSourcesResult {
  const { userId } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ctx = useMemo(() => ({ db, userId: userId ?? "" }), [userId]);

  /**
   * Add a new invoice source
   */
  const addSource = useCallback(
    async (url: string, label?: string): Promise<string> => {
      setIsLoading(true);
      setError(null);
      try {
        const data: AddInvoiceSourceData = {
          url,
          label,
          sourceType: "manual",
        };
        const sourceId = await addInvoiceSource(ctx, partnerId, data);
        return sourceId;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to add source";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [ctx, partnerId]
  );

  /**
   * Remove an invoice source
   */
  const removeSource = useCallback(
    async (sourceId: string): Promise<void> => {
      setIsLoading(true);
      setError(null);
      try {
        await removeInvoiceSource(ctx, partnerId, sourceId);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to remove source";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [ctx, partnerId]
  );

  /**
   * Toggle source status between active and paused
   */
  const toggleSourceStatus = useCallback(
    async (sourceId: string, newStatus: "active" | "paused"): Promise<void> => {
      setError(null);
      try {
        await updateInvoiceSource(ctx, partnerId, sourceId, {
          status: newStatus,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update status";
        setError(message);
        throw err;
      }
    },
    [ctx, partnerId]
  );

  /**
   * Trigger a fetch for an invoice source.
   * This would typically communicate with the browser extension.
   * For now, it just marks the source as fetched.
   */
  const triggerFetch = useCallback(
    async (sourceId: string): Promise<void> => {
      setIsLoading(true);
      setError(null);
      try {
        // In a real implementation, this would:
        // 1. Send a message to the browser extension to start fetching
        // 2. The extension would navigate to the URL and collect invoices
        // 3. Results would be reported back via API
        //
        // For now, we just mark it as a successful fetch
        // TODO: Implement actual browser extension communication
        await markSourceFetchSuccess(ctx, partnerId, sourceId);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to trigger fetch";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [ctx, partnerId]
  );

  /**
   * Promote a discovered invoice link to a full source
   */
  const promoteLink = useCallback(
    async (linkIndex: number): Promise<string> => {
      setIsLoading(true);
      setError(null);
      try {
        const sourceId = await promoteInvoiceLinkToSource(
          ctx,
          partnerId,
          linkIndex
        );
        return sourceId;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to promote link";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [ctx, partnerId]
  );

  /**
   * Infer frequency from historical invoices
   */
  const inferFrequency = useCallback(
    async (sourceId: string): Promise<void> => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await inferAndUpdateInvoiceFrequency(
          ctx,
          partnerId,
          sourceId
        );
        if (!result) {
          setError("Not enough data to infer frequency (need at least 3 invoices)");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to infer frequency";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [ctx, partnerId]
  );

  return {
    addSource,
    removeSource,
    toggleSourceStatus,
    triggerFetch,
    promoteLink,
    inferFrequency,
    isLoading,
    error,
  };
}
