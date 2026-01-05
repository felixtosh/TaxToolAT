"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Building2, MoreHorizontal, Pencil, Trash2, ExternalLink } from "lucide-react";
import { UserPartner } from "@/types/partner";
import { formatIban } from "@/lib/import/deduplication";
import { cn } from "@/lib/utils";

interface PartnerDataTableProps {
  data: UserPartner[];
  onRowClick?: (partner: UserPartner) => void;
  selectedRowId?: string | null;
  onEdit?: (partner: UserPartner) => void;
  onDelete?: (partnerId: string) => void;
}

export function PartnerDataTable({
  data,
  onRowClick,
  selectedRowId,
  onEdit,
  onDelete,
}: PartnerDataTableProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow className="hover:bg-transparent border-b">
            <TableHead className="h-10 bg-muted/50 pl-4">Name</TableHead>
            <TableHead className="h-10 bg-muted/50">VAT ID</TableHead>
            <TableHead className="h-10 bg-muted/50">IBANs</TableHead>
            <TableHead className="h-10 bg-muted/50">Website</TableHead>
            <TableHead className="h-10 bg-muted/50 pr-4 w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center">
                No partners found.
              </TableCell>
            </TableRow>
          ) : (
            data.map((partner) => (
              <TableRow
                key={partner.id}
                data-partner-id={partner.id}
                data-state={selectedRowId === partner.id ? "selected" : undefined}
                onClick={() => onRowClick?.(partner)}
                className={cn(
                  "cursor-pointer transition-colors",
                  selectedRowId === partner.id && "bg-primary/10"
                )}
              >
                <TableCell className="py-2.5 pl-4">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
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
                <TableCell className="py-2.5">
                  {partner.vatId || <span className="text-muted-foreground">-</span>}
                </TableCell>
                <TableCell className="py-2.5">
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
                <TableCell className="py-2.5">
                  {partner.website ? (
                    <a
                      href={`https://${partner.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline text-sm flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {partner.website}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="py-2.5 pr-4">
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
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
