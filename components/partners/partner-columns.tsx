"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Building2, MoreHorizontal, Pencil, Trash2, ExternalLink } from "lucide-react";
import { UserPartner } from "@/types/partner";
import { formatIban } from "@/lib/import/deduplication";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface PartnerColumnOptions {
  onEdit?: (partner: UserPartner) => void;
  onDelete?: (partnerId: string) => void;
  /** Partner IDs marked as "my company" */
  markedAsMe?: string[];
}

export function getPartnerColumns(
  options: PartnerColumnOptions = {}
): ColumnDef<UserPartner>[] {
  const { onEdit, onDelete, markedAsMe = [] } = options;

  return [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => {
        const partner = row.original;
        const isMyCompany = markedAsMe.includes(partner.id);
        return (
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <div className="font-medium truncate">{partner.name}</div>
              {isMyCompany ? (
                <div className="text-xs text-primary truncate">My Company</div>
              ) : partner.aliases.length > 0 ? (
                <div className="text-xs text-muted-foreground truncate">
                  aka: {partner.aliases.slice(0, 2).join(", ")}
                  {partner.aliases.length > 2 && ` +${partner.aliases.length - 2}`}
                </div>
              ) : null}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "vatId",
      header: "VAT ID",
      cell: ({ row }) => {
        const vatId = row.original.vatId;
        return vatId || <span className="text-muted-foreground">-</span>;
      },
    },
    {
      id: "ibans",
      header: "IBANs",
      cell: ({ row }) => {
        const partner = row.original;
        if (partner.ibans.length === 0) {
          return <span className="text-muted-foreground">-</span>;
        }
        return (
          <div className="text-sm">
            {formatIban(partner.ibans[0])}
            {partner.ibans.length > 1 && (
              <span className="text-muted-foreground ml-1">
                +{partner.ibans.length - 1}
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "website",
      header: "Website",
      cell: ({ row }) => {
        const website = row.original.website;
        if (!website) {
          return <span className="text-muted-foreground">-</span>;
        }
        return (
          <a
            href={`https://${website}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline text-sm flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="truncate">{website}</span>
            <ExternalLink className="h-3 w-3 flex-shrink-0" />
          </a>
        );
      },
    },
    {
      id: "actions",
      header: "",
      enableResizing: false,
      cell: ({ row }) => {
        const partner = row.original;
        if (!onEdit && !onDelete) return null;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit && (
                <DropdownMenuItem onClick={() => onEdit(partner)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem
                  onClick={() => onDelete(partner.id)}
                  className="text-red-600"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
