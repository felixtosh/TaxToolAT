"use client";

import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface FilePreviewProps {
  downloadUrl: string;
  fileType: string;
  fileName: string;
  className?: string;
  onClick?: () => void;
}

/**
 * Small thumbnail preview - click to open full viewer
 */
export function FilePreview({
  downloadUrl,
  fileType,
  fileName,
  className,
  onClick,
}: FilePreviewProps) {
  const isPdf = fileType === "application/pdf";
  const isImage = fileType.startsWith("image/");

  return (
    <div
      className={cn(
        "relative bg-muted/30 rounded-md overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all",
        className
      )}
      onClick={onClick}
    >
      {isPdf ? (
        // PDF thumbnail - show first page as image if possible, otherwise icon
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
