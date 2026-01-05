"use client";

import { useState } from "react";
import { GlobalPartner, GlobalPartnerFormData } from "@/types/partner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Globe } from "lucide-react";
import { formatIban } from "@/lib/import/deduplication";
import { Skeleton } from "@/components/ui/skeleton";

interface GlobalPartnersTableProps {
  partners: GlobalPartner[];
  loading: boolean;
  onAdd: () => void;
  onEdit: (partner: GlobalPartner) => void;
  onDelete: (partnerId: string) => void;
}

export function GlobalPartnersTable({
  partners,
  loading,
  onAdd,
  onEdit,
  onDelete,
}: GlobalPartnersTableProps) {
  const [search, setSearch] = useState("");

  const filteredPartners = partners.filter((partner) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      partner.name.toLowerCase().includes(searchLower) ||
      partner.vatId?.toLowerCase().includes(searchLower) ||
      partner.ibans.some((i) => i.toLowerCase().includes(searchLower)) ||
      partner.website?.toLowerCase().includes(searchLower)
    );
  });

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-[300px]" />
          <Skeleton className="h-10 w-[120px]" />
        </div>
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search partners..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={onAdd}>
          <Plus className="h-4 w-4 mr-2" />
          Add Partner
        </Button>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>VAT ID</TableHead>
              <TableHead>IBANs</TableHead>
              <TableHead>Website</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPartners.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  {search ? "No partners match your search" : "No global partners yet"}
                </TableCell>
              </TableRow>
            ) : (
              filteredPartners.map((partner) => (
                <TableRow key={partner.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-blue-500 flex-shrink-0" />
                      <div>
                        <div className="font-medium">{partner.name}</div>
                        {partner.aliases.length > 0 && (
                          <div className="text-xs text-muted-foreground">
                            aka: {partner.aliases.slice(0, 2).join(", ")}
                            {partner.aliases.length > 2 && ` +${partner.aliases.length - 2}`}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {partner.vatId || <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell>
                    {partner.ibans.length > 0 ? (
                      <div className="text-sm">
                        {formatIban(partner.ibans[0])}
                        {partner.ibans.length > 1 && (
                          <span className="text-muted-foreground ml-1">
                            +{partner.ibans.length - 1}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {partner.website ? (
                      <a
                        href={`https://${partner.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline text-sm"
                      >
                        {partner.website}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {partner.source === "manual"
                        ? "Manual"
                        : partner.source === "user_promoted"
                        ? "User"
                        : "Registry"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(partner)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onDelete(partner.id)}
                          className="text-red-600"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="text-sm text-muted-foreground">
        {filteredPartners.length} partner{filteredPartners.length !== 1 ? "s" : ""}
        {search && ` matching "${search}"`}
      </div>
    </div>
  );
}
