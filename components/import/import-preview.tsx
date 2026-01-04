"use client";

import { FieldMapping } from "@/types/import";
import { TRANSACTION_FIELDS } from "@/lib/import/field-definitions";
import { parseDate } from "@/lib/import/date-parsers";
import {
  parseAmount,
  getAmountParserConfig,
  formatAmountForDisplay,
} from "@/lib/import/amount-parsers";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface ImportPreviewProps {
  rows: Record<string, string>[];
  mappings: FieldMapping[];
  totalRows: number;
}

export function ImportPreview({
  rows,
  mappings,
  totalRows,
}: ImportPreviewProps) {
  // Get mapped fields for display with their formats
  const mappedFields = mappings
    .filter((m) => m.targetField)
    .map((m) => ({
      csvColumn: m.csvColumn,
      targetField: m.targetField!,
      format: m.format,
      label:
        TRANSACTION_FIELDS.find((f) => f.key === m.targetField)?.label ||
        m.targetField!,
    }));

  // Transform rows for preview
  const previewRows = rows.slice(0, 50).map((row, index) => {
    const transformed: Record<string, { raw: string; parsed: string | number }> = {};

    for (const field of mappedFields) {
      const rawValue = row[field.csvColumn] || "";
      let parsedValue: string | number = rawValue;

      if (field.targetField === "date") {
        const dateFormat = field.format || "de";
        const date = parseDate(rawValue, dateFormat);
        parsedValue = date ? format(date, "MMM d, yyyy") : "Invalid";
      } else if (field.targetField === "amount") {
        const amountFormat = field.format || "de";
        const amountConfig = getAmountParserConfig(amountFormat);
        if (amountConfig) {
          const cents = parseAmount(rawValue, amountConfig);
          parsedValue = cents !== null ? formatAmountForDisplay(cents) : "Invalid";
        }
      }

      transformed[field.targetField] = { raw: rawValue, parsed: parsedValue };
    }

    return { index: index + 1, data: transformed };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {Math.min(50, rows.length)} of {totalRows} rows
        </p>
        <Badge variant="outline">
          {mappedFields.length} columns mapped
        </Badge>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-12">#</TableHead>
                {mappedFields.map((field) => (
                  <TableHead key={field.targetField} className="min-w-[150px]">
                    <div>
                      <span className="font-semibold">{field.label}</span>
                      <span className="block text-xs font-normal text-muted-foreground">
                        {field.csvColumn}
                      </span>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewRows.map((row) => (
                <TableRow key={row.index}>
                  <TableCell className="text-muted-foreground">
                    {row.index}
                  </TableCell>
                  {mappedFields.map((field) => {
                    const cell = row.data[field.targetField];
                    const isInvalid =
                      cell?.parsed === "Invalid" ||
                      (field.targetField === "amount" &&
                        typeof cell?.parsed === "string" &&
                        cell.parsed.includes("Invalid"));

                    return (
                      <TableCell
                        key={field.targetField}
                        className={cn(
                          isInvalid && "text-destructive bg-destructive/10"
                        )}
                      >
                        <div>
                          <span className="font-medium">
                            {cell?.parsed ?? "-"}
                          </span>
                          {cell?.raw !== cell?.parsed && (
                            <span className="block text-xs text-muted-foreground">
                              {cell?.raw}
                            </span>
                          )}
                        </div>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {rows.length > 50 && (
        <p className="text-sm text-muted-foreground text-center">
          ...and {totalRows - 50} more rows will be imported
        </p>
      )}
    </div>
  );
}
