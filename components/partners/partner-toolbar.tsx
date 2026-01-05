"use client";

import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { SearchButton } from "@/components/ui/search-button";

interface PartnerToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  onAddPartner: () => void;
}

export function PartnerToolbar({
  searchValue,
  onSearchChange,
  onAddPartner,
}: PartnerToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b bg-background">
      <SearchButton
        value={searchValue}
        onSearch={onSearchChange}
        placeholder="Search partners..."
      />

      <div className="flex-1" />

      <Button onClick={onAddPartner} size="sm">
        <Plus className="h-4 w-4 mr-2" />
        Add Partner
      </Button>
    </div>
  );
}
