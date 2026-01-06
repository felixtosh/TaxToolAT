"use client";

import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle, Loader2, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface FileUploadStatus {
  id: string;
  fileName: string;
  progress: number;
  status: "uploading" | "complete" | "error";
  error?: string;
  fileId?: string; // Firestore document ID after successful upload
}

interface UploadProgressProps {
  uploads: FileUploadStatus[];
  onDismiss?: () => void;
  className?: string;
}

export function UploadProgress({ uploads, onDismiss, className }: UploadProgressProps) {
  const totalFiles = uploads.length;
  const completedFiles = uploads.filter((u) => u.status === "complete").length;
  const errorFiles = uploads.filter((u) => u.status === "error").length;
  const uploadingFiles = uploads.filter((u) => u.status === "uploading");

  // Calculate overall progress
  const overallProgress =
    totalFiles > 0
      ? Math.round(uploads.reduce((sum, u) => sum + u.progress, 0) / totalFiles)
      : 0;

  const isComplete = completedFiles + errorFiles === totalFiles;
  const allSuccessful = isComplete && errorFiles === 0;

  return (
    <div className={cn("bg-background/95 backdrop-blur border-t px-4 py-3 shadow-lg", className)}>
      <div className="flex items-center gap-4">
        {/* Status icon */}
        <div className="flex-shrink-0">
          {isComplete ? (
            allSuccessful ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : (
              <XCircle className="h-5 w-5 text-destructive" />
            )
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          )}
        </div>

        {/* Progress info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium truncate">
              {isComplete
                ? allSuccessful
                  ? `${completedFiles} file${completedFiles !== 1 ? "s" : ""} uploaded`
                  : `${completedFiles} uploaded, ${errorFiles} failed`
                : `Uploading ${totalFiles} file${totalFiles !== 1 ? "s" : ""}...`}
            </span>
            <span className="text-sm text-muted-foreground ml-2">
              {overallProgress}%
            </span>
          </div>
          <Progress value={overallProgress} className="h-1.5" />

          {/* Show current uploading files */}
          {uploadingFiles.length > 0 && uploadingFiles.length <= 3 && (
            <div className="flex items-center gap-3 mt-1.5">
              {uploadingFiles.map((upload) => (
                <div key={upload.id} className="flex items-center gap-1 text-xs text-muted-foreground">
                  <FileText className="h-3 w-3" />
                  <span className="truncate max-w-[120px]">{upload.fileName}</span>
                  <span>({upload.progress}%)</span>
                </div>
              ))}
            </div>
          )}

          {/* Show errors if any */}
          {errorFiles > 0 && isComplete && (
            <div className="mt-1.5 text-xs text-destructive">
              {uploads
                .filter((u) => u.status === "error")
                .slice(0, 3)
                .map((u) => (
                  <div key={u.id} className="truncate">
                    {u.fileName}: {u.error || "Upload failed"}
                  </div>
                ))}
              {errorFiles > 3 && (
                <div>...and {errorFiles - 3} more errors</div>
              )}
            </div>
          )}
        </div>

        {/* Dismiss button (only when complete) */}
        {isComplete && onDismiss && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            className="flex-shrink-0 h-7 w-7 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
