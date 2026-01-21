import { useState, useEffect, useRef } from "react";
import { fetchWithAuth } from "@/lib/api/fetch-with-auth";

interface AttachmentParams {
  integrationId: string;
  messageId: string;
  attachmentId: string;
  mimeType: string;
  filename: string;
}

interface UseAttachmentPreviewResult {
  blobUrl: string | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook to fetch an attachment with authentication and create a blob URL for preview.
 * This is necessary because direct browser requests (iframe, img src) don't include
 * the Authorization header.
 */
export function useAttachmentPreview(
  params: AttachmentParams | null
): UseAttachmentPreviewResult {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previousParamsRef = useRef<string | null>(null);

  useEffect(() => {
    // Cleanup function to revoke blob URLs
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  useEffect(() => {
    if (!params) {
      setBlobUrl(null);
      setError(null);
      return;
    }

    const paramsKey = `${params.integrationId}-${params.messageId}-${params.attachmentId}`;

    // Skip if we're already showing this attachment
    if (previousParamsRef.current === paramsKey && blobUrl) {
      return;
    }
    previousParamsRef.current = paramsKey;

    const fetchAttachment = async () => {
      setIsLoading(true);
      setError(null);

      // Revoke previous blob URL
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        setBlobUrl(null);
      }

      try {
        const searchParams = new URLSearchParams({
          integrationId: params.integrationId,
          messageId: params.messageId,
          attachmentId: params.attachmentId,
          mimeType: params.mimeType,
          filename: params.filename,
        });

        const response = await fetchWithAuth(
          `/api/gmail/attachment?${searchParams.toString()}`,
          { method: "GET" }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed to load attachment: ${response.status}`);
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
      } catch (err) {
        console.error("Error fetching attachment:", err);
        setError(err instanceof Error ? err.message : "Failed to load attachment");
        setBlobUrl(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAttachment();
  }, [params?.integrationId, params?.messageId, params?.attachmentId, params?.mimeType, params?.filename]);

  return { blobUrl, isLoading, error };
}

/**
 * Fetch an attachment as a blob URL (one-time fetch, not reactive)
 */
export async function fetchAttachmentBlobUrl(
  params: AttachmentParams
): Promise<string> {
  const searchParams = new URLSearchParams({
    integrationId: params.integrationId,
    messageId: params.messageId,
    attachmentId: params.attachmentId,
    mimeType: params.mimeType,
    filename: params.filename,
  });

  const response = await fetchWithAuth(
    `/api/gmail/attachment?${searchParams.toString()}`,
    { method: "GET" }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to load attachment: ${response.status}`);
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
