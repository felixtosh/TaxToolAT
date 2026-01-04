"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useFileUpload } from "@/hooks/use-file-upload";
import { Receipt } from "@/types/receipt";
import { cn } from "@/lib/utils";
import { Upload, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { AiSuggestionCard } from "./ai-suggestion-card";

interface FileUploadZoneProps {
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

export function FileUploadZone({
  transactionId,
  onUploadComplete,
}: FileUploadZoneProps) {
  const { uploadFile, progress, isUploading, error } = useFileUpload();
  const [uploadedReceipt, setUploadedReceipt] = useState<Receipt | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      setPendingFile(file);
      const receipt = await uploadFile(file, transactionId);

      if (receipt) {
        setUploadedReceipt(receipt);
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
    <div className="space-y-4">
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={cn(
          "relative border-2 border-dashed rounded-lg p-6 transition-all duration-200",
          "hover:border-primary hover:bg-primary/5 cursor-pointer",
          isDragActive && "border-primary bg-primary/10 scale-[1.02]",
          isUploading && "pointer-events-none opacity-60",
          error && "border-destructive"
        )}
      >
        <input {...getInputProps()} />

        <div className="flex flex-col items-center justify-center text-center">
          {isUploading ? (
            <>
              <Loader2 className="h-10 w-10 text-primary animate-spin mb-3" />
              <p className="text-sm font-medium">
                Uploading {pendingFile?.name}...
              </p>
              <Progress value={progress} className="w-full mt-3 h-2" />
              <p className="text-xs text-muted-foreground mt-1">
                {Math.round(progress)}%
              </p>
            </>
          ) : (
            <>
              <div
                className={cn(
                  "p-3 rounded-full mb-3 transition-colors",
                  isDragActive ? "bg-primary/20" : "bg-muted"
                )}
              >
                <Upload
                  className={cn(
                    "h-6 w-6 transition-colors",
                    isDragActive ? "text-primary" : "text-muted-foreground"
                  )}
                />
              </div>
              <p className="text-sm font-medium">
                {isDragActive ? "Drop your file here" : "Drag & drop a receipt"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                or click to browse (PDF, JPG, PNG up to 10MB)
              </p>
            </>
          )}
        </div>
      </div>

      {/* File rejection errors */}
      {fileRejections.length > 0 && (
        <div className="text-sm text-destructive">
          {fileRejections[0].errors[0].message}
        </div>
      )}

      {/* Upload error */}
      {error && (
        <div className="text-sm text-destructive">
          Upload failed: {error.message}
        </div>
      )}

      {/* AI Suggestion after upload */}
      {uploadedReceipt?.aiSuggestedDescription && (
        <AiSuggestionCard
          suggestion={uploadedReceipt.aiSuggestedDescription}
          onAccept={() => {
            // TODO: Apply suggestion to transaction description
            setUploadedReceipt(null);
          }}
          onDismiss={() => setUploadedReceipt(null)}
        />
      )}
    </div>
  );
}
