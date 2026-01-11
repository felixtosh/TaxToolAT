"use client";

import { Suspense, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { Upload } from "lucide-react";
import { storage, db } from "@/lib/firebase/config";
import { createFile, checkFileDuplicate, retryFileExtraction, OperationsContext } from "@/lib/operations";
import { FileTable } from "@/components/files/file-table";
import { FileDetailPanel } from "@/components/files/file-detail-panel";
import { FileBulkActionsPanel } from "@/components/files/file-bulk-actions-panel";
import { FileUploadZone } from "@/components/files/file-upload-zone";
import { FileViewerOverlay } from "@/components/files/file-viewer-overlay";
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
    const includeDeleted = searchParams.get("deleted");
    const isNotInvoice = searchParams.get("notInvoice");

    return {
      hasConnections: hasConnections === "true" ? true : hasConnections === "false" ? false : undefined,
      extractionComplete: extractionComplete === "true" ? true : extractionComplete === "false" ? false : undefined,
      includeDeleted: includeDeleted === "true" ? true : undefined,
      isNotInvoice: isNotInvoice === "true" ? true : undefined,
    };
  }, [searchParams]);

  // Get search value from URL
  const searchValue = searchParams.get("search") || "";

  const { files, loading, remove, restore, markAsNotInvoice, unmarkAsNotInvoice } = useFiles({
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

  // Multi-select state:
  // - Primary selection: URL ?id=X (the anchor, shows detail panel)
  // - Additional selections: React state (CMD/Shift added, lighter highlight)
  const [additionalSelectedIds, setAdditionalSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  // Primary selected ID comes from URL
  const primarySelectedId = searchParams.get("id");

  // Combined selection = primary + additional (for bulk operations)
  const allSelectedIds = useMemo(() => {
    const all = new Set(additionalSelectedIds);
    if (primarySelectedId) {
      all.add(primarySelectedId);
    }
    return all;
  }, [primarySelectedId, additionalSelectedIds]);

  // Derive selected files from all IDs
  const selectedFiles = useMemo(() => {
    return files.filter((f) => allSelectedIds.has(f.id));
  }, [files, allSelectedIds]);

  // Show bulk panel when there are additional selections (primary + at least one more)
  const showBulkPanel = additionalSelectedIds.size > 0;

  // File viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [highlightText, setHighlightText] = useState<string | null>(null);

  // Track file ID being parsed after user override (skips classification)
  const [parsingFileId, setParsingFileId] = useState<string | null>(null);

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

        // Check for duplicate - handle gracefully without throwing
        const existingFile = await checkFileDuplicate(ctx, contentHash);
        if (existingFile) {
          setUploads((prev) =>
            prev.map((u) =>
              u.id === uploadId
                ? {
                    ...u,
                    status: "error" as const,
                    progress: 100, // Mark as processed
                    duplicateFileId: existingFile.id,
                    duplicateFileName: existingFile.fileName,
                  }
                : u
            )
          );
          return null;
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

  // Find selected file (primary selection from URL)
  const selectedFile = useMemo(() => {
    if (!primarySelectedId || !files.length) return null;
    return files.find((f) => f.id === primarySelectedId) || null;
  }, [primarySelectedId, files]);

  // Find current index for navigation
  const currentIndex = useMemo(() => {
    if (!primarySelectedId) return -1;
    return files.findIndex((f) => f.id === primarySelectedId);
  }, [primarySelectedId, files]);

  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < files.length - 1;

  // Note: We intentionally do NOT close the viewer when navigating between files
  // The viewer should stay open so users can browse through files quickly

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

  // Track previous extractionComplete to detect transitions
  const prevExtractionCompleteRef = useRef<boolean | undefined>(undefined);

  // Clear parsingFileId only when extraction TRANSITIONS from false to true
  // This prevents clearing it immediately when user clicks "Invoice" (before cloud function resets it)
  useEffect(() => {
    const prevComplete = prevExtractionCompleteRef.current;
    const currComplete = selectedFile?.extractionComplete;

    if (parsingFileId && selectedFile?.id === parsingFileId) {
      // Only clear when we see the transition from incomplete to complete
      if (prevComplete === false && currComplete === true) {
        setParsingFileId(null);
      }
    }

    prevExtractionCompleteRef.current = currComplete;
  }, [parsingFileId, selectedFile?.id, selectedFile?.extractionComplete]);

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

      if (newFilters.includeDeleted === true) {
        params.set("deleted", "true");
      } else {
        params.delete("deleted");
      }

      if (newFilters.isNotInvoice === true) {
        params.set("notInvoice", "true");
      } else {
        params.delete("notInvoice");
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
    const isGmailFile = selectedFile.sourceType === "gmail";
    const message = isGmailFile
      ? `Delete "${selectedFile.fileName}"? It will be hidden but won't be re-imported from Gmail.`
      : `Permanently delete "${selectedFile.fileName}"? This will also remove all connections.`;
    if (!confirm(message)) return;
    // Use soft delete for Gmail files to prevent re-import
    await remove(selectedFile.id, isGmailFile);
    handleCloseDetail();
  }, [selectedFile, remove, handleCloseDetail]);

  const handleRestore = useCallback(async () => {
    if (!selectedFile) return;
    await restore(selectedFile.id);
  }, [selectedFile, restore]);

  const handleMarkAsNotInvoice = useCallback(async () => {
    if (!selectedFile) return;
    await markAsNotInvoice(selectedFile.id);
  }, [selectedFile, markAsNotInvoice]);

  const handleUnmarkAsNotInvoice = useCallback(async () => {
    if (!selectedFile) return;
    // Set parsing state FIRST before any Firestore updates (prevents race condition)
    setParsingFileId(selectedFile.id);
    // Unmark as not-invoice and trigger re-extraction (user says it IS an invoice)
    await unmarkAsNotInvoice(selectedFile.id);
    // Force re-extraction since user overrode the AI classification
    try {
      await retryFileExtraction(ctx, selectedFile.id);
    } catch (error) {
      console.error("Failed to re-extract after marking as invoice:", error);
      setParsingFileId(null);
    }
  }, [selectedFile, unmarkAsNotInvoice, ctx]);


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

  // Multi-select: handle selection changes from table
  // This receives: { primaryId, additionalIds } from the table
  const handleSelectionChange = useCallback(
    (newSelectedIds: Set<string>) => {
      // The table sends us the full set of selected IDs
      // We need to figure out what changed

      // If exactly one ID and it's different from current primary, it's a new primary click
      if (newSelectedIds.size === 1) {
        const [id] = newSelectedIds;
        // Clear additional selections, update primary via URL
        setAdditionalSelectedIds(new Set());
        const params = new URLSearchParams(searchParams.toString());
        params.set("id", id);
        router.push(`/files?${params.toString()}`, { scroll: false });
      } else if (newSelectedIds.size === 0) {
        // Clear everything
        setAdditionalSelectedIds(new Set());
        const params = new URLSearchParams(searchParams.toString());
        params.delete("id");
        const newUrl = params.toString() ? `/files?${params.toString()}` : "/files";
        router.push(newUrl, { scroll: false });
      } else {
        // Multiple selected - update additional selections (keep primary as-is)
        const newAdditional = new Set(newSelectedIds);
        if (primarySelectedId) {
          newAdditional.delete(primarySelectedId); // Primary is in URL, not in additional
        }
        setAdditionalSelectedIds(newAdditional);
      }
    },
    [router, searchParams, primarySelectedId]
  );

  // Multi-select: clear additional selections only (keep primary)
  const handleClearSelection = useCallback(() => {
    setAdditionalSelectedIds(new Set());
  }, []);

  // Multi-select: bulk delete
  const handleBulkDelete = useCallback(async () => {
    if (allSelectedIds.size === 0) return;
    if (!confirm(`Delete ${allSelectedIds.size} files? This cannot be undone.`)) return;

    setIsBulkDeleting(true);
    try {
      const fileIds = Array.from(allSelectedIds);
      for (const fileId of fileIds) {
        const file = files.find((f) => f.id === fileId);
        const isGmailFile = file?.sourceType === "gmail";
        await remove(fileId, isGmailFile);
      }
      // Clear additional selections and primary
      setAdditionalSelectedIds(new Set());
      const params = new URLSearchParams(searchParams.toString());
      params.delete("id");
      const newUrl = params.toString() ? `/files?${params.toString()}` : "/files";
      router.push(newUrl, { scroll: false });
    } finally {
      setIsBulkDeleting(false);
    }
  }, [allSelectedIds, files, remove, router, searchParams]);

  // Multi-select: bulk mark as not invoice
  const handleBulkMarkAsNotInvoice = useCallback(async () => {
    if (allSelectedIds.size === 0) return;

    setIsBulkUpdating(true);
    try {
      for (const fileId of allSelectedIds) {
        await markAsNotInvoice(fileId);
      }
    } finally {
      setIsBulkUpdating(false);
    }
  }, [allSelectedIds, markAsNotInvoice]);

  // Multi-select: bulk mark as invoice (unmark as not invoice)
  const handleBulkMarkAsInvoice = useCallback(async () => {
    if (allSelectedIds.size === 0) return;

    setIsBulkUpdating(true);
    try {
      for (const fileId of allSelectedIds) {
        await unmarkAsNotInvoice(fileId);
        // Trigger re-extraction since user says it IS an invoice
        try {
          await retryFileExtraction(ctx, fileId);
        } catch (error) {
          console.error(`Failed to re-extract file ${fileId}:`, error);
        }
      }
    } finally {
      setIsBulkUpdating(false);
    }
  }, [allSelectedIds, unmarkAsNotInvoice, ctx]);

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
        style={{ marginRight: (selectedFile || showBulkPanel) ? panelWidth : 0 }}
      >
        <div className="flex-1 overflow-hidden relative">
          <FileTable
            ref={tableRef}
            files={files}
            onSelectFile={handleSelectFile}
            selectedFileId={primarySelectedId}
            searchValue={searchValue}
            onSearchChange={handleSearchChange}
            filters={filters}
            onFiltersChange={handleFiltersChange}
            userPartners={userPartners}
            globalPartners={globalPartners}
            enableMultiSelect={true}
            selectedRowIds={allSelectedIds}
            onSelectionChange={handleSelectionChange}
          />

          {/* File viewer overlay - positioned over table area only */}
          {selectedFile && viewerOpen && (
            <FileViewerOverlay
              open={viewerOpen}
              onClose={() => {
                setViewerOpen(false);
                setHighlightText(null);
              }}
              downloadUrl={selectedFile.downloadUrl}
              fileType={selectedFile.fileType}
              fileName={selectedFile.fileName}
              highlightText={highlightText}
            />
          )}
        </div>

        {/* Upload progress bar - sticky at bottom */}
        {showUploadProgress && uploads.length > 0 && (
          <UploadProgress uploads={uploads} onDismiss={handleDismissProgress} />
        )}
      </div>

      {/* Right sidebar - Bulk actions panel or File detail panel */}
      {showBulkPanel ? (
        <div
          ref={panelRef}
          className="fixed right-0 top-14 bottom-0 z-50 bg-background border-l flex"
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
          {/* Bulk actions panel content */}
          <div className="flex-1 overflow-hidden">
            <FileBulkActionsPanel
              selectedFiles={selectedFiles}
              onDelete={handleBulkDelete}
              onMarkAsNotInvoice={handleBulkMarkAsNotInvoice}
              onMarkAsInvoice={handleBulkMarkAsInvoice}
              onClearSelection={handleClearSelection}
              isDeleting={isBulkDeleting}
              isUpdating={isBulkUpdating}
            />
          </div>
        </div>
      ) : selectedFile && (
        <div
          ref={panelRef}
          className="fixed right-0 top-14 bottom-0 z-50 bg-background border-l flex"
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
              onRestore={handleRestore}
              onMarkAsNotInvoice={handleMarkAsNotInvoice}
              onUnmarkAsNotInvoice={handleUnmarkAsNotInvoice}
              isParsing={parsingFileId === selectedFile.id}
              userPartners={userPartners}
              globalPartners={globalPartners}
              onCreatePartner={createPartner}
              onOpenViewer={() => setViewerOpen((prev) => !prev)}
              viewerOpen={viewerOpen}
              onHighlightField={(text) => {
                setHighlightText(text);
                if (!viewerOpen) {
                  setViewerOpen(true);
                }
              }}
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
