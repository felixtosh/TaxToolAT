"use client";

import { FieldMapping } from "@/types/import";
import { MappingRow } from "./mapping-row";
import { TRANSACTION_FIELDS } from "@/lib/import/field-definitions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle } from "lucide-react";

interface MappingEditorProps {
  mappings: FieldMapping[];
  sampleRows: Record<string, string>[];
  onMappingChange: (index: number, targetField: string | null) => void;
  onFormatChange: (index: number, format: string) => void;
  onMappingDelete: (index: number) => void;
}

export function MappingEditor({
  mappings,
  sampleRows,
  onMappingChange,
  onFormatChange,
  onMappingDelete,
}: MappingEditorProps) {
  // Get list of already mapped fields
  const mappedFields = new Set(
    mappings.filter((m) => m.targetField).map((m) => m.targetField)
  );

  // Check for missing required fields
  const requiredFields = TRANSACTION_FIELDS.filter((f) => f.required);
  const missingRequired = requiredFields.filter(
    (f) => !mappedFields.has(f.key)
  );

  return (
    <div className="space-y-6">
      {/* Missing required fields warning */}
      {missingRequired.length > 0 && (
        <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
          <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
          <div>
            <p className="font-medium text-destructive">
              Missing required fields
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Please map the following fields:{" "}
              {missingRequired.map((f) => f.label).join(", ")}
            </p>
          </div>
        </div>
      )}

      {/* Column mappings */}
      <Card className="flex flex-col overflow-hidden" style={{ maxHeight: "calc(100vh - 400px)", minHeight: "300px" }}>
        <CardHeader className="pb-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Column Mappings</CardTitle>
            <Badge variant="outline">
              {mappings.filter((m) => m.targetField).length} of{" "}
              {mappings.length} mapped
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-auto">
          <div className="space-y-2">
            {mappings.map((mapping, index) => {
              // Get sample values for this column
              const samples = sampleRows
                .slice(0, 5)
                .map((row) => row[mapping.csvColumn])
                .filter((v) => v && v.trim().length > 0);

              return (
                <MappingRow
                  key={mapping.csvColumn}
                  mapping={mapping}
                  samples={samples}
                  usedFields={mappedFields}
                  onChange={(targetField) => onMappingChange(index, targetField)}
                  onFormatChange={(format) => onFormatChange(index, format)}
                  onDelete={() => onMappingDelete(index)}
                />
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
