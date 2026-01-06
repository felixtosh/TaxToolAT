"use client";

import { useState } from "react";
import { RefreshCw, Loader2, Tag, Users, Hash, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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
import { useNoReceiptCategories } from "@/hooks/use-no-receipt-categories";
import { cn } from "@/lib/utils";

export default function AdminCategoriesPage() {
  const { categories, loading, retrigger } = useNoReceiptCategories();
  const [retriggering, setRetriggering] = useState(false);
  const [retriggerResult, setRetriggerResult] = useState<{
    created: number;
    migrated: number;
    recalculated: number;
  } | null>(null);

  const handleRetrigger = async () => {
    setRetriggering(true);
    setRetriggerResult(null);
    try {
      const result = await retrigger();
      setRetriggerResult(result);
    } finally {
      setRetriggering(false);
    }
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">No-Receipt Categories</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage categories for transactions that don&apos;t require
              receipts
            </p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={retriggering}>
                <RefreshCw
                  className={cn(
                    "h-4 w-4 mr-2",
                    retriggering && "animate-spin"
                  )}
                />
                Retrigger Categories
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Retrigger Categories?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will:
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Create any missing categories from templates</li>
                    <li>
                      Auto-migrate orphaned category references by name matching
                    </li>
                    <li>Recalculate transaction counts</li>
                  </ul>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleRetrigger}>
                  Retrigger
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Retrigger Result */}
        {retriggerResult && (
          <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-md p-4">
            <p className="text-sm text-green-700 dark:text-green-300">
              Retrigger complete: {retriggerResult.created} created,{" "}
              {retriggerResult.migrated} migrated, {retriggerResult.recalculated}{" "}
              recalculated
            </p>
          </div>
        )}

        {/* Categories Table */}
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px]">Category</TableHead>
                <TableHead className="w-[100px] text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Hash className="h-4 w-4" />
                    <span>Transactions</span>
                  </div>
                </TableHead>
                <TableHead className="w-[100px] text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Users className="h-4 w-4" />
                    <span>Partners</span>
                  </div>
                </TableHead>
                <TableHead className="w-[100px] text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Tag className="h-4 w-4" />
                    <span>Patterns</span>
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                // Loading skeleton
                Array.from({ length: 9 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-60" />
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Skeleton className="h-6 w-12 mx-auto" />
                    </TableCell>
                    <TableCell className="text-center">
                      <Skeleton className="h-6 w-12 mx-auto" />
                    </TableCell>
                    <TableCell className="text-center">
                      <Skeleton className="h-6 w-12 mx-auto" />
                    </TableCell>
                  </TableRow>
                ))
              ) : categories.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8">
                    <p className="text-muted-foreground">
                      No categories found. Click &quot;Retrigger Categories&quot; to
                      initialize.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                categories.map((category) => {
                  const isReceiptLost = category.templateId === "receipt-lost";

                  return (
                    <TableRow key={category.id}>
                      <TableCell>
                        <div className="flex items-start gap-2">
                          {isReceiptLost ? (
                            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                          ) : (
                            <Tag className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                          )}
                          <div>
                            <p
                              className={cn(
                                "font-medium",
                                isReceiptLost &&
                                  "text-amber-600 dark:text-amber-400"
                              )}
                            >
                              {category.name}
                            </p>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {category.helperText}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">
                          {category.transactionCount}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">
                          {category.matchedPartnerIds.length}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">
                          {category.learnedPatterns.length}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Summary */}
        {!loading && categories.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <div className="border rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Total Transactions</p>
              <p className="text-2xl font-semibold">
                {categories.reduce((sum, c) => sum + c.transactionCount, 0)}
              </p>
            </div>
            <div className="border rounded-lg p-4">
              <p className="text-sm text-muted-foreground">
                Categories with Partners
              </p>
              <p className="text-2xl font-semibold">
                {categories.filter((c) => c.matchedPartnerIds.length > 0).length}
              </p>
            </div>
            <div className="border rounded-lg p-4">
              <p className="text-sm text-muted-foreground">
                Categories with Patterns
              </p>
              <p className="text-2xl font-semibold">
                {categories.filter((c) => c.learnedPatterns.length > 0).length}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
