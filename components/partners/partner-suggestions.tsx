"use client";

import { UserPartner, GlobalPartner, PartnerSuggestion } from "@/types/partner";
import { Badge } from "@/components/ui/badge";
import { Building2, Globe, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { getConfidenceColor, getSourceLabel } from "@/lib/matching/partner-matcher";

interface PartnerSuggestionWithDetails extends PartnerSuggestion {
  partner: UserPartner | GlobalPartner;
}

interface PartnerSuggestionsProps {
  suggestions: PartnerSuggestionWithDetails[];
  onSelect: (suggestion: PartnerSuggestion) => void;
  isLoading?: boolean;
}

export function PartnerSuggestions({
  suggestions,
  onSelect,
  isLoading,
}: PartnerSuggestionsProps) {
  if (suggestions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No partner suggestions available
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Suggested matches:</p>
      {suggestions.map((suggestion, index) => (
        <button
          key={`${suggestion.partnerId}-${index}`}
          onClick={() => onSelect(suggestion)}
          disabled={isLoading}
          className={cn(
            "w-full flex items-center gap-3 p-3 rounded-lg border",
            "hover:bg-muted/50 transition-colors text-left",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {suggestion.partnerType === "global" ? (
            <Globe className="h-4 w-4 text-blue-500 flex-shrink-0" />
          ) : (
            <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          )}

          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{suggestion.partner.name}</p>
            <p className="text-xs text-muted-foreground">
              {getSourceLabel(suggestion.source)}
            </p>
          </div>

          <Badge className={getConfidenceColor(suggestion.confidence)}>
            {suggestion.confidence}%
          </Badge>

          <Check className="h-4 w-4 text-muted-foreground" />
        </button>
      ))}
    </div>
  );
}
