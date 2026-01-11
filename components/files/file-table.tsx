"use client";

import { useMemo, forwardRef } from "react";
import { Loader2, Mail } from "lucide-react";
import { FilesDataTable, FilesDataTableHandle } from "./files-data-table";
import { FileToolbar } from "./file-toolbar";
import { getFileColumns } from "./file-columns";
import { TaxFile, FileFilters } from "@/types/file";
import { UserPartner, GlobalPartner } from "@/types/partner";
import { useGmailSyncStatus } from "@/hooks/use-gmail-sync-status";

interface FileTableProps {
  files: TaxFile[];
  onSelectFile: (file: TaxFile) => void;
  selectedFileId?: string | null;
  searchValue: string;
  onSearchChange: (value: string) => void;
  filters: FileFilters;
  onFiltersChange: (filters: FileFilters) => void;
  userPartners: UserPartner[];
  globalPartners: GlobalPartner[];
  // Multi-select props
  enableMultiSelect?: boolean;
  selectedRowIds?: Set<string>;
  onSelectionChange?: (selectedIds: Set<string>) => void;
}

export const FileTable = forwardRef<FilesDataTableHandle, FileTableProps>(
  function FileTable(
    {
      files,
      onSelectFile,
      selectedFileId,
      searchValue,
      onSearchChange,
      filters,
      onFiltersChange,
      userPartners,
      globalPartners,
      enableMultiSelect,
      selectedRowIds,
      onSelectionChange,
    },
    ref
  ) {
    const columns = useMemo(
      () => getFileColumns(userPartners, globalPartners),
      [userPartners, globalPartners]
    );

    const syncStatus = useGmailSyncStatus();

    return (
      <div className="h-full flex flex-col overflow-hidden bg-card">
        <FileToolbar
          searchValue={searchValue}
          onSearchChange={onSearchChange}
          filters={filters}
          onFiltersChange={onFiltersChange}
        />
        {/* Gmail sync progress indicator */}
        {syncStatus.isActive && (
          <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-950/30 border-b text-sm text-blue-700 dark:text-blue-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            <Mail className="h-4 w-4" />
            <span>
              Syncing from Gmail
              {syncStatus.filesCreated !== undefined && syncStatus.filesCreated > 0 && (
                <span className="text-muted-foreground ml-1">
                  ({syncStatus.filesCreated} files imported)
                </span>
              )}
            </span>
          </div>
        )}
        <FilesDataTable
          ref={ref}
          columns={columns}
          data={files}
          onRowClick={onSelectFile}
          selectedRowId={selectedFileId}
          enableMultiSelect={enableMultiSelect}
          selectedRowIds={selectedRowIds}
          onSelectionChange={onSelectionChange}
        />
      </div>
    );
  }
);
