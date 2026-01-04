"use client";

import { TransactionSource } from "@/types/source";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, Upload, ChevronRight } from "lucide-react";
import { formatIban } from "@/lib/import/deduplication";

interface SourceCardProps {
  source: TransactionSource;
  onClick: () => void;
  onImportClick: () => void;
}

export function SourceCard({ source, onClick, onImportClick }: SourceCardProps) {
  return (
    <Card
      className="cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={onClick}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">{source.name}</h3>
              {source.bankName && (
                <p className="text-sm text-muted-foreground">{source.bankName}</p>
              )}
            </div>
          </div>
          <Badge variant="secondary" className="text-xs">
            {source.type.toUpperCase()}
          </Badge>
        </div>

        <p className="text-sm font-mono text-muted-foreground mb-4">
          {formatIban(source.iban)}
        </p>

        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onImportClick();
            }}
          >
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>

          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}
