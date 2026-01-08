"use client";

import { useState, useCallback } from "react";
import { EmailMessage, EmailSearchParams, EmailAttachment } from "@/types/email-integration";

export interface UseGmailSearchResult {
  /** Search results */
  messages: EmailMessage[];
  /** Loading state */
  loading: boolean;
  /** Error message if any */
  error: string | null;
  /** Whether there are more results */
  hasMore: boolean;
  /** Search for emails */
  search: (params: Omit<EmailSearchParams, "integrationId">) => Promise<void>;
  /** Load more results */
  loadMore: () => Promise<void>;
  /** Clear search results */
  clear: () => void;
  /** Currently previewing attachment */
  previewAttachment: EmailAttachment | null;
  /** Set preview attachment */
  setPreviewAttachment: (attachment: EmailAttachment | null) => void;
  /** Get preview URL for attachment */
  getPreviewUrl: (attachment: EmailAttachment) => string;
  /** Save attachment to Files and optionally connect to transaction */
  saveAttachment: (
    attachment: EmailAttachment,
    transactionId?: string,
    subject?: string
  ) => Promise<{ fileId: string; fileName: string }>;
  /** Saving state */
  saving: boolean;
}

export function useGmailSearch(integrationId: string | null): UseGmailSearchResult {
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [lastParams, setLastParams] = useState<Omit<EmailSearchParams, "integrationId"> | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<EmailAttachment | null>(null);

  // Search for emails
  const search = useCallback(
    async (params: Omit<EmailSearchParams, "integrationId">) => {
      if (!integrationId) {
        setError("No Gmail account selected");
        return;
      }

      setLoading(true);
      setError(null);
      setMessages([]);
      setNextPageToken(undefined);
      setLastParams(params);

      try {
        const response = await fetch("/api/gmail/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            integrationId,
            ...params,
            dateFrom: params.dateFrom?.toISOString(),
            dateTo: params.dateTo?.toISOString(),
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          if (errorData.code === "AUTH_EXPIRED" || errorData.code === "TOKEN_EXPIRED") {
            throw new Error("Gmail session expired. Please reconnect your account.");
          }
          throw new Error(errorData.error || "Search failed");
        }

        const data = await response.json();
        setMessages(
          data.messages.map((msg: EmailMessage & { date: string }) => ({
            ...msg,
            date: new Date(msg.date),
          }))
        );
        setNextPageToken(data.nextPageToken);
      } catch (err) {
        console.error("Gmail search error:", err);
        setError(err instanceof Error ? err.message : "Search failed");
      } finally {
        setLoading(false);
      }
    },
    [integrationId]
  );

  // Load more results
  const loadMore = useCallback(async () => {
    if (!integrationId || !nextPageToken || !lastParams || loading) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/gmail/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          integrationId,
          ...lastParams,
          dateFrom: lastParams.dateFrom?.toISOString(),
          dateTo: lastParams.dateTo?.toISOString(),
          pageToken: nextPageToken,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to load more");
      }

      const data = await response.json();
      setMessages((prev) => [
        ...prev,
        ...data.messages.map((msg: EmailMessage & { date: string }) => ({
          ...msg,
          date: new Date(msg.date),
        })),
      ]);
      setNextPageToken(data.nextPageToken);
    } catch (err) {
      console.error("Load more error:", err);
      setError(err instanceof Error ? err.message : "Failed to load more");
    } finally {
      setLoading(false);
    }
  }, [integrationId, nextPageToken, lastParams, loading]);

  // Clear results
  const clear = useCallback(() => {
    setMessages([]);
    setNextPageToken(undefined);
    setLastParams(null);
    setError(null);
    setPreviewAttachment(null);
  }, []);

  // Get preview URL for attachment
  const getPreviewUrl = useCallback(
    (attachment: EmailAttachment): string => {
      if (!integrationId) return "";
      const params = new URLSearchParams({
        integrationId,
        messageId: attachment.messageId,
        attachmentId: attachment.attachmentId,
        mimeType: attachment.mimeType,
        filename: attachment.filename,
      });
      return `/api/gmail/attachment?${params.toString()}`;
    },
    [integrationId]
  );

  // Save attachment to Files
  const saveAttachment = useCallback(
    async (
      attachment: EmailAttachment,
      transactionId?: string,
      subject?: string
    ): Promise<{ fileId: string; fileName: string }> => {
      if (!integrationId) {
        throw new Error("No Gmail account selected");
      }

      setSaving(true);
      setError(null);

      try {
        const response = await fetch("/api/gmail/attachment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            integrationId,
            messageId: attachment.messageId,
            attachmentId: attachment.attachmentId,
            mimeType: attachment.mimeType,
            filename: attachment.filename,
            transactionId,
            gmailMessageSubject: subject,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to save attachment");
        }

        const data = await response.json();
        return {
          fileId: data.fileId,
          fileName: data.fileName,
        };
      } catch (err) {
        console.error("Save attachment error:", err);
        const message = err instanceof Error ? err.message : "Failed to save attachment";
        setError(message);
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [integrationId]
  );

  return {
    messages,
    loading,
    error,
    hasMore: !!nextPageToken,
    search,
    loadMore,
    clear,
    previewAttachment,
    setPreviewAttachment,
    getPreviewUrl,
    saveAttachment,
    saving,
  };
}
