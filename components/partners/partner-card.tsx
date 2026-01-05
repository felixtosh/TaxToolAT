"use client";

import { UserPartner, GlobalPartner } from "@/types/partner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Globe, X, ExternalLink } from "lucide-react";
import { formatIban } from "@/lib/import/deduplication";
import { cn } from "@/lib/utils";

interface PartnerCardProps {
  partner: UserPartner | GlobalPartner;
  partnerType: "user" | "global";
  showRemove?: boolean;
  onRemove?: () => void;
  compact?: boolean;
  className?: string;
}

export function PartnerCard({
  partner,
  partnerType,
  showRemove,
  onRemove,
  compact = false,
  className,
}: PartnerCardProps) {
  const isGlobal = partnerType === "global";

  if (compact) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 p-2 rounded-md border bg-muted/30",
          className
        )}
      >
        {isGlobal ? (
          <Globe className="h-4 w-4 text-blue-500 flex-shrink-0" />
        ) : (
          <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}
        <span className="font-medium truncate flex-1">{partner.name}</span>
        {showRemove && onRemove && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="h-6 w-6"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <Card className={className}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {isGlobal ? (
                <Globe className="h-4 w-4 text-blue-500 flex-shrink-0" />
              ) : (
                <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              )}
              <h4 className="font-medium truncate">{partner.name}</h4>
              <Badge
                variant={isGlobal ? "default" : "secondary"}
                className="text-xs"
              >
                {isGlobal ? "Global" : "Your Partner"}
              </Badge>
            </div>

            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              {partner.vatId && <p>VAT: {partner.vatId}</p>}
              {partner.ibans && partner.ibans.length > 0 && (
                <p>IBAN: {formatIban(partner.ibans[0])}</p>
              )}
              {partner.website && (
                <a
                  href={`https://${partner.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  {partner.website}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {partner.country && <p>Country: {partner.country}</p>}
            </div>
          </div>

          {showRemove && onRemove && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onRemove}
              className="h-8 w-8 flex-shrink-0"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
