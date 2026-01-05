"use client";

import { useState } from "react";
import { AlertTriangle, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ToolCall } from "@/types/chat";
import { getConfirmationDetails, ConfirmableToolName, ImpactLevel } from "@/lib/chat/confirmation-config";
import { useChat } from "./chat-provider";

interface ConfirmationCardProps {
  toolCall: ToolCall;
}

export function ConfirmationCard({ toolCall }: ConfirmationCardProps) {
  const { approveToolCall, rejectToolCall } = useChat();
  const [isExecuting, setIsExecuting] = useState(false);

  const details = getConfirmationDetails(
    toolCall.name as ConfirmableToolName,
    toolCall.args
  );

  const handleApprove = async () => {
    setIsExecuting(true);
    try {
      await approveToolCall(toolCall.id);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleReject = () => {
    rejectToolCall(toolCall.id);
  };

  const impactStyles: Record<ImpactLevel, string> = {
    low: "border-l-blue-500 bg-blue-50 dark:bg-blue-950/20",
    medium: "border-l-yellow-500 bg-yellow-50 dark:bg-yellow-950/20",
    high: "border-l-red-500 bg-red-50 dark:bg-red-950/20",
  };

  const impactIconColors: Record<ImpactLevel, string> = {
    low: "text-blue-500",
    medium: "text-yellow-500",
    high: "text-red-500",
  };

  return (
    <Card className={cn("border-l-4", impactStyles[details.impact])}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className={cn("h-5 w-5", impactIconColors[details.impact])} />
          <CardTitle className="text-base">{details.title}</CardTitle>
        </div>
        <CardDescription>{details.description}</CardDescription>
      </CardHeader>

      {details.previewData && Object.keys(details.previewData).length > 0 && (
        <CardContent className="pb-2">
          <div className="rounded bg-muted/50 p-2 text-xs">
            <dl className="space-y-1">
              {Object.entries(details.previewData).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <dt className="font-medium text-muted-foreground capitalize">
                    {key.replace(/([A-Z])/g, " $1").trim()}:
                  </dt>
                  <dd className="font-mono">
                    {typeof value === "object"
                      ? JSON.stringify(value)
                      : String(value ?? "—")}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </CardContent>
      )}

      <CardFooter className="gap-2 pt-2">
        <Button
          onClick={handleApprove}
          disabled={isExecuting}
          size="sm"
          className="flex-1"
        >
          {isExecuting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Executing...
            </>
          ) : (
            <>
              <Check className="mr-2 h-4 w-4" />
              Approve
            </>
          )}
        </Button>
        <Button
          variant="outline"
          onClick={handleReject}
          disabled={isExecuting}
          size="sm"
          className="flex-1"
        >
          <X className="mr-2 h-4 w-4" />
          Cancel
        </Button>
      </CardFooter>
    </Card>
  );
}
