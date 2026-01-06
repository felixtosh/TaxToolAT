"use client";

import { use, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSources } from "@/hooks/use-sources";
import { useImport, ImportStep } from "@/hooks/use-import";
import { CSVDropzone } from "@/components/import/csv-dropzone";
import { MappingEditor } from "@/components/import/mapping-editor";
import { ImportPreview } from "@/components/import/import-preview";
import { ImportProgress } from "@/components/import/import-progress";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CSVAnalysis } from "@/types/import";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
} from "lucide-react";

interface ImportPageProps {
  params: Promise<{ id: string }>;
}

export default function ImportPage({ params }: ImportPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { sources, loading: sourcesLoading } = useSources();
  const source = sources.find((s) => s.id === id) || null;

  const {
    state,
    handleFileAnalyzed,
    updateMapping,
    updateMappingFormat,
    deleteMapping,
    validateForPreview,
    clearError,
    executeImport,
    reset,
  } = useImport(source);

  // Determine effective step from URL or transient state
  const urlStep = searchParams.get("step") as ImportStep | null;
  const effectiveStep: ImportStep = state.transientStep || urlStep || "upload";

  // Navigation helpers
  const navigateToStep = useCallback(
    (step: ImportStep) => {
      if (step === "upload") {
        router.push(`/sources/${id}/import`);
      } else {
        router.push(`/sources/${id}/import?step=${step}`);
      }
    },
    [router, id]
  );

  const onFileAnalyzed = useCallback(
    async (analysis: CSVAnalysis, file: File) => {
      const success = await handleFileAnalyzed(analysis, file);
      if (success) {
        navigateToStep("mapping");
      }
    },
    [handleFileAnalyzed, navigateToStep]
  );

  const onGoToPreview = useCallback(() => {
    if (validateForPreview()) {
      navigateToStep("preview");
    }
  }, [validateForPreview, navigateToStep]);

  const onGoBackToMapping = useCallback(() => {
    clearError();
    navigateToStep("mapping");
  }, [clearError, navigateToStep]);

  const onReset = useCallback(() => {
    reset();
    navigateToStep("upload");
  }, [reset, navigateToStep]);

  if (sourcesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!source) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Source not found</p>
        <Button
          variant="link"
          onClick={() => router.push("/sources")}
          className="mt-2"
        >
          Back to sources
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-4 border-b flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/sources")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Import Transactions</h1>
          <p className="text-sm text-muted-foreground">
            {source.name} • {source.iban}
          </p>
        </div>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 px-4 py-4 border-b flex-shrink-0">
        <StepIndicator
          step={1}
          label="Upload"
          isActive={effectiveStep === "upload"}
          isComplete={effectiveStep !== "upload"}
        />
        <StepDivider />
        <StepIndicator
          step={2}
          label="Map Columns"
          isActive={effectiveStep === "mapping"}
          isComplete={["preview", "importing", "complete"].includes(effectiveStep)}
        />
        <StepDivider />
        <StepIndicator
          step={3}
          label="Preview"
          isActive={effectiveStep === "preview"}
          isComplete={["importing", "complete"].includes(effectiveStep)}
        />
        <StepDivider />
        <StepIndicator
          step={4}
          label="Import"
          isActive={effectiveStep === "importing" || effectiveStep === "complete"}
          isComplete={effectiveStep === "complete"}
        />
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-auto px-4 py-6">
        {/* Error display */}
        {state.error && (
          <div className="mb-6 p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive">
            {state.error}
          </div>
        )}

        {/* Step content */}
        {effectiveStep === "upload" && (
          <div className="flex flex-col h-full -my-6 -mx-4">
            {state.isMatching ? (
              <div className="flex flex-col items-center justify-center flex-1">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">
                  AI is analyzing your columns...
                </p>
              </div>
            ) : (
              <CSVDropzone onFileAnalyzed={onFileAnalyzed} className="flex-1" />
            )}
          </div>
      )}

      {effectiveStep === "mapping" && state.analysis && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{state.file?.name}</p>
              <p className="text-sm text-muted-foreground">
                {state.analysis.totalRows} rows • {state.analysis.headers.length}{" "}
                columns
              </p>
            </div>
            <Button variant="outline" onClick={onReset}>
              Upload Different File
            </Button>
          </div>

          <MappingEditor
            mappings={state.mappings}
            sampleRows={state.analysis.sampleRows}
            onMappingChange={updateMapping}
            onFormatChange={updateMappingFormat}
            onMappingDelete={deleteMapping}
          />

          <div className="flex justify-end">
            <Button onClick={onGoToPreview}>
              Continue to Preview
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {effectiveStep === "preview" && state.analysis && (
        <div className="flex flex-col h-full -my-6 -mx-4">
          <ImportPreview
            rows={state.analysis.sampleRows}
            mappings={state.mappings}
            totalRows={state.analysis.totalRows}
          />

          <div className="flex justify-between sticky bottom-0 bg-background border-t px-4 py-4">
            <Button variant="outline" onClick={onGoBackToMapping}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Mapping
            </Button>
            <Button onClick={executeImport}>
              Import {state.analysis.totalRows} Transactions
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {(effectiveStep === "importing" || effectiveStep === "complete") && (
        <Card>
          <CardContent className="pt-6">
            <ImportProgress
              progress={state.progress}
              results={state.results}
              isComplete={effectiveStep === "complete"}
            />

            {effectiveStep === "complete" && (
              <div className="flex justify-center gap-4 mt-8">
                <Button variant="outline" onClick={onReset}>
                  Import More
                </Button>
                <Button onClick={() => router.push("/transactions")}>
                  View Transactions
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  );
}

interface StepIndicatorProps {
  step: number;
  label: string;
  isActive: boolean;
  isComplete: boolean;
}

function StepIndicator({ step, label, isActive, isComplete }: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`
          w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
          ${
            isComplete
              ? "bg-primary text-primary-foreground"
              : isActive
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          }
        `}
      >
        {isComplete ? <CheckCircle2 className="h-4 w-4" /> : step}
      </div>
      <span
        className={`text-sm ${
          isActive || isComplete ? "font-medium" : "text-muted-foreground"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

function StepDivider() {
  return <div className="flex-1 h-px bg-border max-w-[60px]" />;
}
