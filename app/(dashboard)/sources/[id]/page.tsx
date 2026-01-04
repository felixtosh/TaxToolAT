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
  FileSpreadsheet,
  Trash2,
  Loader2,
} from "lucide-react";
import { useImports } from "@/hooks/use-imports";
import { ImportHistoryCard } from "@/components/sources/import-history-card";
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

  return (
    <div className="max-w-3xl mx-auto">
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
          <div>
            <h1 className="text-xl font-semibold">{source.name}</h1>
            <p className="text-sm text-muted-foreground font-mono">
              {source.iban}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Bank Account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will delete the bank account &quot;{source.name}&quot;. Transactions
                  imported from this account will remain but lose their source
                  reference.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button onClick={() => router.push(`/sources/${source.id}/import`)}>
            <Upload className="h-4 w-4 mr-2" />
            Import Transactions
          </Button>
        </div>
      </div>

      {/* Account Details */}
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-muted rounded-lg">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Bank Name</p>
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
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Added</p>
                  <p className="font-medium">
                    {format(source.createdAt.toDate(), "MMM d, yyyy")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-muted rounded-lg">
                  <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Import Type</p>
                  <Badge variant="outline" className="mt-0.5">
                    {source.type === "csv" ? "CSV Upload" : "API Connected"}
                  </Badge>
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
              <p className="text-sm text-muted-foreground mb-4">
                These mappings will be automatically applied when importing new
                files from this account.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(source.fieldMappings.mappings).map(
                  ([csvColumn, targetField]) => (
                    <div
                      key={csvColumn}
                      className="flex items-center gap-2 text-sm p-2 bg-muted rounded"
                    >
                      <span className="truncate">{csvColumn}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-medium">{targetField}</span>
                    </div>
                  )
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
