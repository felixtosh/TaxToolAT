"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DATE_PARSERS } from "@/lib/import/date-parsers";
import { AMOUNT_PARSERS } from "@/lib/import/amount-parsers";

interface FormatSelectorProps {
  dateFormat: string;
  amountFormat: string;
  onDateFormatChange: (format: string) => void;
  onAmountFormatChange: (format: string) => void;
}

export function FormatSelector({
  dateFormat,
  amountFormat,
  onDateFormatChange,
  onAmountFormatChange,
}: FormatSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="text-sm font-medium mb-1.5 block">Date Format</label>
        <Select value={dateFormat} onValueChange={onDateFormatChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select format" />
          </SelectTrigger>
          <SelectContent>
            {DATE_PARSERS.map((parser) => (
              <SelectItem key={parser.id} value={parser.id}>
                {parser.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-1">
          How dates appear in your CSV
        </p>
      </div>

      <div>
        <label className="text-sm font-medium mb-1.5 block">Amount Format</label>
        <Select value={amountFormat} onValueChange={onAmountFormatChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select format" />
          </SelectTrigger>
          <SelectContent>
            {AMOUNT_PARSERS.map((parser) => (
              <SelectItem key={parser.id} value={parser.id}>
                {parser.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-1">
          How amounts appear in your CSV
        </p>
      </div>
    </div>
  );
}
