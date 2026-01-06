"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  Loader2,
} from "lucide-react";
import {
  useSyncStatus,
  formatLastSync,
  getSyncStatusColor,
} from "@/hooks/use-sync-status";
import { cn } from "@/lib/utils";

interface SyncStatusCardProps {
  sourceId: string;
  onReauth?: () => void;
}

export function SyncStatusCard({ sourceId, onReauth }: SyncStatusCardProps) {
  const { status, isSyncing, syncError, triggerSync, isApiSource } = useSyncStatus(sourceId);

  if (!isApiSource) {
    return null;
  }

  const statusColor = getSyncStatusColor(status);

  const StatusIcon = () => {
    if (isSyncing) return <Loader2 className="h-4 w-4 animate-spin" />;
    if (status?.needsReauth) return <XCircle className="h-4 w-4 text-destructive" />;
    if (status?.lastSyncError) return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    if (status?.lastSyncAt) return <CheckCircle className="h-4 w-4 text-green-500" />;
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  };

  const getStatusBadge = () => {
    if (isSyncing) return <Badge variant="secondary">Syncing...</Badge>;
    if (status?.needsReauth) return <Badge variant="destructive">Reconnect Required</Badge>;
    if (status?.lastSyncError) return <Badge variant="outline" className="border-yellow-500 text-yellow-600">Sync Error</Badge>;
    if (status?.lastSyncAt) return <Badge variant="outline" className="border-green-500 text-green-600">Connected</Badge>;
    return <Badge variant="secondary">Not Synced</Badge>;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <StatusIcon />
            Bank Sync Status
          </CardTitle>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Last sync info */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Last synced</span>
          <span className="font-medium">{formatLastSync(status?.lastSyncAt || null)}</span>
        </div>

        {/* Re-auth warning */}
        {status?.needsReauth && (
          <Alert variant="destructive">
            <AlertDescription className="flex items-center justify-between">
              <span>Your bank connection has expired.</span>
              {onReauth && (
                <Button size="sm" variant="outline" onClick={onReauth}>
                  Reconnect
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Expiring soon warning */}
        {status && !status.needsReauth && status.reauthDaysRemaining != null && status.reauthDaysRemaining <= 7 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Connection expires in {status.reauthDaysRemaining} day{status.reauthDaysRemaining === 1 ? "" : "s"}.
              {onReauth && (
                <Button size="sm" variant="link" className="ml-1 h-auto p-0" onClick={onReauth}>
                  Reconnect now
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Sync error */}
        {status?.lastSyncError && !status.needsReauth && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{status.lastSyncError}</AlertDescription>
          </Alert>
        )}

        {/* Sync error from manual trigger */}
        {syncError && (
          <Alert variant="destructive">
            <AlertDescription>{syncError}</AlertDescription>
          </Alert>
        )}

        {/* Sync button */}
        {!status?.needsReauth && (
          <Button
            variant="outline"
            className="w-full"
            onClick={triggerSync}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Sync Now
              </>
            )}
          </Button>
        )}

        {/* Connection info */}
        {status?.reauthExpiresAt && !status.needsReauth && (
          <p className="text-xs text-muted-foreground text-center">
            Connection valid until {status.reauthExpiresAt.toLocaleDateString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
