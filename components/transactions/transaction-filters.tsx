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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Filter, X, Calendar as CalendarIcon } from "lucide-react";
import { TransactionFilters } from "@/types/transaction";
import { countActiveFilters } from "@/lib/filters/url-params";

interface TransactionFiltersPopoverProps {
  filters: TransactionFilters;
  onFiltersChange: (filters: TransactionFilters) => void;
  importFileName?: string;
}

type DatePreset = "all" | "30d" | "3m" | "thisYear" | "lastYear" | "custom";

export function TransactionFiltersPopover({
  filters,
  onFiltersChange,
  importFileName,
}: TransactionFiltersPopoverProps) {
  const [open, setOpen] = useState(false);
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [showFromCalendar, setShowFromCalendar] = useState(false);
  const [showToCalendar, setShowToCalendar] = useState(false);

  const activeFilterCount = countActiveFilters(filters);

  const handleHasFileChange = (value: string) => {
    onFiltersChange({
      ...filters,
      hasFile: value === "yes" ? true : value === "no" ? false : undefined,
    });
  };

  const handleAmountTypeChange = (value: string) => {
    onFiltersChange({
      ...filters,
      amountType:
        value === "all" ? undefined : (value as "income" | "expense"),
    });
  };

  const handleDatePresetChange = (preset: DatePreset) => {
    setDatePreset(preset);
    const now = new Date();

    if (preset === "custom") {
      return;
    }

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
  };

  const clearImportFilter = () => {
    onFiltersChange({ ...filters, importId: undefined });
  };

  const clearAllFilters = () => {
    onFiltersChange({
      search: filters.search,
    });
    setDatePreset("all");
  };

  return (
    <div className="flex items-center gap-2">
      {/* Active filter badges */}
      {filters.importId && (
        <Badge variant="secondary" className="gap-1 h-8">
          Import: {importFileName || "Selected"}
          <button
            onClick={clearImportFilter}
            className="ml-1 hover:bg-muted rounded"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      )}

      {filters.hasFile !== undefined && (
        <Badge variant="secondary" className="gap-1 h-8">
          {filters.hasFile ? "Has file" : "No file"}
          <button
            onClick={() =>
              onFiltersChange({ ...filters, hasFile: undefined })
            }
            className="ml-1 hover:bg-muted rounded"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      )}

      {(filters.dateFrom || filters.dateTo) && (
        <Badge variant="secondary" className="gap-1 h-8">
          {filters.dateFrom && format(filters.dateFrom, "MMM d")}
          {filters.dateFrom && filters.dateTo && " - "}
          {filters.dateTo && format(filters.dateTo, "MMM d, yyyy")}
          <button
            onClick={() =>
              onFiltersChange({
                ...filters,
                dateFrom: undefined,
                dateTo: undefined,
              })
            }
            className="ml-1 hover:bg-muted rounded"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      )}

      {filters.amountType && filters.amountType !== "all" && (
        <Badge variant="secondary" className="gap-1 h-8">
          {filters.amountType === "income" ? "Income only" : "Expenses only"}
          <button
            onClick={() =>
              onFiltersChange({ ...filters, amountType: undefined })
            }
            className="ml-1 hover:bg-muted rounded"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      )}

      {/* Filter popover */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="icon" className="relative h-10 w-10">
            <Filter className="h-4 w-4" />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[10px] text-primary-foreground flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="end">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Filters</h4>
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearAllFilters}>
                  Clear all
                </Button>
              )}
            </div>

            <Separator />

            {/* File filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">File attached</label>
              <Select
                value={
                  filters.hasFile === true
                    ? "yes"
                    : filters.hasFile === false
                      ? "no"
                      : "all"
                }
                onValueChange={handleHasFileChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="yes">Has file</SelectItem>
                  <SelectItem value="no">No file</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Amount type filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Amount type</label>
              <Select
                value={filters.amountType || "all"}
                onValueChange={handleAmountTypeChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="income">Income (positive)</SelectItem>
                  <SelectItem value="expense">Expense (negative)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date range filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Date range</label>
              <Select
                value={datePreset}
                onValueChange={(v) => handleDatePresetChange(v as DatePreset)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All time</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="3m">Last 3 months</SelectItem>
                  <SelectItem value="thisYear">This year</SelectItem>
                  <SelectItem value="lastYear">Last year</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>

              {datePreset === "custom" && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <Popover
                    open={showFromCalendar}
                    onOpenChange={setShowFromCalendar}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="justify-start text-left font-normal h-9"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        <span className="truncate">
                          {filters.dateFrom
                            ? format(filters.dateFrom, "PP")
                            : "From"}
                        </span>
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
                      />
                    </PopoverContent>
                  </Popover>

                  <Popover
                    open={showToCalendar}
                    onOpenChange={setShowToCalendar}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="justify-start text-left font-normal h-9"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        <span className="truncate">
                          {filters.dateTo ? format(filters.dateTo, "PP") : "To"}
                        </span>
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
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
