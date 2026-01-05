"use client";

import { useState } from "react";
import { useGlobalPartners } from "@/hooks/use-global-partners";
import { AdminPartnersTable } from "@/components/admin/admin-partners-table";
import { AddGlobalPartnerDialog } from "@/components/admin/add-global-partner-dialog";
import { GlobalPartner, GlobalPartnerFormData } from "@/types/partner";

export default function AdminPartnersPage() {
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
  } = useGlobalPartners();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<GlobalPartner | null>(null);

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
