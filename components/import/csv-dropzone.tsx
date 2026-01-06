"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { cn } from "@/lib/utils";
import { Upload, FileSpreadsheet, Loader2 } from "lucide-react";
import { analyzeCSV, AnalysisProgress } from "@/lib/import/csv-parser";
import { CSVAnalysis } from "@/types/import";

interface CSVDropzoneProps {
  onFileAnalyzed: (analysis: CSVAnalysis, file: File) => void;
  disabled?: boolean;
  className?: string;
}

const ACCEPTED_FILE_TYPES = {
  "text/csv": [".csv"],
  "text/plain": [".txt"],
  "application/vnd.ms-excel": [".csv"],
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function CSVDropzone({ onFileAnalyzed, disabled, className }: CSVDropzoneProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      setError(null);
      setFileName(file.name);
      setIsAnalyzing(true);
      setProgress(null);

      try {
        const analysis = await analyzeCSV(file, (p) => setProgress(p));

        if (analysis.headers.length === 0) {
          throw new Error("No columns found in the CSV file");
        }

        if (analysis.totalRows === 0) {
          throw new Error("No data rows found in the CSV file");
        }

        onFileAnalyzed(analysis, file);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to parse CSV file");
        setFileName(null);
      } finally {
        setIsAnalyzing(false);
        setProgress(null);
      }
    },
    [onFileAnalyzed]
  );

  const { getRootProps, getInputProps, isDragActive, fileRejections } =
    useDropzone({
      onDrop,
      accept: ACCEPTED_FILE_TYPES,
      maxSize: MAX_FILE_SIZE,
      maxFiles: 1,
      disabled: disabled || isAnalyzing,
    });

  return (
    <div className={cn("flex flex-col", className)}>
      <div
        {...getRootProps()}
        className={cn(
          "relative border-2 border-dashed rounded-lg transition-all duration-200 flex-1 flex items-center justify-center",
          "hover:border-primary hover:bg-primary/5 cursor-pointer",
          isDragActive && "border-primary bg-primary/10 scale-[1.01]",
          (disabled || isAnalyzing) && "pointer-events-none opacity-60",
          error && "border-destructive"
        )}
      >
        <input {...getInputProps()} />

        <div className="flex flex-col items-center justify-center text-center p-12">
          {isAnalyzing ? (
            <>
              <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
              <p className="text-lg font-medium">Analyzing {fileName}...</p>
              <p className="text-sm text-muted-foreground mt-1">
                {progress?.phase === "counting" && progress.linesScanned > 0
                  ? `${progress.linesScanned.toLocaleString()} lines scanned`
                  : progress?.phase === "parsing"
                  ? "Parsing columns..."
                  : "Reading file..."}
              </p>
            </>
          ) : (
            <>
              <div
                className={cn(
                  "p-4 rounded-full mb-4 transition-colors",
                  isDragActive ? "bg-primary/20" : "bg-muted"
                )}
              >
                {isDragActive ? (
                  <FileSpreadsheet className="h-8 w-8 text-primary" />
                ) : (
                  <Upload className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <p className="text-lg font-medium">
                {isDragActive
                  ? "Drop your CSV file here"
                  : "Drag & drop your bank export"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                or click to browse (CSV files up to 10MB)
              </p>
            </>
          )}
        </div>
      </div>

      {/* File rejection errors */}
      {fileRejections.length > 0 && (
        <div className="text-sm text-destructive">
          {fileRejections[0].errors[0].message}
        </div>
      )}

      {/* Analysis error */}
      {error && <div className="text-sm text-destructive">{error}</div>}
    </div>
  );
}
