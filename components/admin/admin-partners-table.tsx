"use client";

import { useState, useMemo } from "react";
import { GlobalPartner, PromotionCandidate } from "@/types/partner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchButton } from "@/components/ui/search-button";
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
import {
  Plus,
  X,
  MoreHorizontal,
  Pencil,
  Trash2,
  Globe,
  Building2,
  Check,
  Users,
  RefreshCw,
  Database,
} from "lucide-react";
import { formatIban } from "@/lib/import/deduplication";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface AdminPartnersTableProps {
  globalPartners: GlobalPartner[];
  candidates: PromotionCandidate[];
  loading: boolean;
  onAdd: () => void;
  onEdit: (partner: GlobalPartner) => void;
  onDelete: (partnerId: string) => void;
  onApprove: (candidateId: string) => Promise<void>;
  onReject: (candidateId: string) => Promise<void>;
  onRowClick?: (partner: GlobalPartner) => void;
  selectedRowId?: string | null;
  onGenerateCandidates?: () => Promise<{ candidatesCreated: number; message: string }>;
  searchValue: string;
  onSearchChange: (value: string) => void;
  presetPartnersEnabled?: boolean;
  presetPartnersLoading?: boolean;
  onTogglePresetPartners?: (enable: boolean) => Promise<{ enabled: boolean; count: number }>;
}

export function AdminPartnersTable({
  globalPartners,
  candidates,
  loading,
  onAdd,
  onEdit,
  onDelete,
  onApprove,
  onReject,
  onRowClick,
  selectedRowId,
  onGenerateCandidates,
  searchValue,
  onSearchChange,
  presetPartnersEnabled,
  presetPartnersLoading,
  onTogglePresetPartners,
}: AdminPartnersTableProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleTogglePresetPartners = async () => {
    if (!onTogglePresetPartners) return;
    await onTogglePresetPartners(!presetPartnersEnabled);
  };

  const handleGenerateCandidates = async () => {
    if (!onGenerateCandidates) return;
    setIsGenerating(true);
    try {
      const result = await onGenerateCandidates();
      console.log(result.message);
    } catch (error) {
      console.error("Failed to generate candidates:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const filteredPartners = useMemo(() => {
    if (!searchValue) return globalPartners;
    const search = searchValue.toLowerCase();
    return globalPartners.filter(
      (p) =>
        p.name.toLowerCase().includes(search) ||
        p.aliases.some((a) => a.toLowerCase().includes(search)) ||
        p.vatId?.toLowerCase().includes(search) ||
        p.ibans.some((i) => i.toLowerCase().includes(search)) ||
        p.website?.toLowerCase().includes(search)
    );
  }, [globalPartners, searchValue]);

  const filteredCandidates = useMemo(() => {
    if (!searchValue) return candidates;
    const search = searchValue.toLowerCase();
    return candidates.filter(
      (c) =>
        c.userPartner.name.toLowerCase().includes(search) ||
        c.userPartner.aliases.some((a) => a.toLowerCase().includes(search)) ||
        c.userPartner.vatId?.toLowerCase().includes(search) ||
        c.userPartner.ibans.some((i) => i.toLowerCase().includes(search))
    );
  }, [candidates, searchValue]);

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 90) return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    if (confidence >= 70) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400";
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden bg-background">
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-background">
          <Skeleton className="h-9 w-[300px]" />
          <Skeleton className="h-9 w-[120px]" />
        </div>
        <div className="flex-1">
          {[...Array(10)].map((_, i) => (
            <div
              key={i}
              className="flex items-center space-x-4 px-4 py-3 border-b last:border-b-0"
            >
              <Skeleton className="h-4 w-[200px]" />
              <Skeleton className="h-4 w-[100px]" />
              <Skeleton className="h-4 w-[180px]" />
              <Skeleton className="h-4 w-[120px]" />
              <Skeleton className="h-4 w-[24px]" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-background">
        <SearchButton
          value={searchValue}
          onSearch={onSearchChange}
          placeholder="Search partners..."
        />

        <div className="flex-1" />

        {onGenerateCandidates && (
          <Button
            onClick={handleGenerateCandidates}
            size="sm"
            variant="outline"
            disabled={isGenerating}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", isGenerating && "animate-spin")} />
            {isGenerating ? "Scanning..." : "Find Suggestions"}
          </Button>
        )}

        {onTogglePresetPartners && (
          <Button
            onClick={handleTogglePresetPartners}
            size="sm"
            variant={presetPartnersEnabled ? "destructive" : "outline"}
            disabled={presetPartnersLoading}
          >
            <Database className={cn("h-4 w-4 mr-2", presetPartnersLoading && "animate-pulse")} />
            {presetPartnersLoading
              ? "Loading..."
              : presetPartnersEnabled
              ? "Disable Presets"
              : "Enable Presets (250)"}
          </Button>
        )}

        <Button onClick={onAdd} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Partner
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow className="hover:bg-transparent border-b">
              <TableHead className="h-10 bg-muted/50 pl-4">Name</TableHead>
              <TableHead className="h-10 bg-muted/50">VAT ID</TableHead>
              <TableHead className="h-10 bg-muted/50">IBANs</TableHead>
              <TableHead className="h-10 bg-muted/50">Website</TableHead>
              <TableHead className="h-10 bg-muted/50">Source</TableHead>
              <TableHead className="h-10 bg-muted/50 pr-4 w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Global Partners */}
            {filteredPartners.length === 0 && filteredCandidates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  {searchValue ? "No partners match your search" : "No global partners yet"}
                </TableCell>
              </TableRow>
            ) : (
              <>
                {filteredPartners.map((partner) => (
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
                          className="text-primary hover:underline text-sm"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {partner.website}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2.5">
                      <Badge variant="outline" className="text-xs">
                        {partner.source === "manual"
                          ? "Manual"
                          : partner.source === "user_promoted"
                          ? "User"
                          : partner.source === "preset"
                          ? "Preset"
                          : "Registry"}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2.5 pr-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
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
                ))}

                {/* Separator for Suggestions */}
                {filteredCandidates.length > 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="py-3 px-4 bg-muted/30 border-y">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Users className="h-4 w-4" />
                        <span>Pending Suggestions</span>
                        <Badge variant="secondary" className="text-xs">
                          {filteredCandidates.length}
                        </Badge>
                      </div>
                    </TableCell>
                  </TableRow>
                )}

                {/* Suggestion Candidates */}
                {filteredCandidates.map((candidate) => (
                  <TableRow
                    key={`candidate-${candidate.id}`}
                    className="bg-muted/10"
                  >
                    <TableCell className="py-2.5 pl-4">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-amber-500 flex-shrink-0" />
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
                    <TableCell className="py-2.5">
                      {candidate.userPartner.vatId || <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="py-2.5">
                      {candidate.userPartner.ibans.length > 0 ? (
                        <div className="text-sm">
                          {formatIban(candidate.userPartner.ibans[0])}
                          {candidate.userPartner.ibans.length > 1 && (
                            <span className="text-muted-foreground ml-1">
                              +{candidate.userPartner.ibans.length - 1}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2.5">
                      {candidate.userPartner.website ? (
                        <span className="text-sm">{candidate.userPartner.website}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2.5">
                      <div className="flex items-center gap-2">
                        <Badge className={cn("text-xs", getConfidenceColor(candidate.confidence))}>
                          {candidate.confidence}%
                        </Badge>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {candidate.userCount}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5 pr-4">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-100"
                          onClick={() => onReject(candidate.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-100"
                          onClick={() => onApprove(candidate.id)}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
