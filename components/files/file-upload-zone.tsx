"use client";

import { useCallback, useState, useMemo } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, Loader2, FileText, Image, X } from "lucide-react";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage, db } from "@/lib/firebase/config";
import { createFile, checkFileDuplicate, OperationsContext } from "@/lib/operations";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const MOCK_USER_ID = "dev-user-123";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_TYPES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "application/pdf": [".pdf"],
};

interface FileUploadZoneProps {
  onUploadComplete?: (fileId: string) => void;
  className?: string;
}

export function FileUploadZone({ onUploadComplete, className }: FileUploadZoneProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [currentFileName, setCurrentFileName] = useState<string | null>(null);

  const ctx: OperationsContext = useMemo(
    () => ({ db, userId: MOCK_USER_ID }),
    []
  );

  // Calculate SHA-256 hash of file content
  const calculateFileHash = useCallback(async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }, []);

  const uploadFile = useCallback(
    async (file: File) => {
      setUploading(true);
      setProgress(0);
      setError(null);
      setCurrentFileName(file.name);

      try {
        // Calculate hash first for duplicate detection
        const contentHash = await calculateFileHash(file);

        // Check for duplicate
        const existingFile = await checkFileDuplicate(ctx, contentHash);
        if (existingFile) {
          throw new Error(`Duplicate: "${existingFile.fileName}" already exists`);
        }

        // Create storage path
        const timestamp = Date.now();
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
        const storagePath = `files/${MOCK_USER_ID}/${timestamp}_${sanitizedName}`;

        // Upload to Firebase Storage
        const storageRef = ref(storage, storagePath);
        const uploadTask = uploadBytesResumable(storageRef, file);

        // Track upload progress
        await new Promise<void>((resolve, reject) => {
          uploadTask.on(
            "state_changed",
            (snapshot) => {
              const pct = Math.round(
                (snapshot.bytesTransferred / snapshot.totalBytes) * 100
              );
              setProgress(pct);
            },
            (err) => reject(err),
            () => resolve()
          );
        });

        // Get download URL
        const downloadUrl = await getDownloadURL(storageRef);

        // Create file document in Firestore (with hash)
        const fileId = await createFile(ctx, {
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          storagePath,
          downloadUrl,
          contentHash,
        });

        setCurrentFileName(null);
        onUploadComplete?.(fileId);
      } catch (err) {
        console.error("File upload failed:", err);
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
        setProgress(0);
      }
    },
    [ctx, onUploadComplete, calculateFileHash]
  );

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        uploadFile(acceptedFiles[0]);
      }
    },
    [uploadFile]
  );

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_FILE_SIZE,
    multiple: false,
    disabled: uploading,
  });

  // Show rejection error
  const rejectionError =
    fileRejections.length > 0
      ? fileRejections[0].errors[0].code === "file-too-large"
        ? "File too large (max 10MB)"
        : "Invalid file type (only PDF, JPG, PNG, WebP)"
      : null;

  const displayError = error || rejectionError;

  return (
    <div className={cn("space-y-2", className)}>
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
          isDragActive && "border-primary bg-primary/5",
          uploading && "cursor-not-allowed opacity-50",
          displayError && "border-destructive",
          !isDragActive && !displayError && "hover:border-primary/50 hover:bg-muted/50"
        )}
      >
        <input {...getInputProps()} />

        {uploading ? (
          <div className="space-y-3">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Uploading {currentFileName}</p>
              <Progress value={progress} className="w-48 mx-auto" />
              <p className="text-xs text-muted-foreground">{progress}%</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">
                {isDragActive ? "Drop file here" : "Drop file or click to upload"}
              </p>
              <p className="text-xs text-muted-foreground">
                PDF, JPG, PNG, or WebP up to 10MB
              </p>
            </div>
          </div>
        )}
      </div>

      {displayError && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
          <X className="h-4 w-4 flex-shrink-0" />
          {displayError}
        </div>
      )}
    </div>
  );
}
