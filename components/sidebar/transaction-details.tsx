"use client";

import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import Link from "next/link";
import { httpsCallable } from "firebase/functions";
import { Transaction } from "@/types/transaction";
import { TransactionSource } from "@/types/source";
import { UserPartner, GlobalPartner, PartnerSuggestion } from "@/types/partner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AddPartnerDialog } from "@/components/partners/add-partner-dialog";
import { PartnerPill } from "@/components/partners/partner-pill";
import { usePartnerSuggestions, useAssignedPartner } from "@/hooks/use-partner-suggestions";
import { Plus, ExternalLink, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { functions } from "@/lib/firebase/config";
import { shouldAutoApply } from "@/lib/matching/partner-matcher";

// Consistent field row component
function FieldRow({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4", className)}>
      <span className="text-sm text-muted-foreground shrink-0 sm:w-32">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  );
}

interface TransactionDetailsProps {
  transaction: Transaction;
  source?: TransactionSource;
  userPartners: UserPartner[];
  globalPartners: GlobalPartner[];
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
  onAssignPartner,
  onRemovePartner,
  onCreatePartner,
}: TransactionDetailsProps) {
  const [isAddPartnerOpen, setIsAddPartnerOpen] = useState(false);
  const [isAssigningPartner, setIsAssigningPartner] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const matchedTransactionIds = useRef<Set<string>>(new Set());
  const autoAppliedRef = useRef<Set<string>>(new Set());

  // Get partner suggestions and assigned partner
  const suggestions = usePartnerSuggestions(transaction, userPartners, globalPartners);
  const assignedPartner = useAssignedPartner(transaction, userPartners, globalPartners);

  // Trigger partner matching when opening a transaction without partner/suggestions
  useEffect(() => {
    const shouldMatch =
      !assignedPartner &&
      suggestions.length === 0 &&
      !matchedTransactionIds.current.has(transaction.id);

    if (shouldMatch) {
      matchedTransactionIds.current.add(transaction.id);
      setIsLoadingSuggestions(true);

      const matchPartners = httpsCallable(functions, "matchPartners");
      matchPartners({ transactionIds: [transaction.id] })
        .catch((error) => {
          console.error("Failed to match partners:", error);
        })
        .finally(() => {
          setIsLoadingSuggestions(false);
        });
    }
  }, [transaction.id, assignedPartner, suggestions.length]);

  // Auto-apply high-confidence suggestions (matches server-side behavior)
  useEffect(() => {
    if (assignedPartner || isAssigningPartner) return;
    if (autoAppliedRef.current.has(transaction.id)) return;

    // Find ANY suggestion with high confidence (>= 89%)
    const highConfidenceSuggestion = suggestions.find(
      (s) => shouldAutoApply(s.confidence)
    );

    if (highConfidenceSuggestion) {
      autoAppliedRef.current.add(transaction.id);
      onAssignPartner(
        highConfidenceSuggestion.partnerId,
        highConfidenceSuggestion.partnerType,
        "suggestion",
        highConfidenceSuggestion.confidence
      ).catch((error) => {
        console.error("Failed to auto-apply partner:", error);
        autoAppliedRef.current.delete(transaction.id);
      });
    }
  }, [transaction.id, assignedPartner, suggestions, isAssigningPartner, onAssignPartner]);

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

  const handleSelectExistingPartner = async (partnerId: string, partnerType: "user" | "global") => {
    setIsAssigningPartner(true);
    try {
      await onAssignPartner(partnerId, partnerType, "manual", 100);
    } finally {
      setIsAssigningPartner(false);
    }
  };

  const formattedAmount = new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: transaction.currency || "EUR",
  }).format(transaction.amount / 100);

  return (
    <div className="space-y-3">
      <FieldRow label="Date">
        {format(transaction.date.toDate(), "MMM d, yyyy")}
      </FieldRow>

      <FieldRow label="Amount">
        <span className={cn("tabular-nums", transaction.amount < 0 ? "text-red-600" : "text-green-600")}>
          {formattedAmount}
        </span>
      </FieldRow>

      {transaction.partner && (
        <FieldRow label="Counterparty">
          {transaction.partner}
        </FieldRow>
      )}

      {transaction.partnerIban && (
        <FieldRow label="IBAN">
          <span className="font-mono text-xs">{transaction.partnerIban}</span>
        </FieldRow>
      )}

      <FieldRow label="Description">
        {transaction.name}
      </FieldRow>

      {transaction.reference && (
        <FieldRow label="Reference">
          <span className="font-mono text-xs">{transaction.reference}</span>
        </FieldRow>
      )}

      {source && (
        <FieldRow label="Account">
          <Link
            href={`/sources/${source.id}`}
            className="text-primary hover:underline inline-flex items-center gap-1"
          >
            {source.name}
            <ExternalLink className="h-3 w-3" />
          </Link>
        </FieldRow>
      )}

      {/* Partner section */}
      <div className="border-t pt-3 mt-3 -mx-4 px-4">
        <h3 className="text-sm font-medium mb-2">Partner</h3>

        <FieldRow label="Connect">
          {assignedPartner ? (
            <PartnerPill
              name={assignedPartner.name}
              confidence={transaction.partnerMatchConfidence}
              onRemove={handleRemovePartner}
            />
          ) : isLoadingSuggestions ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAddPartnerOpen(true)}
              className="h-7 px-3"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add
            </Button>
          )}
        </FieldRow>

        {/* Partner suggestions when no match */}
        {!assignedPartner && !isLoadingSuggestions && suggestions.length > 0 && (
          <FieldRow label="Suggestions" className="mt-1">
            <div className="flex flex-wrap gap-1.5">
              {suggestions.slice(0, 3).map((suggestion) => (
                <PartnerPill
                  key={suggestion.partnerId}
                  name={suggestion.partner.name}
                  confidence={suggestion.confidence}
                  variant="suggestion"
                  onClick={() => handleSelectSuggestion(suggestion)}
                  disabled={isAssigningPartner}
                />
              ))}
            </div>
          </FieldRow>
        )}
      </div>

      {transaction.isComplete && (
        <FieldRow label="Status">
          <Badge variant="default" className="bg-green-600 hover:bg-green-700">
            Complete
          </Badge>
        </FieldRow>
      )}

      {/* Add Partner Dialog */}
      <AddPartnerDialog
        open={isAddPartnerOpen}
        onClose={() => setIsAddPartnerOpen(false)}
        onAdd={handleAddPartner}
        onSelectPartner={handleSelectExistingPartner}
        onSelectSuggestion={handleSelectSuggestion}
        suggestions={suggestions}
        userPartners={userPartners}
        globalPartners={globalPartners}
        initialData={{
          name: transaction.partner || transaction.name || undefined,
          ibans: transaction.partnerIban ? [transaction.partnerIban] : undefined,
        }}
      />
    </div>
  );
}
