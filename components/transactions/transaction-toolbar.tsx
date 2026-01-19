"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  CalendarDays,
  FileText,
  ArrowUpDown,
  X,
  CalendarIcon,
  Check,
} from "lucide-react";
import { SearchButton } from "@/components/ui/search-button";
import { SearchInput } from "@/components/ui/search-input";
import { TransactionFilters } from "@/types/transaction";
import { cn } from "@/lib/utils";
import { UserPartner } from "@/types/partner";

interface TransactionToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  filters: TransactionFilters;
  onFiltersChange: (filters: TransactionFilters) => void;
  importFileName?: string;
  userPartners?: UserPartner[];
}

export function TransactionToolbar({
  searchValue,
  onSearchChange,
  filters,
  onFiltersChange,
  importFileName,
  userPartners = [],
}: TransactionToolbarProps) {
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const [filePopoverOpen, setFilePopoverOpen] = useState(false);
  const [typePopoverOpen, setTypePopoverOpen] = useState(false);
  const [partnerPopoverOpen, setPartnerPopoverOpen] = useState(false);
  const [partnerSearch, setPartnerSearch] = useState("");
  const [showFromCalendar, setShowFromCalendar] = useState(false);
  const [showToCalendar, setShowToCalendar] = useState(false);

  const hasDateFilter = filters.dateFrom || filters.dateTo;
  const hasFileFilter = filters.hasFile !== undefined;
  const hasAmountFilter = filters.amountType && filters.amountType !== "all";
  const selectedPartnerIds = filters.partnerIds || [];
  const hasPartnerFilter = selectedPartnerIds.length > 0;

  const handleDatePresetClick = (preset: string) => {
    const now = new Date();
    let dateFrom: Date | undefined;
    let dateTo: Date | undefined;

    switch (preset) {
      case "30d":
        dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        dateTo = now;
        break;
      case "3m":
        dateFrom = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
        dateTo = now;
        break;
      case "thisYear":
        dateFrom = new Date(now.getFullYear(), 0, 1);
        dateTo = now;
        break;
      case "lastYear":
        dateFrom = new Date(now.getFullYear() - 1, 0, 1);
        dateTo = new Date(now.getFullYear() - 1, 11, 31);
        break;
      default:
        dateFrom = undefined;
        dateTo = undefined;
    }

    onFiltersChange({ ...filters, dateFrom, dateTo });
    setDatePopoverOpen(false);
  };

  const clearImportFilter = () => {
    onFiltersChange({ ...filters, importId: undefined });
  };

  const clearDateFilter = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFiltersChange({ ...filters, dateFrom: undefined, dateTo: undefined });
  };

  const clearFileFilter = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFiltersChange({ ...filters, hasFile: undefined });
  };

  const clearAmountFilter = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFiltersChange({ ...filters, amountType: undefined });
  };

  const clearPartnerFilter = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFiltersChange({ ...filters, partnerIds: undefined });
  };

  const getDateLabel = () => {
    if (!hasDateFilter) return "Date";
    if (filters.dateFrom && filters.dateTo) {
      return `${format(filters.dateFrom, "MMM d")} - ${format(filters.dateTo, "MMM d")}`;
    }
    if (filters.dateFrom) return `From ${format(filters.dateFrom, "MMM d")}`;
    if (filters.dateTo) return `Until ${format(filters.dateTo, "MMM d")}`;
    return "Date";
  };

  const getFileLabel = () => {
    if (filters.hasFile === true) return "Has file";
    if (filters.hasFile === false) return "No file";
    return "File";
  };

  const getAmountLabel = () => {
    if (filters.amountType === "income") return "Income";
    if (filters.amountType === "expense") return "Expenses";
    return "Type";
  };

  const partnerNameMap = new Map(userPartners.map((partner) => [partner.id, partner.name]));
  const selectedPartnerNames = selectedPartnerIds
    .map((id) => partnerNameMap.get(id))
    .filter(Boolean) as string[];
  const partnerLabel = hasPartnerFilter
    ? selectedPartnerNames.length === 1
      ? selectedPartnerNames[0]
      : `Partner (${selectedPartnerIds.length})`
    : "Partner";

  const filteredPartners = userPartners.filter((partner) => {
    if (!partnerSearch.trim()) return true;
    const search = partnerSearch.toLowerCase();
    return (
      partner.name.toLowerCase().includes(search) ||
      partner.aliases?.some((alias) => alias.toLowerCase().includes(search)) ||
      partner.vatId?.toLowerCase().includes(search) ||
      partner.website?.toLowerCase().includes(search)
    );
  });

  const togglePartner = (partnerId: string) => {
    const next = new Set(selectedPartnerIds);
    if (next.has(partnerId)) {
      next.delete(partnerId);
    } else {
      next.add(partnerId);
    }
    const nextIds = Array.from(next);
    onFiltersChange({ ...filters, partnerIds: nextIds.length > 0 ? nextIds : undefined });
  };

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b bg-background flex-wrap">
      {/* Search button */}
      <SearchButton
        value={searchValue}
        onSearch={onSearchChange}
        placeholder="Search transactions..."
      />

      {/* Date filter */}
      <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={hasDateFilter ? "secondary" : "outline"}
            size="sm"
            className="h-9 gap-2"
          >
            <CalendarDays className="h-4 w-4" />
            <span>{getDateLabel()}</span>
            {hasDateFilter && (
              <span
                role="button"
                tabIndex={0}
                onClick={clearDateFilter}
                onKeyDown={(e) => e.key === "Enter" && clearDateFilter(e as unknown as React.MouseEvent)}
                className="ml-1 hover:bg-muted rounded p-0.5 -mr-1 cursor-pointer"
              >
                <X className="h-3 w-3" />
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-4" align="start">
          <div className="space-y-4">
            {/* From/To date pickers on top */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">From</label>
                <Popover open={showFromCalendar} onOpenChange={setShowFromCalendar}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal h-9",
                        !filters.dateFrom && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {filters.dateFrom ? format(filters.dateFrom, "PP") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={filters.dateFrom}
                      onSelect={(date) => {
                        onFiltersChange({ ...filters, dateFrom: date });
                        setShowFromCalendar(false);
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">To</label>
                <Popover open={showToCalendar} onOpenChange={setShowToCalendar}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal h-9",
                        !filters.dateTo && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {filters.dateTo ? format(filters.dateTo, "PP") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={filters.dateTo}
                      onSelect={(date) => {
                        onFiltersChange({ ...filters, dateTo: date });
                        setShowToCalendar(false);
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Separator */}
            <div className="border-t" />

            {/* Quick presets as buttons */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Quick select</label>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => handleDatePresetClick("all")}
                >
                  All time
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => handleDatePresetClick("30d")}
                >
                  30 days
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => handleDatePresetClick("3m")}
                >
                  3 months
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => handleDatePresetClick("thisYear")}
                >
                  This year
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => handleDatePresetClick("lastYear")}
                >
                  Last year
                </Button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* File filter */}
      <Popover open={filePopoverOpen} onOpenChange={setFilePopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={hasFileFilter ? "secondary" : "outline"}
            size="sm"
            className="h-9 gap-2"
          >
            <FileText className="h-4 w-4" />
            <span>{getFileLabel()}</span>
            {hasFileFilter && (
              <span
                role="button"
                tabIndex={0}
                onClick={clearFileFilter}
                onKeyDown={(e) => e.key === "Enter" && clearFileFilter(e as unknown as React.MouseEvent)}
                className="ml-1 hover:bg-muted rounded p-0.5 -mr-1 cursor-pointer"
              >
                <X className="h-3 w-3" />
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <div className="flex flex-col gap-1">
            <Button
              variant={filters.hasFile === undefined ? "secondary" : "ghost"}
              size="sm"
              className="justify-start h-8"
              onClick={() => {
                onFiltersChange({ ...filters, hasFile: undefined });
                setFilePopoverOpen(false);
              }}
            >
              All
            </Button>
            <Button
              variant={filters.hasFile === true ? "secondary" : "ghost"}
              size="sm"
              className="justify-start h-8"
              onClick={() => {
                onFiltersChange({ ...filters, hasFile: true });
                setFilePopoverOpen(false);
              }}
            >
              Has file
            </Button>
            <Button
              variant={filters.hasFile === false ? "secondary" : "ghost"}
              size="sm"
              className="justify-start h-8"
              onClick={() => {
                onFiltersChange({ ...filters, hasFile: false });
                setFilePopoverOpen(false);
              }}
            >
              No file
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Amount type filter */}
      <Popover open={typePopoverOpen} onOpenChange={setTypePopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={hasAmountFilter ? "secondary" : "outline"}
            size="sm"
            className="h-9 gap-2"
          >
            <ArrowUpDown className="h-4 w-4" />
            <span>{getAmountLabel()}</span>
            {hasAmountFilter && (
              <span
                role="button"
                tabIndex={0}
                onClick={clearAmountFilter}
                onKeyDown={(e) => e.key === "Enter" && clearAmountFilter(e as unknown as React.MouseEvent)}
                className="ml-1 hover:bg-muted rounded p-0.5 -mr-1 cursor-pointer"
              >
                <X className="h-3 w-3" />
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <div className="flex flex-col gap-1">
            <Button
              variant={!filters.amountType || filters.amountType === "all" ? "secondary" : "ghost"}
              size="sm"
              className="justify-start h-8"
              onClick={() => {
                onFiltersChange({ ...filters, amountType: undefined });
                setTypePopoverOpen(false);
              }}
            >
              All
            </Button>
            <Button
              variant={filters.amountType === "income" ? "secondary" : "ghost"}
              size="sm"
              className="justify-start h-8"
              onClick={() => {
                onFiltersChange({ ...filters, amountType: "income" });
                setTypePopoverOpen(false);
              }}
            >
              Income
            </Button>
            <Button
              variant={filters.amountType === "expense" ? "secondary" : "ghost"}
              size="sm"
              className="justify-start h-8"
              onClick={() => {
                onFiltersChange({ ...filters, amountType: "expense" });
                setTypePopoverOpen(false);
              }}
            >
              Expenses
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Partner filter */}
      <Popover open={partnerPopoverOpen} onOpenChange={setPartnerPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={hasPartnerFilter ? "secondary" : "outline"}
            size="sm"
            className="h-9 gap-2"
          >
            <span>{partnerLabel}</span>
            {hasPartnerFilter && (
              <span
                role="button"
                tabIndex={0}
                onClick={clearPartnerFilter}
                onKeyDown={(e) => e.key === "Enter" && clearPartnerFilter(e as unknown as React.MouseEvent)}
                className="ml-1 hover:bg-muted rounded p-0.5 -mr-1 cursor-pointer"
              >
                <X className="h-3 w-3" />
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3" align="start">
          <div className="space-y-3">
            <SearchInput
              placeholder="Search partners..."
              value={partnerSearch}
              onChange={setPartnerSearch}
            />
            <div className="max-h-56 overflow-y-auto space-y-1">
              {filteredPartners.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 text-center">No partners found</p>
              ) : (
                filteredPartners.map((partner) => {
                  const checked = selectedPartnerIds.includes(partner.id);
                  return (
                    <button
                      key={partner.id}
                      type="button"
                      onClick={() => togglePartner(partner.id)}
                      className={cn(
                        "w-full text-left flex items-center gap-2 rounded px-2 py-1.5 text-sm",
                        checked ? "bg-muted" : "hover:bg-muted/50"
                      )}
                    >
                      <span
                        className={cn(
                          "h-4 w-4 rounded border flex items-center justify-center",
                          checked ? "border-primary text-primary" : "border-muted-foreground/40 text-transparent"
                        )}
                      >
                        <Check className="h-3 w-3" />
                      </span>
                      <span className="truncate">{partner.name}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Import filter badge (if active) */}
      {filters.importId && (
        <Badge variant="secondary" className="gap-1 h-8">
          Import: {importFileName || "Selected"}
          <span
            role="button"
            tabIndex={0}
            onClick={clearImportFilter}
            onKeyDown={(e) => e.key === "Enter" && clearImportFilter()}
            className="ml-1 hover:bg-muted rounded cursor-pointer"
          >
            <X className="h-3 w-3" />
          </span>
        </Badge>
      )}
    </div>
  );
}
