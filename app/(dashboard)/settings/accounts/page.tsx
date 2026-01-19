"use client";

import { useState } from "react";
import { Plus, Mail, Trash2, RefreshCw, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert";
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
import { formatDistanceToNow } from "date-fns";

export default function SettingsAccountsPage() {
  const { integrations, loading, disconnect } = useEmailIntegrations();
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    setConnecting(true);
    // Redirect to Gmail OAuth flow
    window.location.href = "/api/gmail/authorize";
  };

  const handleDisconnect = async (integrationId: string) => {
    setDisconnecting(integrationId);
    try {
      await disconnect(integrationId);
    } finally {
      setDisconnecting(null);
    }
  };

  const getStatusBadge = (integration: typeof integrations[0]) => {
    if (integration.status === "connected") {
      return (
        <Badge variant="outline" className="text-green-600 border-green-600">
          <CheckCircle className="h-3 w-3 mr-1" />
          Connected
        </Badge>
      );
    }
    if (integration.status === "error" || integration.status === "expired") {
      return (
        <Badge variant="outline" className="text-destructive border-destructive">
          <AlertCircle className="h-3 w-3 mr-1" />
          {integration.status === "expired" ? "Expired" : "Error"}
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-amber-600 border-amber-600">
        <RefreshCw className="h-3 w-3 mr-1" />
        {integration.status}
      </Badge>
    );
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold">Linked Accounts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Connect your Google accounts to sync emails and attachments
          </p>
        </div>

        {/* Info Alert */}
        <Alert>
          <Mail className="h-4 w-4" />
          <AlertDescription>
            Linked Google accounts are used to automatically sync invoices and receipts
            from your Gmail. Each account will be monitored for emails with attachments
            that match your transaction patterns.
          </AlertDescription>
        </Alert>

        {/* Connected Accounts */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Google Accounts</CardTitle>
              <CardDescription>
                {integrations.length === 0
                  ? "No accounts connected yet"
                  : `${integrations.length} account${integrations.length > 1 ? "s" : ""} connected`}
              </CardDescription>
            </div>
            <Button onClick={handleConnect} disabled={connecting}>
              {connecting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Add Account
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : integrations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No Google accounts connected</p>
                <p className="text-sm mt-1">
                  Click &quot;Add Account&quot; to connect your first Gmail account
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {integrations.map((integration) => (
                  <div
                    key={integration.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                        <Mail className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium">{integration.email}</p>
                        <p className="text-xs text-muted-foreground">
                          Last synced:{" "}
                          {integration.lastSyncAt
                            ? formatDistanceToNow(integration.lastSyncAt.toDate(), {
                                addSuffix: true,
                              })
                            : "Never"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {getStatusBadge(integration)}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            disabled={disconnecting === integration.id}
                          >
                            {disconnecting === integration.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Disconnect Account?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will stop syncing emails from {integration.email}.
                              Previously synced files will remain in your account.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDisconnect(integration.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Disconnect
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Additional Info */}
        <div className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>How it works:</strong> When you connect a Gmail account, TaxStudio
            will automatically scan for emails containing invoices and receipts. Matching
            attachments are extracted and linked to your transactions.
          </p>
          <p>
            <strong>Privacy:</strong> TaxStudio only accesses email metadata and
            attachments. Email content is processed but not stored.
          </p>
        </div>
      </div>
    </div>
  );
}
