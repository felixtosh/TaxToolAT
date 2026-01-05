"use client";

import { PromotionCandidate } from "@/types/partner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Check, X, Users, Building2 } from "lucide-react";
import { formatIban } from "@/lib/import/deduplication";
import { Skeleton } from "@/components/ui/skeleton";

interface UserSuggestionsTableProps {
  candidates: PromotionCandidate[];
  loading: boolean;
  onApprove: (candidateId: string) => Promise<void>;
  onReject: (candidateId: string) => Promise<void>;
}

export function UserSuggestionsTable({
  candidates,
  loading,
  onApprove,
  onReject,
}: UserSuggestionsTableProps) {
  if (loading) {
    return <Skeleton className="h-[200px]" />;
  }

  if (candidates.length === 0) {
    return (
      <div className="border rounded-lg p-8 text-center text-muted-foreground">
        <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No pending suggestions</p>
        <p className="text-sm mt-1">
          User-created partners that match across multiple users will appear here
        </p>
      </div>
    );
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 90) return "bg-green-100 text-green-800";
    if (confidence >= 70) return "bg-yellow-100 text-yellow-800";
    return "bg-gray-100 text-gray-800";
  };

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Partner Name</TableHead>
            <TableHead>Details</TableHead>
            <TableHead>Users</TableHead>
            <TableHead>Confidence</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {candidates.map((candidate) => (
            <TableRow key={candidate.userPartner.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div>
                    <div className="font-medium">{candidate.userPartner.name}</div>
                    {candidate.userPartner.aliases.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        aka: {candidate.userPartner.aliases.slice(0, 2).join(", ")}
                      </div>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div className="text-sm space-y-1">
                  {candidate.userPartner.vatId && (
                    <div>VAT: {candidate.userPartner.vatId}</div>
                  )}
                  {candidate.userPartner.ibans.length > 0 && (
                    <div className="text-muted-foreground">
                      {formatIban(candidate.userPartner.ibans[0])}
                    </div>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span>{candidate.userCount}</span>
                </div>
              </TableCell>
              <TableCell>
                <Badge className={getConfidenceColor(candidate.confidence)}>
                  {candidate.confidence}%
                </Badge>
                {candidate.confidence >= 90 && (
                  <span className="text-xs text-muted-foreground ml-2">
                    Auto-approve
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onReject(candidate.userPartner.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => onApprove(candidate.userPartner.id)}
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Approve
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
