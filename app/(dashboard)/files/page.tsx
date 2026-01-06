"use client";

import { Suspense, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { Upload } from "lucide-react";
import { storage, db } from "@/lib/firebase/config";
import { createFile, checkFileDuplicate, OperationsContext } from "@/lib/operations";
import { FileTable } from "@/components/files/file-table";
import { FileDetailPanel } from "@/components/files/file-detail-panel";
import { FileUploadZone } from "@/components/files/file-upload-zone";
import { UploadProgress, FileUploadStatus } from "@/components/files/upload-progress";
import { FilesDataTableHandle } from "@/components/files/files-data-table";
import { useFiles } from "@/hooks/use-files";
import { usePartners } from "@/hooks/use-partners";
import { useGlobalPartners } from "@/hooks/use-global-partners";
import { TaxFile, FileFilters } from "@/types/file";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const MOCK_USER_ID = "dev-user-123";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_TYPES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "application/pdf": [".pdf"],
};

const PANEL_WIDTH_KEY = "fileDetailPanelWidth";
const DEFAULT_PANEL_WIDTH = 600; // Larger for file preview
const MIN_PANEL_WIDTH = 480;
const MAX_PANEL_WIDTH = 900;
const SCROLL_RENDER_DELAY = 150;

function FileTableFallback() {
  return (
    <div className="h-full flex flex-col overflow-hidden bg-card">
      {/* Toolbar skeleton */}
      <div className="flex items-center gap-2 px-4 py-2 border-b">
        <Skeleton className="h-9 w-[300px]" />
        <Skeleton className="h-9 w-[100px]" />
      </div>
      {/* Table header skeleton */}
      <div className="flex items-center gap-2 px-4 h-10 border-b bg-muted">
        <Skeleton className="h-4 w-[80px]" />
        <Skeleton className="h-4 w-[70px]" />
        <Skeleton className="h-4 w-[50px]" />
        <Skeleton className="h-4 w-[150px]" />
        <Skeleton className="h-4 w-[80px]" />
      </div>
      {/* Table rows skeleton */}
      <div className="flex-1">
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-4 border-b last:border-b-0"
            style={{ height: 64 }}
          >
            <Skeleton className="h-5 w-[80px]" />
            <Skeleton className="h-5 w-[70px]" />
            <Skeleton className="h-5 w-[50px]" />
            <Skeleton className="h-5 w-[200px]" />
            <Skeleton className="h-5 w-[60px] rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function FilesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Operations context for file creation
  const ctx: OperationsContext = useMemo(
    () => ({ db, userId: MOCK_USER_ID }),
    []
  );

  // Parse filters from URL
  const filters: FileFilters = useMemo(() => {
    const hasConnections = searchParams.get("connected");
    const extractionComplete = searchParams.get("extracted");

    return {
      hasConnections: hasConnections === "true" ? true : hasConnections === "false" ? false : undefined,
      extractionComplete: extractionComplete === "true" ? true : extractionComplete === "false" ? false : undefined,
    };
  }, [searchParams]);

  // Get search value from URL
  const searchValue = searchParams.get("search") || "";

  const { files, loading, remove } = useFiles({
    search: searchValue,
    ...filters,
  });

  // Partner hooks for partner assignment
  const { partners: userPartners, createPartner } = usePartners();
  const { globalPartners } = useGlobalPartners();

  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState<number>(DEFAULT_PANEL_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const currentWidthRef = useRef(panelWidth);
  const tableRef = useRef<FilesDataTableHandle>(null);

  // Multi-file upload state
  const [uploads, setUploads] = useState<FileUploadStatus[]>([]);
  const [showUploadProgress, setShowUploadProgress] = useState(false);

  // Calculate SHA-256 hash of file content
  const calculateFileHash = useCallback(async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }, []);

  // Upload a single file and track progress
  const uploadSingleFile = useCallback(
    async (file: File, uploadId: string) => {
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
              setUploads((prev) =>
                prev.map((u) => (u.id === uploadId ? { ...u, progress: pct } : u))
              );
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

        // Mark as complete
        setUploads((prev) =>
          prev.map((u) =>
            u.id === uploadId
              ? { ...u, status: "complete" as const, progress: 100, fileId }
              : u
          )
        );

        return fileId;
      } catch (err) {
        console.error("File upload failed:", err);
        setUploads((prev) =>
          prev.map((u) =>
            u.id === uploadId
              ? {
                  ...u,
                  status: "error" as const,
                  error: err instanceof Error ? err.message : "Upload failed",
                }
              : u
          )
        );
        return null;
      }
    },
    [ctx, calculateFileHash]
  );

  // Handle multiple file drops
  const handleFileDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;

      // Create upload status entries
      const newUploads: FileUploadStatus[] = acceptedFiles.map((file, index) => ({
        id: `${Date.now()}-${index}`,
        fileName: file.name,
        progress: 0,
        status: "uploading" as const,
      }));

      setUploads(newUploads);
      setShowUploadProgress(true);

      // Upload all files in parallel
      const uploadPromises = acceptedFiles.map((file, index) =>
        uploadSingleFile(file, newUploads[index].id)
      );

      const results = await Promise.all(uploadPromises);

      // Select first successfully uploaded file
      const firstSuccessfulId = results.find((id) => id !== null);
      if (firstSuccessfulId) {
        const params = new URLSearchParams(searchParams.toString());
        params.set("id", firstSuccessfulId);
        router.push(`/files?${params.toString()}`, { scroll: false });
      }
    },
    [uploadSingleFile, router, searchParams]
  );

  // Dismiss upload progress
  const handleDismissProgress = useCallback(() => {
    setShowUploadProgress(false);
    setUploads([]);
  }, []);

  // Full-page dropzone
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleFileDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_FILE_SIZE,
    multiple: true,
    noClick: true, // Don't open file dialog on click - use FAB for that
    noKeyboard: true,
  });

  // Get selected file ID from URL
  const selectedId = searchParams.get("id");

  // Find selected file
  const selectedFile = useMemo(() => {
    if (!selectedId || !files.length) return null;
    return files.find((f) => f.id === selectedId) || null;
  }, [selectedId, files]);

  // Find current index for navigation
  const currentIndex = useMemo(() => {
    if (!selectedId) return -1;
    return files.findIndex((f) => f.id === selectedId);
  }, [selectedId, files]);

  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < files.length - 1;

  // Load panel width from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(PANEL_WIDTH_KEY);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= MIN_PANEL_WIDTH && parsed <= MAX_PANEL_WIDTH) {
        setPanelWidth(parsed);
      }
    }
  }, []);

  // Handle resize
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeRef.current = { startX: e.clientX, startWidth: panelWidth };
  }, [panelWidth]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current || !panelRef.current) return;
      const delta = resizeRef.current.startX - e.clientX;
      const newWidth = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, resizeRef.current.startWidth + delta));
      panelRef.current.style.width = `${newWidth}px`;
      currentWidthRef.current = newWidth;
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setPanelWidth(currentWidthRef.current);
      localStorage.setItem(PANEL_WIDTH_KEY, currentWidthRef.current.toString());
      resizeRef.current = null;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  // URL update helpers
  const handleSearchChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set("search", value);
      } else {
        params.delete("search");
      }
      const newUrl = params.toString() ? `/files?${params.toString()}` : "/files";
      router.replace(newUrl, { scroll: false });
    },
    [router, searchParams]
  );

  const handleFiltersChange = useCallback(
    (newFilters: FileFilters) => {
      const params = new URLSearchParams(searchParams.toString());

      if (newFilters.hasConnections === true) {
        params.set("connected", "true");
      } else if (newFilters.hasConnections === false) {
        params.set("connected", "false");
      } else {
        params.delete("connected");
      }

      if (newFilters.extractionComplete === true) {
        params.set("extracted", "true");
      } else if (newFilters.extractionComplete === false) {
        params.set("extracted", "false");
      } else {
        params.delete("extracted");
      }

      const newUrl = params.toString() ? `/files?${params.toString()}` : "/files";
      router.replace(newUrl, { scroll: false });
    },
    [router, searchParams]
  );

  const handleSelectFile = useCallback(
    (file: TaxFile) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("id", file.id);
      router.push(`/files?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const handleCloseDetail = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("id");
    const newUrl = params.toString() ? `/files?${params.toString()}` : "/files";
    router.push(newUrl, { scroll: false });
  }, [router, searchParams]);

  const handleNavigatePrevious = useCallback(() => {
    if (currentIndex > 0) {
      handleSelectFile(files[currentIndex - 1]);
    }
  }, [currentIndex, files, handleSelectFile]);

  const handleNavigateNext = useCallback(() => {
    if (currentIndex >= 0 && currentIndex < files.length - 1) {
      handleSelectFile(files[currentIndex + 1]);
    }
  }, [currentIndex, files, handleSelectFile]);

  const handleDelete = useCallback(async () => {
    if (!selectedFile) return;
    if (!confirm(`Delete "${selectedFile.fileName}"? This will also remove all connections.`)) return;
    await remove(selectedFile.id);
    handleCloseDetail();
  }, [selectedFile, remove, handleCloseDetail]);


  const handleUploadComplete = useCallback(
    (fileId: string) => {
      setIsUploadDialogOpen(false);
      // Select the newly uploaded file
      const params = new URLSearchParams(searchParams.toString());
      params.set("id", fileId);
      router.push(`/files?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  // Track previous selectedId to avoid unnecessary scrolls
  const prevSelectedIdRef = useRef<string | null>(null);

  // Scroll to selected file when it changes
  useEffect(() => {
    if (loading || !selectedId || !files.length) return;
    if (selectedId === prevSelectedIdRef.current) return;

    prevSelectedIdRef.current = selectedId;

    const index = files.findIndex((f) => f.id === selectedId);
    if (index === -1) return;

    tableRef.current?.scrollToIndex(index);

    setTimeout(() => {
      const element = document.querySelector(`[data-file-id="${selectedId}"]`);
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, SCROLL_RENDER_DELAY);
  }, [selectedId, loading, files]);

  if (loading) {
    return <FileTableFallback />;
  }

  return (
    <TooltipProvider>
      <div {...getRootProps()} className="h-full overflow-hidden relative">
        <input {...getInputProps()} />

      {/* Drag overlay */}
      {isDragActive && (
        <div className="absolute inset-0 z-50 bg-primary/10 border-2 border-dashed border-primary flex items-center justify-center pointer-events-none">
          <div className="bg-background rounded-lg p-6 shadow-lg text-center">
            <Upload className="h-12 w-12 mx-auto text-primary mb-2" />
            <p className="text-lg font-medium">Drop files to upload</p>
            <p className="text-sm text-muted-foreground">PDF, JPG, PNG, or WebP up to 10MB each</p>
          </div>
        </div>
      )}

      {/* Upload FAB */}
      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogTrigger asChild>
          <Button
            className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-lg"
            size="icon"
          >
            <Upload className="h-6 w-6" />
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload File</DialogTitle>
          </DialogHeader>
          <FileUploadZone onUploadComplete={handleUploadComplete} />
        </DialogContent>
      </Dialog>

      {/* Main content */}
      <div
        className="h-full flex flex-col transition-[margin] duration-200 ease-in-out"
        style={{ marginRight: selectedFile ? panelWidth : 0 }}
      >
        <div className="flex-1 overflow-hidden">
          <FileTable
            ref={tableRef}
            files={files}
            onSelectFile={handleSelectFile}
            selectedFileId={selectedId}
            searchValue={searchValue}
            onSearchChange={handleSearchChange}
            filters={filters}
            onFiltersChange={handleFiltersChange}
            userPartners={userPartners}
            globalPartners={globalPartners}
          />
        </div>

        {/* Upload progress bar - sticky at bottom */}
        {showUploadProgress && uploads.length > 0 && (
          <UploadProgress uploads={uploads} onDismiss={handleDismissProgress} />
        )}
      </div>

      {/* Right sidebar - File detail panel */}
      {selectedFile && (
        <div
          ref={panelRef}
          className="fixed right-0 top-14 bottom-0 z-30 bg-background border-l flex"
          style={{ width: panelWidth }}
        >
          {/* Resize handle */}
          <div
            className={cn(
              "w-1 cursor-col-resize bg-border hover:bg-primary/20 active:bg-primary/30 flex-shrink-0",
              isResizing && "bg-primary/30"
            )}
            onMouseDown={handleResizeStart}
          />
          {/* Panel content */}
          <div className="flex-1 overflow-hidden">
            <FileDetailPanel
              file={selectedFile}
              onClose={handleCloseDetail}
              onNavigatePrevious={handleNavigatePrevious}
              onNavigateNext={handleNavigateNext}
              hasPrevious={hasPrevious}
              hasNext={hasNext}
              onDelete={handleDelete}
              userPartners={userPartners}
              globalPartners={globalPartners}
              onCreatePartner={createPartner}
            />
          </div>
        </div>
      )}

        {/* Prevent text selection while resizing */}
        {isResizing && (
          <div className="fixed inset-0 z-50 cursor-col-resize" />
        )}
      </div>
    </TooltipProvider>
  );
}

export default function FilesPage() {
  return (
    <Suspense fallback={<FileTableFallback />}>
      <FilesContent />
    </Suspense>
  );
}
