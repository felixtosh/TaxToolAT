"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSources } from "@/hooks/use-sources";
import { useTestSource } from "@/hooks/use-test-source";
import { SourceList } from "@/components/sources/source-list";
import { AddSourceDialog } from "@/components/sources/add-source-dialog";
import { Button } from "@/components/ui/button";
import { Plus, FlaskConical, Loader2, Link2, Trash2 } from "lucide-react";
import { TransactionSource } from "@/types/source";

export default function SourcesPage() {
  const router = useRouter();
  const { sources, loading, addSource } = useSources();
  const { isActive: isTestActive, isLoading: isTestLoading, activate, deactivate } = useTestSource();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDeletingOrphans, setIsDeletingOrphans] = useState(false);

  const handleDeleteOrphans = async () => {
    setIsDeletingOrphans(true);
    try {
      const response = await fetch("/api/sources/delete-orphans", { method: "POST" });
      const data = await response.json();
      if (response.ok) {
        console.log("Delete orphans success:", data);
        const sourcesMsg = data.deletedSources > 0 ? `${data.deletedSources} source(s)` : "";
        const connectionsMsg = data.deletedConnections > 0 ? `${data.deletedConnections} connection(s)` : "";
        const transactionsMsg = data.deletedTransactions > 0 ? `${data.deletedTransactions} transaction(s)` : "";
        const parts = [sourcesMsg, connectionsMsg, transactionsMsg].filter(Boolean);
        const message = parts.length > 0 ? `Deleted ${parts.join(", ")}` : "No orphans found";
        alert(message);
      } else {
        console.error("Delete orphans failed:", data.error);
        alert(`Failed: ${data.error}`);
      }
    } catch (err) {
      console.error("Delete orphans error:", err);
      alert(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsDeletingOrphans(false);
    }
  };

  const handleSourceClick = (source: TransactionSource) => {
    router.push(`/sources/${source.id}`);
  };

  const handleImportClick = (source: TransactionSource) => {
    router.push(`/sources/${source.id}/import`);
  };

  const handleConnectClick = () => {
    router.push("/sources/connect");
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
          <Button
            variant="outline"
            onClick={handleDeleteOrphans}
            disabled={isDeletingOrphans}
            className="text-destructive hover:text-destructive"
          >
            {isDeletingOrphans ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            Delete Orphans
          </Button>
          <Button variant="outline" onClick={handleConnectClick}>
            <Link2 className="h-4 w-4 mr-2" />
            Connect Bank
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
