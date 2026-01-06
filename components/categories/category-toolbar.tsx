"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface CategoryToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
}

export function CategoryToolbar({
  searchValue,
  onSearchChange,
}: CategoryToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b bg-background">
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search categories..."
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-8"
        />
      </div>
    </div>
  );
}
