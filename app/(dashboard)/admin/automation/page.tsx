"use client";

import { useState, useMemo } from "react";
import {
  Bot,
  Building2,
  FileSearch,
  FileText,
  FolderOpen,
  Globe,
  HelpCircle,
  Mail,
  MessageSquare,
  Monitor,
  Receipt,
  Search,
  Settings2,
  Sparkles,
  Tag,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProtectedRoute } from "@/components/auth";
import {
  ALL_PIPELINES,
  PARTNER_MATCH_CONFIG,
  CATEGORY_MATCH_CONFIG,
} from "@/lib/matching/automation-defs";
import { TRANSACTION_MATCH_CONFIG } from "@/types/transaction-matching";
import type { AutomationStep, AutomationPipeline, PipelineId } from "@/types/automation";

// Icon mapping for automation steps
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Building2,
  Sparkles,
  Receipt,
  Globe,
  Tag,
  Search,
  Bot,
  FileSearch,
  Mail,
  FolderOpen,
  FileText,
};

function getIcon(iconName: string) {
  return iconMap[iconName] || HelpCircle;
}

function TriggerBadge({ trigger }: { trigger: string }) {
  const variants: Record<string, { color: string; label: string }> = {
    always: { color: "bg-green-100 text-green-800", label: "Always" },
    if_no_match: { color: "bg-amber-100 text-amber-800", label: "If No Match" },
    if_integration: { color: "bg-blue-100 text-blue-800", label: "If Integration" },
    manual: { color: "bg-gray-100 text-gray-800", label: "Manual" },
  };
  const v = variants[trigger] || { color: "bg-gray-100 text-gray-800", label: trigger };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${v.color}`}>
      {v.label}
    </span>
  );
}

function ExposureBadges({ exposure }: { exposure: AutomationStep["exposure"] }) {
  return (
    <div className="flex items-center gap-1.5">
      {exposure.ui.length > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="gap-1 text-xs">
                <Monitor className="h-3 w-3" />
                UI
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>Exposed in: {exposure.ui.join(", ")}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {exposure.mcp && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="gap-1 text-xs">
                <Settings2 className="h-3 w-3" />
                MCP
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>Available via MCP server tools</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {exposure.chat && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="gap-1 text-xs">
                <MessageSquare className="h-3 w-3" />
                Chat
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>Available via chat interface</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

function AutomationTable({ steps, pipelineId }: { steps: AutomationStep[]; pipelineId: PipelineId }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[40px]">#</TableHead>
          <TableHead>Automation</TableHead>
          <TableHead>Trigger</TableHead>
          <TableHead>Confidence</TableHead>
          <TableHead>Integration</TableHead>
          <TableHead>Exposed Via</TableHead>
          <TableHead className="text-right">Affected Fields</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {steps.map((step) => {
          const Icon = getIcon(step.icon);
          return (
            <TableRow key={step.id}>
              <TableCell className="font-mono text-muted-foreground">
                {step.order}
              </TableCell>
              <TableCell>
                <div className="flex items-start gap-3">
                  <div className="p-1.5 rounded-md bg-muted shrink-0">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium">{step.name}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {step.shortDescription}
                    </p>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <TriggerBadge trigger={step.trigger} />
              </TableCell>
              <TableCell>
                {step.confidence ? (
                  <span className="text-sm">
                    {step.confidence.min === step.confidence.max
                      ? `${step.confidence.min}${step.confidence.unit === "percent" ? "%" : "pts"}`
                      : `${step.confidence.min}-${step.confidence.max}${step.confidence.unit === "percent" ? "%" : "pts"}`}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                {step.integrationId ? (
                  <Badge variant="secondary" className="capitalize">
                    {step.integrationId}
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">System</span>
                )}
              </TableCell>
              <TableCell>
                <ExposureBadges exposure={step.exposure} />
              </TableCell>
              <TableCell className="text-right">
                <div className="flex flex-wrap justify-end gap-1">
                  {step.affectedFields.map((field) => (
                    <code
                      key={field}
                      className="px-1.5 py-0.5 text-xs bg-muted rounded"
                    >
                      {field}
                    </code>
                  ))}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function PipelineCard({ pipeline }: { pipeline: AutomationPipeline }) {
  const Icon = getIcon(pipeline.icon);
  const systemSteps = pipeline.steps.filter((s) => !s.integrationId);
  const integrationSteps = pipeline.steps.filter((s) => s.integrationId);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-4">
          <div className="p-2 rounded-lg bg-primary/10">
            <Icon className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg">{pipeline.name}</CardTitle>
            <CardDescription className="mt-1">
              {pipeline.description}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Zap className="h-4 w-4" />
            {pipeline.steps.length} steps
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {pipeline.triggers.map((trigger, i) => (
            <TooltipProvider key={i}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-xs">
                    {trigger.type.replace(/_/g, " ")}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>{trigger.description}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <AutomationTable steps={pipeline.steps} pipelineId={pipeline.id} />
      </CardContent>
    </Card>
  );
}

function ConfigCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Settings2 className="h-5 w-5" />
          Configuration Thresholds
        </CardTitle>
        <CardDescription>
          Auto-apply and suggestion thresholds for automations
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Partner Matching</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Auto-apply</span>
                <span className="font-mono">{PARTNER_MATCH_CONFIG.AUTO_APPLY_THRESHOLD}%+</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">IBAN confidence</span>
                <span className="font-mono">{PARTNER_MATCH_CONFIG.IBAN_CONFIDENCE}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">AI lookup</span>
                <span className="font-mono">{PARTNER_MATCH_CONFIG.AI_LOOKUP_CONFIDENCE}%</span>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <h4 className="font-medium text-sm">File Matching</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Auto-match</span>
                <span className="font-mono">{TRANSACTION_MATCH_CONFIG.AUTO_MATCH_THRESHOLD}+ pts</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Suggestions</span>
                <span className="font-mono">{TRANSACTION_MATCH_CONFIG.SUGGESTION_THRESHOLD}+ pts</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date range</span>
                <span className="font-mono">±{TRANSACTION_MATCH_CONFIG.DATE_RANGE_DAYS} days</span>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Category Matching</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Auto-apply</span>
                <span className="font-mono">{CATEGORY_MATCH_CONFIG.AUTO_APPLY_THRESHOLD}%+</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Suggestions</span>
                <span className="font-mono">{CATEGORY_MATCH_CONFIG.SUGGESTION_THRESHOLD}%+</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Partner match</span>
                <span className="font-mono">{CATEGORY_MATCH_CONFIG.PARTNER_MATCH_CONFIDENCE}%</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminAutomationPage() {
  const [filter, setFilter] = useState<"all" | PipelineId | "trigger-based">("all");

  const filteredPipelines = useMemo(() => {
    if (filter === "all") return ALL_PIPELINES;
    return ALL_PIPELINES.filter((p) => p.id === filter);
  }, [filter]);

  const totalSteps = ALL_PIPELINES.reduce((acc, p) => acc + p.steps.length, 0);
  const systemSteps = ALL_PIPELINES.reduce(
    (acc, p) => acc + p.steps.filter((s) => !s.integrationId).length,
    0
  );
  const integrationSteps = totalSteps - systemSteps;

  return (
    <ProtectedRoute requireAdmin>
      <div className="h-full overflow-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Automation Management</h1>
              <p className="text-sm text-muted-foreground mt-1">
                View and configure all automation pipelines and their steps
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter pipelines" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Pipelines</SelectItem>
                  <SelectItem value="find-partner">Partner Matching</SelectItem>
                  <SelectItem value="find-file">File Matching</SelectItem>
                  <SelectItem value="trigger-based">Automatic Re-matching</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{ALL_PIPELINES.length}</div>
                <p className="text-xs text-muted-foreground">Pipelines</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{totalSteps}</div>
                <p className="text-xs text-muted-foreground">Total Steps</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{systemSteps}</div>
                <p className="text-xs text-muted-foreground">System Automations</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{integrationSteps}</div>
                <p className="text-xs text-muted-foreground">Integration-dependent</p>
              </CardContent>
            </Card>
          </div>

          {/* Configuration Thresholds */}
          <ConfigCard />

          {/* Pipelines */}
          <div className="space-y-6">
            {filteredPipelines.map((pipeline) => (
              <PipelineCard key={pipeline.id} pipeline={pipeline} />
            ))}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
