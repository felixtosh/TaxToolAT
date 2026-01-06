"use client";

import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { Search, FileText, Image, Check, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TaxFile } from "@/types/file";
import { useFiles } from "@/hooks/use-files";
import { cn } from "@/lib/utils";
import { FilePreview } from "./file-preview";
import { Separator } from "@/components/ui/separator";

interface ConnectFileDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (fileId: string) => Promise<void>;
  /** File IDs that are already connected (to show as disabled) */
  connectedFileIds?: string[];
  /** Transaction info for display */
  transactionInfo?: {
    date: Date;
    amount: number;
    currency: string;
    partner?: string;
  };
}

export function ConnectFileDialog({
  open,
  onClose,
  onSelect,
  connectedFileIds = [],
  transactionInfo,
}: ConnectFileDialogProps) {
  const [search, setSearch] = useState("");
  const [selectedFile, setSelectedFile] = useState<TaxFile | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const { files, loading } = useFiles();

  // Filter files by search
  const filteredFiles = useMemo(() => {
    if (!search) return files;
    const searchLower = search.toLowerCase();
    return files.filter(
      (f) =>
        f.fileName.toLowerCase().includes(searchLower) ||
        (f.extractedPartner?.toLowerCase() || "").includes(searchLower)
    );
  }, [files, search]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSearch("");
      setSelectedFile(null);
      setIsConnecting(false);
    }
  }, [open]);

  const handleSelect = async () => {
    if (!selectedFile) return;

    setIsConnecting(true);
    try {
      await onSelect(selectedFile.id);
      onClose();
    } catch (error) {
      console.error("Failed to connect file:", error);
    } finally {
      setIsConnecting(false);
    }
  };

  const formatAmount = (amount: number | null | undefined, currency: string | null | undefined) => {
    if (amount == null) return null;
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: currency || "EUR",
    }).format(amount / 100);
  };

  const isFileConnected = (fileId: string) => connectedFileIds.includes(fileId);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-[900px] h-[700px] p-0 gap-0 flex flex-col">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>Connect File to Transaction</DialogTitle>
          {transactionInfo && (
            <p className="text-sm text-muted-foreground">
              {format(transactionInfo.date, "MMM d, yyyy")} &middot;{" "}
              <span className={transactionInfo.amount < 0 ? "text-red-600" : "text-green-600"}>
                {new Intl.NumberFormat("de-DE", {
                  style: "currency",
                  currency: transactionInfo.currency,
                }).format(transactionInfo.amount / 100)}
              </span>
              {transactionInfo.partner && ` &middot; ${transactionInfo.partner}`}
            </p>
          )}
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Left column: File search and list */}
          <div className="w-[350px] border-r flex flex-col">
            {/* Search */}
            <div className="p-4 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search files..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* File list */}
            <ScrollArea className="flex-1">
              {loading ? (
                <div className="p-4 text-sm text-muted-foreground text-center">
                  Loading files...
                </div>
              ) : filteredFiles.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center">
                  {search ? "No files match your search" : "No files uploaded yet"}
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {filteredFiles.map((file) => {
                    const isConnected = isFileConnected(file.id);
                    const isSelected = selectedFile?.id === file.id;
                    const isPdf = file.fileType === "application/pdf";

                    return (
                      <button
                        key={file.id}
                        type="button"
                        disabled={isConnected}
                        onClick={() => setSelectedFile(file)}
                        className={cn(
                          "w-full flex items-start gap-3 p-3 rounded-md text-left transition-colors",
                          isSelected && "bg-primary/10 ring-1 ring-primary",
                          !isSelected && !isConnected && "hover:bg-muted",
                          isConnected && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        {/* Thumbnail/icon */}
                        <div className="flex-shrink-0 w-10 h-10 rounded bg-muted flex items-center justify-center overflow-hidden">
                          {file.thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={file.thumbnailUrl}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : isPdf ? (
                            <FileText className="h-5 w-5 text-red-500" />
                          ) : (
                            <Image className="h-5 w-5 text-blue-500" />
                          )}
                        </div>

                        {/* File info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{file.fileName}</p>
                            {isConnected && (
                              <Badge variant="secondary" className="text-xs">
                                <Link2 className="h-3 w-3 mr-1" />
                                Connected
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{format(file.uploadedAt.toDate(), "MMM d, yyyy")}</span>
                            {file.extractedAmount && (
                              <>
                                <span>&middot;</span>
                                <span>{formatAmount(file.extractedAmount, file.extractedCurrency)}</span>
                              </>
                            )}
                          </div>
                          {file.extractedPartner && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {file.extractedPartner}
                            </p>
                          )}
                        </div>

                        {/* Selection indicator */}
                        {isSelected && (
                          <Check className="h-4 w-4 text-primary flex-shrink-0 mt-1" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Right column: File preview */}
          <div className="flex-1 flex flex-col">
            {selectedFile ? (
              <>
                {/* Preview */}
                <div className="flex-1 overflow-hidden">
                  <FilePreview
                    downloadUrl={selectedFile.downloadUrl}
                    fileType={selectedFile.fileType}
                    fileName={selectedFile.fileName}
                  />
                </div>

                {/* Selected file info */}
                <div className="border-t p-4 bg-muted/30">
                  <h4 className="font-medium text-sm mb-2">Selected File</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Document Date:</span>{" "}
                      {selectedFile.extractedDate
                        ? format(selectedFile.extractedDate.toDate(), "MMM d, yyyy")
                        : "—"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Amount:</span>{" "}
                      {formatAmount(selectedFile.extractedAmount, selectedFile.extractedCurrency) || "—"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Partner:</span>{" "}
                      {selectedFile.extractedPartner || "—"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">VAT:</span>{" "}
                      {selectedFile.extractedVatPercent != null ? `${selectedFile.extractedVatPercent}%` : "—"}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Select a file to preview</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t p-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSelect}
            disabled={!selectedFile || isConnecting}
          >
            {isConnecting ? "Connecting..." : "Connect File"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
