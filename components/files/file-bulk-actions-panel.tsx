"use client";

import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TaxFile } from "@/types/file";

interface FileBulkActionsPanelProps {
  selectedFiles: TaxFile[];
  onDelete: () => void;
  onMarkAsNotInvoice: () => void;
  onMarkAsInvoice: () => void;
  onClearSelection: () => void;
  isDeleting?: boolean;
  isUpdating?: boolean;
}

export function FileBulkActionsPanel({
  selectedFiles,
  onDelete,
  onMarkAsNotInvoice,
  onMarkAsInvoice,
  onClearSelection,
  isDeleting = false,
  isUpdating = false,
}: FileBulkActionsPanelProps) {
  // Determine current invoice status for dropdown value
  const allNotInvoice = selectedFiles.every((f) => f.isNotInvoice === true);
  const allInvoice = selectedFiles.every((f) => f.isNotInvoice !== true);

  // Current value for dropdown: "invoice", "not-invoice", or undefined (mixed)
  const currentStatus = allInvoice ? "invoice" : allNotInvoice ? "not-invoice" : undefined;

  // Handle dropdown change
  const handleStatusChange = (value: string) => {
    if (value === "invoice") {
      onMarkAsInvoice();
    } else if (value === "not-invoice") {
      onMarkAsNotInvoice();
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between py-3 border-b px-4 shrink-0">
        <h2 className="text-lg font-semibold">
          {selectedFiles.length} files selected
        </h2>
        <Button variant="ghost" size="icon" onClick={onClearSelection}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Bulk Actions */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Actions</h3>

            {/* Invoice status dropdown */}
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">Type</label>
              <Select
                value={currentStatus}
                onValueChange={handleStatusChange}
                disabled={isUpdating}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={isUpdating ? "Updating..." : "Mixed status..."} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="invoice">Invoice</SelectItem>
                  <SelectItem value="not-invoice">Not Invoice</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator className="my-3" />

            {/* Delete */}
            <Button
              variant="outline"
              className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={onDelete}
              disabled={isDeleting}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {isDeleting ? "Deleting..." : "Delete Selected"}
            </Button>
          </div>

          <Separator />

          {/* List of selected files */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              Selected files
            </h3>
            <ul className="space-y-1 text-sm">
              {selectedFiles.slice(0, 15).map((file) => (
                <li
                  key={file.id}
                  className="truncate text-muted-foreground"
                  title={file.fileName}
                >
                  {file.fileName}
                </li>
              ))}
              {selectedFiles.length > 15 && (
                <li className="text-muted-foreground italic">
                  ...and {selectedFiles.length - 15} more
                </li>
              )}
            </ul>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
