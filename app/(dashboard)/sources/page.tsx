"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSources } from "@/hooks/use-sources";
import { useTestSource } from "@/hooks/use-test-source";
import { SourceList } from "@/components/sources/source-list";
import { AddSourceDialog } from "@/components/sources/add-source-dialog";
import { Button } from "@/components/ui/button";
import { Plus, FlaskConical, Loader2, Link2 } from "lucide-react";
import { TransactionSource } from "@/types/source";

export default function SourcesPage() {
  const router = useRouter();
  const { sources, loading, addSource } = useSources();
  const { isActive: isTestActive, isLoading: isTestLoading, activate, deactivate } = useTestSource();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const handleSourceClick = (source: TransactionSource) => {
    router.push(`/sources/${source.id}`);
  };

  const handleImportClick = (source: TransactionSource) => {
    router.push(`/sources/${source.id}/import`);
  };

  const handleConnectClick = (source: TransactionSource) => {
    router.push(`/sources/connect?sourceId=${source.id}`);
  };

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Bank Accounts</h1>
          <p className="text-muted-foreground">
            Manage your bank accounts and import transactions
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={isTestActive ? deactivate : activate}
            disabled={isTestLoading}
          >
            {isTestLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FlaskConical className="h-4 w-4 mr-2" />
            )}
            {isTestActive ? "Disable Test Data" : "Enable Test Data"}
          </Button>
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Account
          </Button>
        </div>
      </div>

      <SourceList
        sources={sources}
        loading={loading}
        onSourceClick={handleSourceClick}
        onImportClick={handleImportClick}
        onConnectClick={handleConnectClick}
      />

      <AddSourceDialog
        open={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onAdd={addSource}
        sources={sources}
      />
    </div>
  );
}
