"use client";

import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImportProgressProps {
  progress: number;
  results: {
    total: number;
    imported: number;
    skipped: number;
    errors: number;
  } | null;
  isComplete: boolean;
}

export function ImportProgress({
  progress,
  results,
  isComplete,
}: ImportProgressProps) {
  return (
    <div className="space-y-6">
      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            {isComplete ? "Import Complete" : "Importing transactions..."}
          </span>
          <span className="text-muted-foreground">{progress}%</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Status */}
      {!isComplete && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Processing rows...</span>
        </div>
      )}

      {/* Results */}
      {isComplete && results && (
        <div className="grid grid-cols-2 gap-4">
          <ResultCard
            icon={CheckCircle2}
            iconColor="text-green-600"
            bgColor="bg-green-50 dark:bg-green-950/30"
            label="Imported"
            value={results.imported}
            total={results.total}
          />
          <ResultCard
            icon={AlertCircle}
            iconColor="text-yellow-600"
            bgColor="bg-yellow-50 dark:bg-yellow-950/30"
            label="Skipped (duplicates)"
            value={results.skipped}
            total={results.total}
          />
          <ResultCard
            icon={XCircle}
            iconColor="text-destructive"
            bgColor="bg-destructive/10"
            label="Errors"
            value={results.errors}
            total={results.total}
          />
          <ResultCard
            icon={CheckCircle2}
            iconColor="text-muted-foreground"
            bgColor="bg-muted"
            label="Total processed"
            value={results.total}
          />
        </div>
      )}
    </div>
  );
}

interface ResultCardProps {
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  bgColor: string;
  label: string;
  value: number;
  total?: number;
}

function ResultCard({
  icon: Icon,
  iconColor,
  bgColor,
  label,
  value,
  total,
}: ResultCardProps) {
  return (
    <div className={cn("rounded-lg p-4", bgColor)}>
      <div className="flex items-center gap-3">
        <Icon className={cn("h-5 w-5", iconColor)} />
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-sm text-muted-foreground">
            {label}
            {total !== undefined && ` (${Math.round((value / total) * 100)}%)`}
          </p>
        </div>
      </div>
    </div>
  );
}
