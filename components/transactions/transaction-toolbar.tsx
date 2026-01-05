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
  Receipt,
  ArrowUpDown,
  X,
  CalendarIcon,
} from "lucide-react";
import { SearchButton } from "@/components/ui/search-button";
import { TransactionFilters } from "@/types/transaction";
import { cn } from "@/lib/utils";

interface TransactionToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  filters: TransactionFilters;
  onFiltersChange: (filters: TransactionFilters) => void;
  importFileName?: string;
}

export function TransactionToolbar({
  searchValue,
  onSearchChange,
  filters,
  onFiltersChange,
  importFileName,
}: TransactionToolbarProps) {
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const [receiptPopoverOpen, setReceiptPopoverOpen] = useState(false);
  const [typePopoverOpen, setTypePopoverOpen] = useState(false);
  const [showFromCalendar, setShowFromCalendar] = useState(false);
  const [showToCalendar, setShowToCalendar] = useState(false);

  const hasDateFilter = filters.dateFrom || filters.dateTo;
  const hasReceiptFilter = filters.hasReceipt !== undefined;
  const hasAmountFilter = filters.amountType && filters.amountType !== "all";

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

  const clearReceiptFilter = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFiltersChange({ ...filters, hasReceipt: undefined });
  };

  const clearAmountFilter = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFiltersChange({ ...filters, amountType: undefined });
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

  const getReceiptLabel = () => {
    if (filters.hasReceipt === true) return "Has receipt";
    if (filters.hasReceipt === false) return "No receipt";
    return "Receipt";
  };

  const getAmountLabel = () => {
    if (filters.amountType === "income") return "Income";
    if (filters.amountType === "expense") return "Expenses";
    return "Type";
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

      {/* Receipt filter */}
      <Popover open={receiptPopoverOpen} onOpenChange={setReceiptPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={hasReceiptFilter ? "secondary" : "outline"}
            size="sm"
            className="h-9 gap-2"
          >
            <Receipt className="h-4 w-4" />
            <span>{getReceiptLabel()}</span>
            {hasReceiptFilter && (
              <span
                role="button"
                tabIndex={0}
                onClick={clearReceiptFilter}
                onKeyDown={(e) => e.key === "Enter" && clearReceiptFilter(e as unknown as React.MouseEvent)}
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
              variant={filters.hasReceipt === undefined ? "secondary" : "ghost"}
              size="sm"
              className="justify-start h-8"
              onClick={() => {
                onFiltersChange({ ...filters, hasReceipt: undefined });
                setReceiptPopoverOpen(false);
              }}
            >
              All
            </Button>
            <Button
              variant={filters.hasReceipt === true ? "secondary" : "ghost"}
              size="sm"
              className="justify-start h-8"
              onClick={() => {
                onFiltersChange({ ...filters, hasReceipt: true });
                setReceiptPopoverOpen(false);
              }}
            >
              Has receipt
            </Button>
            <Button
              variant={filters.hasReceipt === false ? "secondary" : "ghost"}
              size="sm"
              className="justify-start h-8"
              onClick={() => {
                onFiltersChange({ ...filters, hasReceipt: false });
                setReceiptPopoverOpen(false);
              }}
            >
              No receipt
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
