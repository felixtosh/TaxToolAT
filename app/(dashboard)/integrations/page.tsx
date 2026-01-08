"use client";

import { Suspense } from "react";
import { formatDistanceToNow } from "date-fns";
import { Mail, Plus, AlertCircle, Check, RefreshCw, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useEmailIntegrations } from "@/hooks/use-email-integrations";
import { useState } from "react";
import { EmailIntegration } from "@/types/email-integration";

function IntegrationsContent() {
  const {
    integrations,
    loading,
    error,
    connectGmail,
    disconnect,
    refresh,
  } = useEmailIntegrations();

  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  const handleConnectGmail = async () => {
    setConnecting(true);
    try {
      await connectGmail();
    } catch {
      // Error is handled by the hook
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (integrationId: string) => {
    setDisconnecting(integrationId);
    try {
      await disconnect(integrationId);
    } catch {
      // Error is handled by the hook
    } finally {
      setDisconnecting(null);
    }
  };

  const handleRefresh = async (integrationId: string) => {
    setRefreshing(integrationId);
    try {
      await refresh(integrationId);
    } catch {
      // Error is handled by the hook
    } finally {
      setRefreshing(null);
    }
  };

  const gmailIntegrations = integrations.filter((i) => i.provider === "gmail");

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Integrations</h1>
          <p className="text-muted-foreground mt-1">
            Connect external services to automatically find and match invoices
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Gmail Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
                  <Mail className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <CardTitle className="text-lg">Gmail</CardTitle>
                  <CardDescription>
                    Search emails for invoice attachments
                  </CardDescription>
                </div>
              </div>
              <Button
                onClick={handleConnectGmail}
                disabled={connecting}
              >
                {connecting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Add Account
              </Button>
            </div>
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                <Loader2 className="h-6 w-6 mx-auto animate-spin mb-2" />
                Loading integrations...
              </div>
            ) : gmailIntegrations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Mail className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No Gmail accounts connected</p>
                <p className="text-sm mt-1">
                  Connect your Gmail to search for invoices in your emails
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {gmailIntegrations.map((integration) => (
                  <GmailAccountCard
                    key={integration.id}
                    integration={integration}
                    onDisconnect={() => handleDisconnect(integration.id)}
                    onRefresh={() => handleRefresh(integration.id)}
                    disconnecting={disconnecting === integration.id}
                    refreshing={refreshing === integration.id}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Coming Soon Section */}
        <Card className="opacity-60">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Mail className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-lg">
                  Microsoft Outlook
                  <Badge variant="secondary" className="ml-2 text-xs">Coming Soon</Badge>
                </CardTitle>
                <CardDescription>
                  Connect your Outlook account for invoice search
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}

interface GmailAccountCardProps {
  integration: EmailIntegration;
  onDisconnect: () => void;
  onRefresh: () => void;
  disconnecting: boolean;
  refreshing: boolean;
}

function GmailAccountCard({
  integration,
  onDisconnect,
  onRefresh,
  disconnecting,
  refreshing,
}: GmailAccountCardProps) {
  const needsReauth = integration.needsReauth;
  const lastAccessed = integration.lastAccessedAt?.toDate();
  const tokenExpiry = integration.tokenExpiresAt?.toDate();
  const isExpired = tokenExpiry && tokenExpiry < new Date();

  return (
    <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
          <Mail className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{integration.email}</span>
            {needsReauth || isExpired ? (
              <Badge variant="destructive" className="text-xs">
                <AlertCircle className="h-3 w-3 mr-1" />
                Reconnect Required
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">
                <Check className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {lastAccessed ? (
              <>Last used {formatDistanceToNow(lastAccessed, { addSuffix: true })}</>
            ) : (
              <>Connected {formatDistanceToNow(integration.createdAt.toDate(), { addSuffix: true })}</>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {(needsReauth || isExpired) && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2">Reconnect</span>
          </Button>
        )}

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              disabled={disconnecting}
            >
              {disconnecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Disconnect Gmail Account?</AlertDialogTitle>
              <AlertDialogDescription>
                This will disconnect <strong>{integration.email}</strong> from TaxStudio.
                You can reconnect it anytime. Files already imported will remain.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onDisconnect}>
                Disconnect
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

function IntegrationsFallback() {
  return (
    <div className="h-full flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <Suspense fallback={<IntegrationsFallback />}>
      <IntegrationsContent />
    </Suspense>
  );
}
