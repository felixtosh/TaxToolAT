"use client";

import { TransactionSource, GoCardlessConnectorConfig } from "@/types/source";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, Upload, ChevronRight, Link2, RefreshCw, AlertTriangle } from "lucide-react";
import { formatIban } from "@/lib/import/deduplication";

interface SourceCardProps {
  source: TransactionSource;
  onClick: () => void;
  onImportClick: () => void;
  onConnectClick: () => void;
}

export function SourceCard({ source, onClick, onImportClick, onConnectClick }: SourceCardProps) {
  // Check API connection status
  const isApiConnected = source.type === "api" && source.apiConfig?.provider === "gocardless";
  const apiConfig = source.apiConfig as GoCardlessConnectorConfig | undefined;

  // Check if re-auth is needed
  const needsReauth = isApiConnected && apiConfig?.agreementExpiresAt
    ? apiConfig.agreementExpiresAt.toDate() < new Date()
    : false;

  // Days until expiry
  const daysUntilExpiry = isApiConnected && apiConfig?.agreementExpiresAt
    ? Math.max(0, Math.floor((apiConfig.agreementExpiresAt.toDate().getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  const getStatusBadge = () => {
    if (needsReauth) {
      return <Badge variant="destructive" className="text-xs">Reconnect</Badge>;
    }
    if (isApiConnected) {
      if (daysUntilExpiry !== null && daysUntilExpiry <= 7) {
        return <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-600">Expires soon</Badge>;
      }
      return <Badge variant="outline" className="text-xs border-green-500 text-green-600">Connected</Badge>;
    }
    return <Badge variant="secondary" className="text-xs">CSV</Badge>;
  };

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
          {getStatusBadge()}
        </div>

        <p className="text-sm font-mono text-muted-foreground mb-4">
          {formatIban(source.iban)}
        </p>

        <div className="flex items-center justify-between">
          <div className="flex gap-2">
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

            <Button
              variant={needsReauth ? "default" : "outline"}
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onConnectClick();
              }}
            >
              {needsReauth ? (
                <>
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Reconnect
                </>
              ) : isApiConnected ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Renew
                </>
              ) : (
                <>
                  <Link2 className="h-4 w-4 mr-2" />
                  Connect
                </>
              )}
            </Button>
          </div>

          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}
