"use client";

import { useMemo, forwardRef } from "react";
import { FilesDataTable, FilesDataTableHandle } from "./files-data-table";
import { FileToolbar } from "./file-toolbar";
import { getFileColumns } from "./file-columns";
import { TaxFile, FileFilters } from "@/types/file";
import { UserPartner, GlobalPartner } from "@/types/partner";

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
    },
    ref
  ) {
    const columns = useMemo(
      () => getFileColumns(userPartners, globalPartners),
      [userPartners, globalPartners]
    );

    return (
      <div className="h-full flex flex-col overflow-hidden bg-card">
        <FileToolbar
          searchValue={searchValue}
          onSearchChange={onSearchChange}
          filters={filters}
          onFiltersChange={onFiltersChange}
        />
        <FilesDataTable
          ref={ref}
          columns={columns}
          data={files}
          onRowClick={onSelectFile}
          selectedRowId={selectedFileId}
        />
      </div>
    );
  }
);
