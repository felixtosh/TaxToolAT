"use client";

import { SearchButton } from "@/components/ui/search-button";

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
      <SearchButton
        value={searchValue}
        onSearch={onSearchChange}
        placeholder="Search categories..."
      />
    </div>
  );
}
