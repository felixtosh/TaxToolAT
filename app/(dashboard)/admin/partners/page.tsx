"use client";

import { useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useGlobalPartners } from "@/hooks/use-global-partners";
import { AdminPartnersTable } from "@/components/admin/admin-partners-table";
import { AddGlobalPartnerDialog } from "@/components/admin/add-global-partner-dialog";
import { GlobalPartner, GlobalPartnerFormData } from "@/types/partner";
import { Skeleton } from "@/components/ui/skeleton";

function AdminPartnersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    globalPartners,
    promotionCandidates,
    loading,
    createPartner,
    updatePartner,
    deletePartner,
    approveCandidate,
    rejectCandidate,
    generateCandidates,
    presetPartnersEnabled,
    presetPartnersLoading,
    togglePresetPartners,
  } = useGlobalPartners();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<GlobalPartner | null>(null);

  // Get search value from URL
  const searchValue = searchParams.get("search") || "";

  // Update search in URL
  const handleSearchChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set("search", value);
      } else {
        params.delete("search");
      }
      const newUrl = params.toString()
        ? `/admin/partners?${params.toString()}`
        : "/admin/partners";
      router.replace(newUrl, { scroll: false });
    },
    [router, searchParams]
  );

  const handleAdd = () => {
    setEditingPartner(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (partner: GlobalPartner) => {
    setEditingPartner(partner);
    setIsDialogOpen(true);
  };

  const handleSave = async (data: GlobalPartnerFormData) => {
    if (editingPartner) {
      await updatePartner(editingPartner.id, data);
    } else {
      return createPartner(data);
    }
  };

  const handleDelete = async (partnerId: string) => {
    if (confirm("Are you sure you want to delete this partner?")) {
      await deletePartner(partnerId);
    }
  };

  const handleApprove = async (candidateId: string) => {
    await approveCandidate(candidateId);
  };

  const handleReject = async (candidateId: string) => {
    if (confirm("Are you sure you want to reject this suggestion?")) {
      await rejectCandidate(candidateId);
    }
  };

  return (
    <div className="h-full overflow-hidden">
      <AdminPartnersTable
        globalPartners={globalPartners}
        candidates={promotionCandidates}
        loading={loading}
        onAdd={handleAdd}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onApprove={handleApprove}
        onReject={handleReject}
        onGenerateCandidates={generateCandidates}
        searchValue={searchValue}
        onSearchChange={handleSearchChange}
        presetPartnersEnabled={presetPartnersEnabled}
        presetPartnersLoading={presetPartnersLoading}
        onTogglePresetPartners={togglePresetPartners}
      />

      <AddGlobalPartnerDialog
        open={isDialogOpen}
        onClose={() => {
          setIsDialogOpen(false);
          setEditingPartner(null);
        }}
        onSave={handleSave}
        editingPartner={editingPartner}
      />
    </div>
  );
}

function AdminPartnersFallback() {
  return (
    <div className="h-full flex flex-col overflow-hidden bg-card">
      <div className="flex items-center gap-2 px-4 py-2 border-b">
        <Skeleton className="h-9 w-[300px]" />
        <Skeleton className="h-9 w-[100px]" />
      </div>
      <div className="flex-1">
        {[...Array(10)].map((_, i) => (
          <div
            key={i}
            className="flex items-center space-x-4 px-4 py-3 border-b last:border-b-0"
          >
            <Skeleton className="h-4 w-[200px]" />
            <Skeleton className="h-4 w-[100px]" />
            <Skeleton className="h-4 w-[180px]" />
            <Skeleton className="h-4 w-[120px]" />
            <Skeleton className="h-4 w-[24px]" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminPartnersPage() {
  return (
    <Suspense fallback={<AdminPartnersFallback />}>
      <AdminPartnersContent />
    </Suspense>
  );
}
