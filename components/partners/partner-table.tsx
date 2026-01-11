"use client";

import { useState, useMemo } from "react";
import { usePartners } from "@/hooks/use-partners";
import { useUserData } from "@/hooks/use-user-data";
import { PartnerToolbar } from "./partner-toolbar";
import { PartnerDataTable } from "./partner-data-table";
import { AddPartnerDialog } from "./add-partner-dialog";
import { UserPartner, PartnerFormData } from "@/types/partner";
import { Skeleton } from "@/components/ui/skeleton";

interface PartnerTableProps {
  onSelectPartner?: (partner: UserPartner) => void;
  selectedPartnerId?: string | null;
  searchValue: string;
  onSearchChange: (value: string) => void;
}

export function PartnerTable({
  onSelectPartner,
  selectedPartnerId,
  searchValue,
  onSearchChange,
}: PartnerTableProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const { partners, loading, error, createPartner, deletePartner } = usePartners();
  const { markedAsMe } = useUserData();

  // Filter partners by search
  const filteredPartners = useMemo(() => {
    if (!searchValue) return partners;
    const search = searchValue.toLowerCase();
    return partners.filter(
      (p) =>
        p.name.toLowerCase().includes(search) ||
        p.aliases.some((a) => a.toLowerCase().includes(search)) ||
        p.vatId?.toLowerCase().includes(search) ||
        p.ibans.some((i) => i.toLowerCase().includes(search)) ||
        p.website?.toLowerCase().includes(search)
    );
  }, [partners, searchValue]);

  const handleAddPartner = async (data: PartnerFormData) => {
    return createPartner(data);
  };

  const handleDeletePartner = async (partnerId: string) => {
    if (confirm("Are you sure you want to delete this partner?")) {
      await deletePartner(partnerId);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden bg-background">
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-background">
          <Skeleton className="h-9 w-[300px]" />
          <Skeleton className="h-9 w-[120px]" />
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

  if (error) {
    return (
      <div className="text-center py-10">
        <p className="text-destructive mb-2">Error loading partners</p>
        <p className="text-sm text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      <PartnerToolbar
        searchValue={searchValue}
        onSearchChange={onSearchChange}
        onAddPartner={() => setIsAddDialogOpen(true)}
      />

      <div className="flex-1 overflow-auto">
        <PartnerDataTable
          data={filteredPartners}
          onRowClick={onSelectPartner}
          selectedRowId={selectedPartnerId}
          onDelete={handleDeletePartner}
          markedAsMe={markedAsMe}
        />
      </div>

      <AddPartnerDialog
        open={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onAdd={handleAddPartner}
      />
    </div>
  );
}
