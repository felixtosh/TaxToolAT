"use client";

import { FilePreview } from "./file-preview";
import { useAttachmentPreview } from "@/hooks/use-attachment-preview";
import { Loader2, AlertCircle, FileText } from "lucide-react";

interface GmailAttachmentPreviewProps {
  integrationId: string;
  messageId: string;
  attachmentId: string;
  mimeType: string;
  filename: string;
  className?: string;
  onClick?: () => void;
  fullSize?: boolean;
  active?: boolean;
}

/**
 * Gmail attachment preview component.
 * Fetches the attachment with authentication and displays it using FilePreview.
 */
export function GmailAttachmentPreview({
  integrationId,
  messageId,
  attachmentId,
  mimeType,
  filename,
  className,
  onClick,
  fullSize = false,
  active = false,
}: GmailAttachmentPreviewProps) {
  const { blobUrl, isLoading, error } = useAttachmentPreview({
    integrationId,
    messageId,
    attachmentId,
    mimeType,
    filename,
  });

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center bg-muted/30 ${fullSize ? 'h-full' : 'aspect-[3/4]'} ${className}`}>
        <div className="flex flex-col items-center text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin mb-2" />
          <p className="text-sm">Loading preview...</p>
        </div>
      </div>
    );
  }

  if (error || !blobUrl) {
    return (
      <div className={`flex items-center justify-center bg-muted/30 ${fullSize ? 'h-full' : 'aspect-[3/4]'} ${className}`}>
        <div className="flex flex-col items-center text-muted-foreground">
          {error ? (
            <>
              <AlertCircle className="h-8 w-8 mb-2 text-destructive" />
              <p className="text-sm">Failed to load preview</p>
              <p className="text-xs text-center max-w-[200px] mt-1">{error}</p>
            </>
          ) : (
            <>
              <FileText className="h-8 w-8 mb-2" />
              <p className="text-sm">{filename}</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <FilePreview
      downloadUrl={blobUrl}
      fileType={mimeType}
      fileName={filename}
      className={className}
      onClick={onClick}
      fullSize={fullSize}
      active={active}
    />
  );
}
