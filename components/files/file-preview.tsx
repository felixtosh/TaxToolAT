"use client";

import { FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface FilePreviewProps {
  downloadUrl: string;
  fileType: string;
  fileName: string;
  className?: string;
  onClick?: () => void;
  /** Full size mode - fills container instead of using aspect ratio */
  fullSize?: boolean;
}

/**
 * File preview component - supports both thumbnail and full-size modes
 */
export function FilePreview({
  downloadUrl,
  fileType,
  fileName,
  className,
  onClick,
  fullSize = false,
}: FilePreviewProps) {
  const isPdf = fileType === "application/pdf";
  const isImage = fileType.startsWith("image/");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  if (fullSize) {
    return (
      <div
        className={cn(
          "relative w-full h-full bg-muted/30 overflow-hidden",
          onClick && "cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all",
          className
        )}
        onClick={onClick}
      >
        {loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}
        {error ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
            <FileText className="h-12 w-12 mb-2" />
            <p className="text-sm">Failed to load preview</p>
            <p className="text-xs">{fileName}</p>
          </div>
        ) : isPdf ? (
          <iframe
            src={`${downloadUrl}#toolbar=0&navpanes=0&view=FitH`}
            className="w-full h-full border-0"
            title={fileName}
            onLoad={() => setLoading(false)}
            onError={() => { setLoading(false); setError(true); }}
          />
        ) : isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={downloadUrl}
            alt={fileName}
            className="w-full h-full object-contain"
            onLoad={() => setLoading(false)}
            onError={() => { setLoading(false); setError(true); }}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
            <FileText className="h-12 w-12 mb-2" />
            <p className="text-sm">{fileName}</p>
            <p className="text-xs text-muted-foreground">{fileType}</p>
          </div>
        )}
      </div>
    );
  }

  // Thumbnail mode (original behavior)
  return (
    <div
      className={cn(
        "relative bg-muted/30 rounded-md overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all",
        className
      )}
      onClick={onClick}
    >
      {isPdf ? (
        <div className="aspect-[3/4] flex items-center justify-center bg-white">
          <iframe
            src={`${downloadUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
            className="w-full h-full border-0 pointer-events-none"
            title={fileName}
          />
        </div>
      ) : isImage ? (
        <div className="aspect-[3/4] flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={downloadUrl}
            alt={fileName}
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="aspect-[3/4] flex flex-col items-center justify-center text-muted-foreground">
          <FileText className="h-8 w-8" />
        </div>
      )}
    </div>
  );
}
