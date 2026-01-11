"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  FileText,
  Sparkles,
  Receipt,
  Globe,
  Tag,
  Search,
  Bot,
  FileSearch,
  Mail,
  CheckCircle,
  ExternalLink,
  AlertCircle,
  Zap,
  Clock,
  FolderOpen,
  type LucideIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { AutomationStepCard } from "./automation-step-card";
import { cn } from "@/lib/utils";
import type {
  AutomationPipeline,
  AutomationStep,
  IntegrationStatus,
  PipelineId,
} from "@/types/automation";
import { getPipelineById } from "@/lib/automations";

/**
 * Icon name to component mapping
 */
const ICON_MAP: Record<string, LucideIcon> = {
  Building2,
  FileText,
  Sparkles,
  Receipt,
  Globe,
  Tag,
  Search,
  Bot,
  FileSearch,
  Mail,
  CheckCircle,
  FolderOpen,
};

interface AutomationDialogProps {
  open: boolean;
  onClose: () => void;
  pipelineId: PipelineId;
  integrationStatuses?: Map<string, IntegrationStatus>;
}

export function AutomationDialog({
  open,
  onClose,
  pipelineId,
  integrationStatuses,
}: AutomationDialogProps) {
  const router = useRouter();
  const [selectedStep, setSelectedStep] = React.useState<AutomationStep | null>(
    null
  );

  const pipeline = React.useMemo(() => getPipelineById(pipelineId), [pipelineId]);

  // Reset selected step when dialog opens
  React.useEffect(() => {
    if (open) {
      setSelectedStep(null);
    }
  }, [open]);

  if (!pipeline) {
    return null;
  }

  const PipelineIcon = ICON_MAP[pipeline.icon] || Sparkles;

  const getIntegrationStatus = (
    integrationId: string | null
  ): IntegrationStatus | undefined => {
    if (!integrationId) return undefined;
    return integrationStatuses?.get(integrationId);
  };

  const handleIntegrationClick = () => {
    router.push("/integrations");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-[900px] h-[600px] p-0 gap-0 flex flex-col">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
              <PipelineIcon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle>{pipeline.name}</DialogTitle>
              <DialogDescription className="mt-1">
                {pipeline.description}
              </DialogDescription>
            </div>
          </div>
          {/* Pipeline triggers */}
          {pipeline.triggers && pipeline.triggers.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Zap className="h-3 w-3" />
                Runs:
              </span>
              {pipeline.triggers.map((trigger, index) => (
                <Badge
                  key={index}
                  variant="outline"
                  className="text-xs font-normal"
                  title={trigger.description}
                >
                  {formatTriggerType(trigger.type)}
                </Badge>
              ))}
            </div>
          )}
        </DialogHeader>

        {/* Content - Split pane */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left panel - Step list */}
          <div className="w-[380px] border-r flex flex-col min-h-0">
            <div className="px-4 py-3 border-b bg-muted/30">
              <h3 className="text-sm font-medium">
                Automation Steps ({pipeline.steps.length})
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Steps run in order from top to bottom
              </p>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {pipeline.steps.map((step, index) => (
                  <div key={step.id} className="relative">
                    {/* Order number */}
                    <div className="absolute left-2 top-3 w-5 h-5 rounded-full bg-muted text-muted-foreground text-xs flex items-center justify-center font-medium">
                      {index + 1}
                    </div>
                    <div className="pl-6">
                      <AutomationStepCard
                        step={step}
                        integrationStatus={getIntegrationStatus(
                          step.integrationId
                        )}
                        isSelected={selectedStep?.id === step.id}
                        onClick={() => setSelectedStep(step)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Right panel - Step details */}
          <div className="flex-1 flex flex-col min-h-0">
            {selectedStep ? (
              <StepDetailPanel
                step={selectedStep}
                integrationStatus={getIntegrationStatus(
                  selectedStep.integrationId
                )}
                onIntegrationClick={handleIntegrationClick}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Sparkles className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Select a step to view details</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Detail panel for a selected automation step
 */
interface StepDetailPanelProps {
  step: AutomationStep;
  integrationStatus?: IntegrationStatus;
  onIntegrationClick: () => void;
}

function StepDetailPanel({
  step,
  integrationStatus,
  onIntegrationClick,
}: StepDetailPanelProps) {
  const Icon = ICON_MAP[step.icon] || Sparkles;
  const isAvailable = !step.integrationId || integrationStatus?.isConnected;
  const needsReauth = integrationStatus?.needsReauth;

  return (
    <ScrollArea className="flex-1">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div
            className={cn(
              "flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center",
              step.category === "ai"
                ? "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
                : step.category === "search"
                  ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                  : "bg-muted text-muted-foreground"
            )}
          >
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">{step.name}</h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {step.integrationId ? (
                <Badge
                  variant={isAvailable ? "secondary" : "outline"}
                  className={cn(!isAvailable && "text-muted-foreground")}
                >
                  {needsReauth && <AlertCircle className="h-3 w-3 mr-1" />}
                  {step.integrationId === "gmail" ? "Gmail" : step.integrationId}
                </Badge>
              ) : (
                <Badge variant="outline">System</Badge>
              )}
              {step.trigger && (
                <Badge
                  variant="outline"
                  className="text-muted-foreground"
                  title={formatStepTrigger(step.trigger).description}
                >
                  <Clock className="h-3 w-3 mr-1" />
                  {formatStepTrigger(step.trigger).label}
                </Badge>
              )}
              {step.canCreateEntities && (
                <Badge variant="secondary">Can create entities</Badge>
              )}
            </div>
          </div>
        </div>

        {/* Integration warning */}
        {step.integrationId && !isAvailable && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                {needsReauth ? "Re-authentication required" : "Integration not connected"}
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                {needsReauth
                  ? "Your connection needs to be refreshed."
                  : "Connect this integration to enable this automation."}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={onIntegrationClick}
              className="flex-shrink-0"
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              {needsReauth ? "Reconnect" : "Connect"}
            </Button>
          </div>
        )}

        <Separator />

        {/* Description */}
        <div>
          <h4 className="text-sm font-medium mb-2">How it works</h4>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {step.longDescription}
          </p>
        </div>

        {/* Confidence */}
        {step.confidence && (
          <div>
            <h4 className="text-sm font-medium mb-2">Confidence</h4>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full",
                    step.confidence.unit === "percent"
                      ? step.confidence.max >= 90
                        ? "bg-green-500"
                        : step.confidence.max >= 70
                          ? "bg-yellow-500"
                          : "bg-red-500"
                      : "bg-blue-500"
                  )}
                  style={{
                    width: `${step.confidence.unit === "percent" ? step.confidence.max : (step.confidence.max / 100) * 100}%`,
                  }}
                />
              </div>
              <span className="text-sm text-muted-foreground w-24 text-right">
                {step.confidence.min === step.confidence.max
                  ? `${step.confidence.max}`
                  : `${step.confidence.min}-${step.confidence.max}`}
                {step.confidence.unit === "percent" ? "%" : " pts"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {step.confidence.unit === "percent"
                ? "Matches above 89% are auto-applied; below that they appear as suggestions."
                : "Points contribute to the total match score. Auto-match threshold is 85 points."}
            </p>
          </div>
        )}

        {/* Affected fields */}
        <div>
          <h4 className="text-sm font-medium mb-2">Affected fields</h4>
          <div className="flex flex-wrap gap-1.5">
            {step.affectedFields.map((field) => (
              <Badge key={field} variant="outline" className="text-xs">
                {formatFieldName(field)}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

/**
 * Format field names for display
 */
function formatFieldName(field: string): string {
  const fieldNames: Record<string, string> = {
    partnerId: "Partner",
    partnerType: "Partner Type",
    partnerMatchConfidence: "Match Confidence",
    partnerSuggestions: "Partner Suggestions",
    fileIds: "Connected Files",
    noReceiptCategoryId: "No-Receipt Category",
    categorySuggestions: "Category Suggestions",
  };
  return fieldNames[field] || field;
}

/**
 * Format pipeline trigger types for display
 */
function formatTriggerType(type: string): string {
  const triggerNames: Record<string, string> = {
    on_import: "On Transaction Import",
    on_partner_create: "On New Partner",
    on_file_upload: "On File Upload",
    on_extraction_complete: "After Extraction",
    chained: "After Partner Match",
    manual: "Manual Only",
  };
  return triggerNames[type] || type;
}

/**
 * Format step trigger types for display
 */
function formatStepTrigger(trigger: string): { label: string; description: string } {
  const triggers: Record<string, { label: string; description: string }> = {
    always: {
      label: "Always",
      description: "Runs every time the pipeline executes",
    },
    if_no_match: {
      label: "If No Match",
      description: "Only runs if previous steps didn't find a match",
    },
    if_integration: {
      label: "If Connected",
      description: "Only runs if the required integration is connected",
    },
    manual: {
      label: "Manual",
      description: "Only runs when manually triggered by the user",
    },
  };
  return triggers[trigger] || { label: trigger, description: "" };
}
