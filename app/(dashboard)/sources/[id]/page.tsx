"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useSources } from "@/hooks/use-sources";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Upload,
  Building2,
  CreditCard,
  Calendar,
  Trash2,
  Loader2,
  Link2,
  RefreshCw,
  AlertTriangle,
  Globe,
} from "lucide-react";
import { useImports } from "@/hooks/use-imports";
import { ImportHistoryCard } from "@/components/sources/import-history-card";
import { SyncStatusCard } from "@/components/sources/sync-status-card";
import { format } from "date-fns";
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
import { GoCardlessConnectorConfig } from "@/types/source";
import { formatIban } from "@/lib/import/deduplication";

interface SourceDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function SourceDetailPage({ params }: SourceDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { sources, loading, deleteSource } = useSources();
  const { imports, loading: importsLoading, deleteImport } = useImports(id);
  const [isDeleting, setIsDeleting] = useState(false);

  const source = sources.find((s) => s.id === id);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!source) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Source not found</p>
        <Button
          variant="link"
          onClick={() => router.push("/sources")}
          className="mt-2"
        >
          Back to sources
        </Button>
      </div>
    );
  }

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteSource(source.id);
      router.push("/sources");
    } catch (error) {
      console.error("Failed to delete source:", error);
      setIsDeleting(false);
    }
  };

  const handleConnect = () => {
    router.push(`/sources/connect?sourceId=${source.id}`);
  };

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

  return (
    <div className="px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/sources")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-primary/10">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold">{source.name}</h1>
                {isApiConnected ? (
                  <Badge
                    variant={needsReauth ? "destructive" : "outline"}
                    className={!needsReauth ? (
                      daysUntilExpiry !== null && daysUntilExpiry <= 7
                        ? "border-yellow-500 text-yellow-600"
                        : "border-green-500 text-green-600"
                    ) : ""}
                  >
                    {needsReauth ? "Reconnect Required" :
                     daysUntilExpiry !== null && daysUntilExpiry <= 7 ? "Expires Soon" : "Connected"}
                  </Badge>
                ) : (
                  <Badge variant="secondary">CSV Import</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground font-mono">
                {formatIban(source.iban)}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Bank Account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete &quot;{source.name}&quot; and all
                  associated imports. Transactions will remain but lose their source reference.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isDeleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {isApiConnected ? (
            <Button
              variant={needsReauth ? "default" : "outline"}
              size="sm"
              onClick={handleConnect}
            >
              {needsReauth ? (
                <>
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Reconnect
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Renew
                </>
              )}
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={handleConnect}>
              <Link2 className="h-4 w-4 mr-2" />
              Connect Bank
            </Button>
          )}

          <Button size="sm" onClick={() => router.push(`/sources/${source.id}/import`)}>
            <Upload className="h-4 w-4 mr-2" />
            Import CSV
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Account Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Account Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-muted rounded-lg">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Bank</p>
                    <p className="font-medium">{source.bankName || "—"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-muted rounded-lg">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">BIC/SWIFT</p>
                    <p className="font-medium font-mono">{source.bic || "—"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-muted rounded-lg">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Currency</p>
                    <p className="font-medium">{source.currency || "EUR"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-muted rounded-lg">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Added</p>
                    <p className="font-medium">
                      {format(source.createdAt.toDate(), "MMM d, yyyy")}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Import History */}
          <ImportHistoryCard
            imports={imports}
            loading={importsLoading}
            onDeleteImport={deleteImport}
          />

          {/* Saved Mappings */}
          {source.fieldMappings && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Saved Column Mappings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(source.fieldMappings.mappings).map(
                    ([csvColumn, targetField]) => (
                      <div
                        key={csvColumn}
                        className="flex items-center gap-2 text-sm p-2 bg-muted rounded"
                      >
                        <span className="truncate text-muted-foreground">{csvColumn}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-medium truncate">{targetField}</span>
                      </div>
                    )
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - Only show for API connected accounts */}
        {isApiConnected && (
          <div className="space-y-6">
            <SyncStatusCard sourceId={source.id} onReauth={handleConnect} />

            {/* Connection Details */}
            {apiConfig && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Connection Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {apiConfig.institutionLogo && (
                    <div className="flex items-center gap-3 pb-3 border-b">
                      <img
                        src={apiConfig.institutionLogo}
                        alt={apiConfig.institutionName}
                        className="h-8 w-8 rounded"
                      />
                      <span className="font-medium">{apiConfig.institutionName}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Valid Until</span>
                    <span className="font-medium">
                      {apiConfig.agreementExpiresAt
                        ? format(apiConfig.agreementExpiresAt.toDate(), "MMM d, yyyy")
                        : "—"}
                    </span>
                  </div>
                  {apiConfig.lastSyncAt && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Last Sync</span>
                      <span className="font-medium">
                        {format(apiConfig.lastSyncAt.toDate(), "MMM d, HH:mm")}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
