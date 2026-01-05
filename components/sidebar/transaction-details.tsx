"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import Link from "next/link";
import { Transaction } from "@/types/transaction";
import { TransactionSource } from "@/types/source";
import { UserPartner, GlobalPartner, PartnerSuggestion } from "@/types/partner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PartnerCard } from "@/components/partners/partner-card";
import { PartnerSuggestions } from "@/components/partners/partner-suggestions";
import { AddPartnerDialog } from "@/components/partners/add-partner-dialog";
import { usePartnerSuggestions, useAssignedPartner } from "@/hooks/use-partner-suggestions";
import { Pencil, Check, X, Calendar, Building2, DollarSign, Landmark, ExternalLink, Plus, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface TransactionDetailsProps {
  transaction: Transaction;
  source?: TransactionSource;
  userPartners: UserPartner[];
  globalPartners: GlobalPartner[];
  onUpdate: (updates: Partial<Transaction>) => Promise<void>;
  onAssignPartner: (
    partnerId: string,
    partnerType: "global" | "user",
    matchedBy: "manual" | "suggestion",
    confidence?: number
  ) => Promise<void>;
  onRemovePartner: () => Promise<void>;
  onCreatePartner: (data: { name: string; aliases?: string[]; vatId?: string; ibans?: string[]; website?: string; country?: string; notes?: string }) => Promise<string>;
}

export function TransactionDetails({
  transaction,
  source,
  userPartners,
  globalPartners,
  onUpdate,
  onAssignPartner,
  onRemovePartner,
  onCreatePartner,
}: TransactionDetailsProps) {
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [description, setDescription] = useState(transaction.description || "");
  const [isSaving, setIsSaving] = useState(false);
  const [isAddPartnerOpen, setIsAddPartnerOpen] = useState(false);
  const [isAssigningPartner, setIsAssigningPartner] = useState(false);

  // Get partner suggestions and assigned partner
  const suggestions = usePartnerSuggestions(transaction, userPartners, globalPartners);
  const assignedPartner = useAssignedPartner(transaction, userPartners, globalPartners);

  // Update local state when transaction changes
  useEffect(() => {
    setDescription(transaction.description || "");
  }, [transaction.description]);

  const handleSaveDescription = async () => {
    setIsSaving(true);
    try {
      const trimmedDescription = description.trim() || null;
      await onUpdate({
        description: trimmedDescription,
        isComplete: transaction.receiptIds.length > 0 && !!trimmedDescription,
      });
      setIsEditingDescription(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectSuggestion = async (suggestion: PartnerSuggestion) => {
    setIsAssigningPartner(true);
    try {
      await onAssignPartner(
        suggestion.partnerId,
        suggestion.partnerType,
        "suggestion",
        suggestion.confidence
      );
    } finally {
      setIsAssigningPartner(false);
    }
  };

  const handleRemovePartner = async () => {
    setIsAssigningPartner(true);
    try {
      await onRemovePartner();
    } finally {
      setIsAssigningPartner(false);
    }
  };

  const handleAddPartner = async (data: { name: string; aliases?: string[]; vatId?: string; ibans?: string[]; website?: string; country?: string; notes?: string }) => {
    const partnerId = await onCreatePartner(data);
    // Auto-assign the newly created partner
    await onAssignPartner(partnerId, "user", "manual", 100);
    return partnerId;
  };

  const formattedAmount = new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: transaction.currency || "EUR",
  }).format(transaction.amount / 100);

  return (
    <div className="space-y-4">
      {/* Date */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Date
        </span>
        <span className="font-medium">
          {format(transaction.date.toDate(), "MMMM d, yyyy")}
        </span>
      </div>

      {/* Transaction Name */}
      <div>
        <span className="text-sm text-muted-foreground">Transaction Name</span>
        <p className="font-medium mt-1">{transaction.name}</p>
      </div>

      {/* Amount - prominent display */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          Amount
        </span>
        <span
          className={cn(
            "text-2xl font-bold tabular-nums",
            transaction.amount < 0 ? "text-red-600" : "text-green-600"
          )}
        >
          {formattedAmount}
        </span>
      </div>

      {/* Partner/Vendor (original text from bank) */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Partner (Bank)
        </span>
        <span className="font-medium text-sm truncate max-w-[180px]">
          {transaction.partner || "-"}
        </span>
      </div>

      {/* Matched Partner Section */}
      <div className="space-y-3 pt-2 border-t">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Matched Partner
          </span>
          {transaction.partnerMatchConfidence && (
            <Badge variant="outline" className="text-xs">
              {transaction.partnerMatchConfidence}% match
            </Badge>
          )}
        </div>

        {assignedPartner ? (
          <PartnerCard
            partner={assignedPartner}
            partnerType={transaction.partnerType || "user"}
            showRemove
            onRemove={handleRemovePartner}
          />
        ) : (
          <div className="space-y-3">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setIsAddPartnerOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Partner
            </Button>

            {suggestions.length > 0 && (
              <PartnerSuggestions
                suggestions={suggestions}
                onSelect={handleSelectSuggestion}
                isLoading={isAssigningPartner}
              />
            )}
          </div>
        )}
      </div>

      {/* Editable Description */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">Cost Description</span>
          {!isEditingDescription && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditingDescription(true)}
              className="h-7 px-2"
            >
              <Pencil className="h-3 w-3 mr-1" />
              Edit
            </Button>
          )}
        </div>

        {isEditingDescription ? (
          <div className="space-y-2">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter cost description for tax purposes..."
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleSaveDescription}
                disabled={isSaving}
              >
                <Check className="h-3 w-3 mr-1" />
                Save
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDescription(transaction.description || "");
                  setIsEditingDescription(false);
                }}
                disabled={isSaving}
              >
                <X className="h-3 w-3 mr-1" />
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p
            className={cn(
              "text-sm",
              transaction.description
                ? "text-foreground"
                : "text-muted-foreground italic"
            )}
          >
            {transaction.description || "No description added"}
          </p>
        )}
      </div>

      {/* Source/Account */}
      {source && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground flex items-center gap-2">
            <Landmark className="h-4 w-4" />
            Account
          </span>
          <Link
            href={`/sources/${source.id}`}
            className="font-medium text-primary hover:underline flex items-center gap-1"
          >
            {source.name}
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      )}

      {/* Status badges */}
      <div className="flex gap-2 pt-2">
        <Badge
          variant={transaction.receiptIds.length > 0 ? "default" : "outline"}
        >
          {transaction.receiptIds.length > 0 ? "Receipt attached" : "No receipt"}
        </Badge>
        {transaction.isComplete && (
          <Badge variant="default" className="bg-green-600 hover:bg-green-700">
            Complete
          </Badge>
        )}
      </div>

      {/* Add Partner Dialog */}
      <AddPartnerDialog
        open={isAddPartnerOpen}
        onClose={() => setIsAddPartnerOpen(false)}
        onAdd={handleAddPartner}
        initialData={{
          name: transaction.partner || undefined,
          ibans: transaction.partnerIban ? [transaction.partnerIban] : undefined,
        }}
      />
    </div>
  );
}
