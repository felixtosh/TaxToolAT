"use client";

import { SearchButton } from "@/components/ui/search-button";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Filter, Link2, X, Trash2, FileX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FileFilters } from "@/types/file";

interface FileToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  filters: FileFilters;
  onFiltersChange: (filters: FileFilters) => void;
}

export function FileToolbar({
  searchValue,
  onSearchChange,
  filters,
  onFiltersChange,
}: FileToolbarProps) {
  const hasConnectionFilter = filters.hasConnections !== undefined;
  const hasExtractionFilter = filters.extractionComplete !== undefined;
  const hasDeletedFilter = filters.includeDeleted === true;
  const hasNotInvoiceFilter = filters.isNotInvoice !== undefined;

  const clearFilters = () => {
    onFiltersChange({});
  };

  const hasActiveFilters = hasConnectionFilter || hasExtractionFilter || hasDeletedFilter || hasNotInvoiceFilter;

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b flex-wrap">
      <SearchButton
        value={searchValue}
        onSearch={onSearchChange}
        placeholder="Search files..."
      />

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9">
            <Link2 className="mr-2 h-4 w-4" />
            Connections
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[200px] p-2">
          <div className="space-y-1">
            <Button
              variant={filters.hasConnections === true ? "secondary" : "ghost"}
              size="sm"
              className="w-full justify-start"
              onClick={() =>
                onFiltersChange({
                  ...filters,
                  hasConnections: filters.hasConnections === true ? undefined : true,
                })
              }
            >
              Has connections
            </Button>
            <Button
              variant={filters.hasConnections === false ? "secondary" : "ghost"}
              size="sm"
              className="w-full justify-start"
              onClick={() =>
                onFiltersChange({
                  ...filters,
                  hasConnections: filters.hasConnections === false ? undefined : false,
                })
              }
            >
              No connections
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9">
            <Filter className="mr-2 h-4 w-4" />
            Status
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[220px] p-2">
          <div className="space-y-1">
            <Button
              variant={filters.extractionComplete === true ? "secondary" : "ghost"}
              size="sm"
              className="w-full justify-start"
              onClick={() =>
                onFiltersChange({
                  ...filters,
                  extractionComplete: filters.extractionComplete === true ? undefined : true,
                })
              }
            >
              Extraction complete
            </Button>
            <Button
              variant={filters.extractionComplete === false ? "secondary" : "ghost"}
              size="sm"
              className="w-full justify-start"
              onClick={() =>
                onFiltersChange({
                  ...filters,
                  extractionComplete: filters.extractionComplete === false ? undefined : false,
                })
              }
            >
              Pending extraction
            </Button>
            <div className="h-px bg-border my-1" />
            <Button
              variant={filters.isNotInvoice === true ? "secondary" : "ghost"}
              size="sm"
              className="w-full justify-start"
              onClick={() =>
                onFiltersChange({
                  ...filters,
                  isNotInvoice: filters.isNotInvoice === true ? undefined : true,
                })
              }
            >
              <FileX className="mr-2 h-4 w-4" />
              Not invoices
            </Button>
            <div className="h-px bg-border my-1" />
            <Button
              variant={filters.includeDeleted === true ? "secondary" : "ghost"}
              size="sm"
              className="w-full justify-start text-muted-foreground"
              onClick={() =>
                onFiltersChange({
                  ...filters,
                  includeDeleted: filters.includeDeleted === true ? undefined : true,
                })
              }
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Include deleted
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Active filter badges */}
      {hasActiveFilters && (
        <>
          <div className="h-4 w-px bg-border mx-1" />
          {filters.hasConnections === true && (
            <Badge variant="secondary" className="gap-1">
              Has connections
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => onFiltersChange({ ...filters, hasConnections: undefined })}
              />
            </Badge>
          )}
          {filters.hasConnections === false && (
            <Badge variant="secondary" className="gap-1">
              No connections
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => onFiltersChange({ ...filters, hasConnections: undefined })}
              />
            </Badge>
          )}
          {filters.extractionComplete === true && (
            <Badge variant="secondary" className="gap-1">
              Extracted
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => onFiltersChange({ ...filters, extractionComplete: undefined })}
              />
            </Badge>
          )}
          {filters.extractionComplete === false && (
            <Badge variant="secondary" className="gap-1">
              Pending
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => onFiltersChange({ ...filters, extractionComplete: undefined })}
              />
            </Badge>
          )}
          {filters.isNotInvoice === true && (
            <Badge variant="secondary" className="gap-1">
              Not invoices
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => onFiltersChange({ ...filters, isNotInvoice: undefined })}
              />
            </Badge>
          )}
          {filters.includeDeleted === true && (
            <Badge variant="outline" className="gap-1 text-muted-foreground">
              <Trash2 className="h-3 w-3" />
              Showing deleted
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => onFiltersChange({ ...filters, includeDeleted: undefined })}
              />
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear all
          </Button>
        </>
      )}
    </div>
  );
}
