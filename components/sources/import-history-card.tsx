"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Skeleton } from "@/components/ui/skeleton";
import { FileSpreadsheet, Trash2, Loader2, ChevronRight } from "lucide-react";
import { ImportRecord } from "@/types/import";

interface ImportHistoryCardProps {
  imports: ImportRecord[];
  loading: boolean;
  onDeleteImport: (importId: string) => Promise<void>;
}

export function ImportHistoryCard({
  imports,
  loading,
  onDeleteImport,
}: ImportHistoryCardProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (importId: string) => {
    setDeletingId(importId);
    try {
      await onDeleteImport(importId);
    } finally {
      setDeletingId(null);
    }
  };

  const handleRowClick = (importId: string) => {
    router.push(`/transactions?importId=${importId}`);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Import History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (imports.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Import History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-6">
            No imports yet. Upload a CSV file to get started.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          Import History
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {imports.map((imp) => (
          <div
            key={imp.id}
            className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer group"
            onClick={() => handleRowClick(imp.id)}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {format(imp.createdAt.toDate(), "MMM d, yyyy")} - {imp.fileName}
              </p>
              <p className="text-xs text-muted-foreground">
                {imp.importedCount} imported, {imp.skippedCount} skipped,{" "}
                {imp.errorCount} errors
              </p>
            </div>

            <div className="flex items-center gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                    disabled={deletingId === imp.id}
                  >
                    {deletingId === imp.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 text-destructive" />
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Import?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will delete the import record and all{" "}
                      {imp.importedCount} transactions that were imported from
                      &quot;{imp.fileName}&quot;. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleDelete(imp.id)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
