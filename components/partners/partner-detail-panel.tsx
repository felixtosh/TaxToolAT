"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Building2, Globe, CreditCard, FileText, Pencil, Trash2, ExternalLink } from "lucide-react";
import { UserPartner, PartnerFormData } from "@/types/partner";
import { usePartners } from "@/hooks/use-partners";
import { formatIban } from "@/lib/import/deduplication";
import { useState } from "react";
import { AddPartnerDialog } from "./add-partner-dialog";

interface PartnerDetailPanelProps {
  partner: UserPartner;
  onClose: () => void;
}

export function PartnerDetailPanel({ partner, onClose }: PartnerDetailPanelProps) {
  const { updatePartner, deletePartner } = usePartners();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const handleEdit = async (data: PartnerFormData) => {
    await updatePartner(partner.id, data);
  };

  const handleDelete = async () => {
    if (confirm("Are you sure you want to delete this partner?")) {
      await deletePartner(partner.id);
      onClose();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          <Building2 className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          <h2 className="font-semibold truncate">{partner.name}</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="flex-shrink-0">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Aliases */}
        {partner.aliases.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Also known as
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {partner.aliases.map((alias, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs">
                  {alias}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* VAT ID */}
        {partner.vatId && (
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              <FileText className="h-3 w-3 inline mr-1" />
              VAT ID
            </h3>
            <p className="text-sm font-mono">{partner.vatId}</p>
          </div>
        )}

        {/* IBANs */}
        {partner.ibans.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              <CreditCard className="h-3 w-3 inline mr-1" />
              Bank Accounts
            </h3>
            <div className="space-y-1">
              {partner.ibans.map((iban, idx) => (
                <p key={idx} className="text-sm font-mono">{formatIban(iban)}</p>
              ))}
            </div>
          </div>
        )}

        {/* Website */}
        {partner.website && (
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              <Globe className="h-3 w-3 inline mr-1" />
              Website
            </h3>
            <a
              href={`https://${partner.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              {partner.website}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}

        {/* Address */}
        {partner.address && (
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Address
            </h3>
            <div className="text-sm space-y-0.5">
              {partner.address.street && <p>{partner.address.street}</p>}
              <p>
                {[partner.address.postalCode, partner.address.city]
                  .filter(Boolean)
                  .join(" ")}
              </p>
              {partner.address.country && <p>{partner.address.country}</p>}
            </div>
          </div>
        )}

        {/* Notes */}
        {partner.notes && (
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Notes
            </h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{partner.notes}</p>
          </div>
        )}

        {/* Global Partner Link */}
        {partner.globalPartnerId && (
          <div>
            <Badge variant="outline" className="text-xs">
              Linked to Global Partner
            </Badge>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-t bg-muted/30">
        <Button
          variant="outline"
          size="sm"
          onClick={handleDelete}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </Button>
        <Button size="sm" onClick={() => setIsEditDialogOpen(true)}>
          <Pencil className="h-4 w-4 mr-2" />
          Edit
        </Button>
      </div>

      {/* Edit Dialog */}
      <AddPartnerDialog
        open={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        onAdd={handleEdit}
        initialData={{
          name: partner.name,
          aliases: partner.aliases,
          vatId: partner.vatId || "",
          ibans: partner.ibans,
          website: partner.website || "",
          address: partner.address,
          notes: partner.notes || "",
        }}
        mode="edit"
      />
    </div>
  );
}
