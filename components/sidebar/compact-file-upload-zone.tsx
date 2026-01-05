"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useFileUpload } from "@/hooks/use-file-upload";
import { Receipt } from "@/types/receipt";
import { cn } from "@/lib/utils";
import { Upload, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface CompactFileUploadZoneProps {
  transactionId: string;
  onUploadComplete: (receipt: Receipt) => void;
}

const ACCEPTED_FILE_TYPES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "application/pdf": [".pdf"],
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function CompactFileUploadZone({
  transactionId,
  onUploadComplete,
}: CompactFileUploadZoneProps) {
  const { uploadFile, progress, isUploading, error } = useFileUpload();
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      setPendingFile(file);
      const receipt = await uploadFile(file, transactionId);

      if (receipt) {
        onUploadComplete(receipt);
      }

      setPendingFile(null);
    },
    [uploadFile, transactionId, onUploadComplete]
  );

  const { getRootProps, getInputProps, isDragActive, fileRejections } =
    useDropzone({
      onDrop,
      accept: ACCEPTED_FILE_TYPES,
      maxSize: MAX_FILE_SIZE,
      maxFiles: 1,
      disabled: isUploading,
    });

  return (
    <div className="space-y-1">
      {/* Compact Dropzone */}
      <div
        {...getRootProps()}
        className={cn(
          "border border-dashed rounded-md px-3 py-2 transition-all duration-200",
          "hover:border-primary hover:bg-primary/5 cursor-pointer",
          "flex items-center gap-2",
          isDragActive && "border-primary bg-primary/10",
          isUploading && "pointer-events-none opacity-60",
          error && "border-destructive"
        )}
      >
        <input {...getInputProps()} />

        {isUploading ? (
          <div className="flex items-center gap-2 flex-1">
            <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground truncate">
                {pendingFile?.name}
              </p>
              <Progress value={progress} className="h-1 mt-1" />
            </div>
          </div>
        ) : (
          <>
            <Upload
              className={cn(
                "h-4 w-4 shrink-0 transition-colors",
                isDragActive ? "text-primary" : "text-muted-foreground"
              )}
            />
            <span className="text-sm text-muted-foreground">
              {isDragActive ? "Drop file here" : "Drop or click to upload"}
            </span>
          </>
        )}
      </div>

      {/* File rejection errors */}
      {fileRejections.length > 0 && (
        <p className="text-xs text-destructive">
          {fileRejections[0].errors[0].message}
        </p>
      )}

      {/* Upload error */}
      {error && (
        <p className="text-xs text-destructive">
          Upload failed: {error.message}
        </p>
      )}
    </div>
  );
}
