"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X, Plus } from "lucide-react";

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
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search partners..."
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 h-9"
        />
        {searchValue && (
          <button
            onClick={() => onSearchChange("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 hover:bg-muted rounded p-0.5"
          >
            <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>

      <Button onClick={onAddPartner} size="sm">
        <Plus className="h-4 w-4 mr-2" />
        Add Partner
      </Button>
    </div>
  );
}
