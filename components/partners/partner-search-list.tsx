"use client";

import { useState, useMemo } from "react";
import { Search, Globe, Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserPartner, GlobalPartner } from "@/types/partner";
import { cn } from "@/lib/utils";

interface PartnerSearchListProps {
  userPartners: UserPartner[];
  globalPartners: GlobalPartner[];
  onSelect: (partnerId: string, partnerType: "user" | "global") => void;
}

type CombinedPartner = (UserPartner | GlobalPartner) & {
  type: "user" | "global";
};

export function PartnerSearchList({
  userPartners,
  globalPartners,
  onSelect,
}: PartnerSearchListProps) {
  const [search, setSearch] = useState("");

  // Combine and filter partners
  const filteredPartners = useMemo(() => {
    const combined: CombinedPartner[] = [
      ...userPartners.map((p) => ({ ...p, type: "user" as const })),
      ...globalPartners.map((p) => ({ ...p, type: "global" as const })),
    ];

    if (!search.trim()) {
      return combined.slice(0, 50); // Limit initial display
    }

    const searchLower = search.toLowerCase();
    return combined.filter(
      (p) =>
        p.name.toLowerCase().includes(searchLower) ||
        p.vatId?.toLowerCase().includes(searchLower) ||
        p.website?.toLowerCase().includes(searchLower) ||
        p.aliases?.some((a) => a.toLowerCase().includes(searchLower))
    );
  }, [userPartners, globalPartners, search]);

  return (
    <div className="flex flex-col h-full">
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search partners..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-9"
        />
      </div>

      <ScrollArea className="flex-1 -mx-1 px-1">
        <div className="space-y-1">
          {filteredPartners.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No partners found
            </p>
          ) : (
            filteredPartners.map((partner) => (
              <button
                key={`${partner.type}-${partner.id}`}
                type="button"
                onClick={() => onSelect(partner.id, partner.type)}
                className={cn(
                  "w-full text-left p-2 rounded-md transition-colors",
                  "hover:bg-muted/50 focus:bg-muted/50 focus:outline-none"
                )}
              >
                <div className="flex items-start gap-2">
                  {partner.type === "global" ? (
                    <Globe className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  ) : (
                    <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{partner.name}</p>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {partner.vatId && (
                        <p className="truncate">VAT: {partner.vatId}</p>
                      )}
                      {partner.website && (
                        <p className="truncate">{partner.website}</p>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>

      <p className="text-xs text-muted-foreground mt-2 text-center">
        {filteredPartners.length} of {userPartners.length + globalPartners.length} partners
      </p>
    </div>
  );
}
