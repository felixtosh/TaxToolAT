"use client";

import { useState } from "react";
import { useAIUsage } from "@/hooks/use-ai-usage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  DollarSign,
  Zap,
  MessageSquare,
  Building,
  Brain,
  Columns,
  FileSearch,
  FileCheck,
  Search,
} from "lucide-react";
import { UsageChart } from "./usage-chart";
import { AIFunction } from "@/types/ai-usage";
import { cn } from "@/lib/utils";

const FUNCTION_ICONS: Record<AIFunction, typeof Activity> = {
  chat: MessageSquare,
  companyLookup: Building,
  companyLookupSearch: Search,
  patternLearning: Brain,
  columnMatching: Columns,
  extraction: FileSearch,
  classification: FileCheck,
};

const FUNCTION_COLORS: Record<AIFunction, string> = {
  chat: "bg-blue-500",
  companyLookup: "bg-purple-500",
  companyLookupSearch: "bg-violet-500",
  patternLearning: "bg-green-500",
  columnMatching: "bg-orange-500",
  extraction: "bg-cyan-500",
  classification: "bg-teal-500",
};

function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(2)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

function formatModelName(model: string): string {
  // Claude models
  if (model.includes("sonnet")) return "Sonnet 4";
  if (model.includes("haiku")) return "Haiku 3.5";
  if (model.includes("opus")) return "Opus";
  // Gemini models
  if (model.includes("gemini-2.0-flash-lite")) return "Gemini Flash Lite";
  if (model.includes("gemini-2.0-flash")) return "Gemini Flash";
  if (model.includes("gemini-2.5-flash")) return "Gemini 2.5 Flash";
  if (model.includes("gemini")) return "Gemini";
  return model.split("-").slice(0, 2).join(" ");
}

function formatFunctionName(fn: AIFunction): string {
  const names: Record<AIFunction, string> = {
    chat: "Chat",
    companyLookup: "Company Lookup",
    companyLookupSearch: "Company Search",
    patternLearning: "Pattern Learning",
    columnMatching: "Column Matching",
    extraction: "File Extraction",
    classification: "Classification",
  };
  return names[fn] || fn;
}

export function UsageDashboard() {
  const [dateRange, setDateRange] = useState<"7d" | "30d">("30d");
  const { records, summary, dailyStats, functionBreakdown, loading, error } = useAIUsage({
    dateRange,
  });

  if (error) {
    return (
      <div className="p-4 text-red-500">
        Error loading usage data: {error.message}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">AI Usage</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={dateRange === "7d" ? "default" : "outline"}
            size="sm"
            onClick={() => setDateRange("7d")}
          >
            7 Days
          </Button>
          <Button
            variant={dateRange === "30d" ? "default" : "outline"}
            size="sm"
            onClick={() => setDateRange("30d")}
          >
            30 Days
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Calls
              </CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">{summary.totalCalls}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Cost
              </CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">
                  {formatCost(summary.totalCost)}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Input Tokens
              </CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">
                  {formatTokens(summary.totalInputTokens)}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Output Tokens
              </CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">
                  {formatTokens(summary.totalOutputTokens)}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Usage Over Time Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Usage Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[250px] w-full" />
              ) : (
                <UsageChart data={dailyStats} type="line" dataKey="calls" />
              )}
            </CardContent>
          </Card>

          {/* Cost Over Time Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cost Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[250px] w-full" />
              ) : (
                <UsageChart data={dailyStats} type="line" dataKey="cost" />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Function Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Usage by Function</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[100px] w-full" />
            ) : functionBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No usage data yet
              </p>
            ) : (
              <div className="space-y-3">
                {functionBreakdown.map((item) => {
                  const Icon = FUNCTION_ICONS[item.function];
                  const color = FUNCTION_COLORS[item.function];
                  const percentage = summary.totalCalls > 0
                    ? (item.calls / summary.totalCalls) * 100
                    : 0;

                  return (
                    <div key={item.function} className="flex items-center gap-3">
                      <div className={cn("p-2 rounded-md", color)}>
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">{item.name}</span>
                          <span className="text-sm text-muted-foreground">
                            {item.calls} calls ({percentage.toFixed(0)}%)
                          </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn("h-full rounded-full", color)}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-sm font-medium w-20 text-right">
                        {formatCost(item.cost)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Model Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Usage by Model</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[100px] w-full" />
            ) : Object.keys(summary.byModel).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No usage data yet
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(summary.byModel).map(([model, stats]) => (
                  <div
                    key={model}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div>
                      <div className="font-medium">{formatModelName(model)}</div>
                      <div className="text-sm text-muted-foreground">
                        {stats.calls} calls
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{formatCost(stats.cost)}</div>
                      <div className="text-sm text-muted-foreground">
                        {formatTokens(stats.inputTokens + stats.outputTokens)} tokens
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Usage Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : records.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No usage records yet. Start using AI features to see data here.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Function</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.slice(0, 20).map((record) => {
                    const Icon = FUNCTION_ICONS[record.function];
                    return (
                      <TableRow key={record.id}>
                        <TableCell className="text-muted-foreground">
                          {record.createdAt.toDate().toLocaleString("de-DE", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                            {formatFunctionName(record.function)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {formatModelName(record.model)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatTokens(record.inputTokens + record.outputTokens)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatCost(record.estimatedCost)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
