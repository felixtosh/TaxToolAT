"use client";

import { useState } from "react";
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  Download,
  ExternalLink,
  FileText,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Toggle } from "@/components/ui/toggle";
import { ExtractedFieldLocation } from "@/types/file";
import { FileOverlayViewer, OverlayLegend } from "./file-overlay-viewer";
import { cn } from "@/lib/utils";

interface FileViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  downloadUrl: string;
  fileType: string;
  fileName: string;
  extractedFields?: ExtractedFieldLocation[];
}

export function FileViewerDialog({
  open,
  onOpenChange,
  downloadUrl,
  fileType,
  fileName,
  extractedFields,
}: FileViewerDialogProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [showOverlays, setShowOverlays] = useState(true);

  const isPdf = fileType === "application/pdf";
  const isImage = fileType.startsWith("image/");

  const hasOverlays = extractedFields && extractedFields.some((f) => f.boundingBox);

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 3));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));
  const handleRotate = () => setRotation((r) => (r + 90) % 360);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] w-[90vw] h-[90vh] p-0 flex flex-col">
        {/* Header with controls */}
        <DialogHeader className="px-4 py-3 border-b flex-row items-center justify-between space-y-0">
          <DialogTitle className="text-base font-medium truncate max-w-[300px]">
            {fileName}
          </DialogTitle>
          <div className="flex items-center gap-1">
            {/* Overlay toggle (images only) */}
            {isImage && hasOverlays && (
              <>
                <Toggle
                  pressed={showOverlays}
                  onPressedChange={setShowOverlays}
                  size="sm"
                  className="h-8 px-2 gap-1"
                  aria-label="Toggle field overlays"
                >
                  <Layers className="h-4 w-4" />
                  <span className="text-xs">Fields</span>
                </Toggle>
                <div className="w-px h-6 bg-border mx-2" />
              </>
            )}

            {/* Zoom controls */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleZoomOut}
              className="h-8 w-8"
              disabled={isPdf}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground w-12 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleZoomIn}
              className="h-8 w-8"
              disabled={isPdf}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>

            {/* Rotate (images only) */}
            {isImage && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRotate}
                className="h-8 w-8"
              >
                <RotateCw className="h-4 w-4" />
              </Button>
            )}

            <div className="w-px h-6 bg-border mx-2" />

            {/* Download */}
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
              <a href={downloadUrl} download={fileName}>
                <Download className="h-4 w-4" />
              </a>
            </Button>

            {/* Open in new tab */}
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
              <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </DialogHeader>

        {/* Legend (when overlays are shown) */}
        {isImage && hasOverlays && showOverlays && (
          <div className="px-4 py-2 border-b bg-muted/30">
            <OverlayLegend fields={extractedFields} />
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 overflow-auto bg-muted/30 flex items-center justify-center p-4">
          {isPdf ? (
            <iframe
              src={downloadUrl}
              className="w-full h-full border-0 rounded-lg bg-white"
              title={fileName}
            />
          ) : isImage ? (
            <div
              className="transition-transform duration-200"
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
              }}
            >
              {hasOverlays ? (
                <FileOverlayViewer
                  imageUrl={downloadUrl}
                  extractedFields={extractedFields}
                  showOverlays={showOverlays}
                  className="max-w-full max-h-[calc(90vh-160px)] rounded-lg shadow-lg overflow-hidden"
                />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={downloadUrl}
                  alt={fileName}
                  className="max-w-full max-h-[calc(90vh-120px)] object-contain rounded-lg shadow-lg"
                />
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 text-muted-foreground">
              <FileText className="h-16 w-16" />
              <p className="text-sm">Preview not available</p>
              <Button variant="outline" asChild>
                <a href={downloadUrl} download={fileName}>
                  Download file
                </a>
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
