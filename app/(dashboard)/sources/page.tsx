"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSources } from "@/hooks/use-sources";
import { SourceList } from "@/components/sources/source-list";
import { AddSourceDialog } from "@/components/sources/add-source-dialog";
import { Button } from "@/components/ui/button";
import { Plus, Link2 } from "lucide-react";
import { TransactionSource } from "@/types/source";
import { usePageTitle } from "@/hooks/use-page-title";

export default function SourcesPage() {
  const router = useRouter();
  const { sources, loading, addSource } = useSources();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  // Set page title
  usePageTitle("Accounts");

  const handleSourceClick = (source: TransactionSource) => {
    router.push(`/sources/${source.id}`);
  };

  const handleImportClick = (source: TransactionSource) => {
    router.push(`/sources/${source.id}/import`);
  };

  const handleConnectClick = () => {
    router.push("/sources/connect");
  };

  const handleAddManualClick = () => {
    setIsAddDialogOpen(true);
  };

  // Show header only when there are sources (or loading)
  const showHeader = loading || sources.length > 0;

  return (
    <div className="container mx-auto px-4 py-6">
      {showHeader && (
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Bank Accounts</h1>
            <p className="text-muted-foreground">
              Manage your bank accounts and import transactions
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleAddManualClick} data-onboarding="add-account">
              <Plus className="h-4 w-4 mr-2" />
              Add Manual
            </Button>
            <Button onClick={handleConnectClick} data-onboarding="connect-bank">
              <Link2 className="h-4 w-4 mr-2" />
              Connect Bank
            </Button>
          </div>
        </div>
      )}

      <SourceList
        sources={sources}
        loading={loading}
        onSourceClick={handleSourceClick}
        onImportClick={handleImportClick}
        onConnectClick={handleConnectClick}
        onAddManualClick={handleAddManualClick}
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
