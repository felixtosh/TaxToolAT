"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Check, X } from "lucide-react";

interface AiSuggestionCardProps {
  suggestion: string;
  onAccept: () => void;
  onDismiss: () => void;
}

export function AiSuggestionCard({
  suggestion,
  onAccept,
  onDismiss,
}: AiSuggestionCardProps) {
  return (
    <Card className="p-4 border-primary/30 bg-primary/5">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-full bg-primary/10">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium mb-1">AI Suggested Description</p>
          <p className="text-sm text-muted-foreground mb-3">{suggestion}</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={onAccept}>
              <Check className="h-3 w-3 mr-1" />
              Use This
            </Button>
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              <X className="h-3 w-3 mr-1" />
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
