"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { format, subDays, addDays } from "date-fns";
import {
  Search,
  FileText,
  Image,
  Check,
  Link2,
  Mail,
  HardDrive,
  Loader2,
  X,
  Calendar,
  Sparkles,
  BookmarkCheck,
  Paperclip,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { FilePreview } from "./file-preview";
import {
  useUnifiedFileSearch,
  UnifiedSearchResult,
  TransactionInfo,
} from "@/hooks/use-unified-file-search";
import { usePartners } from "@/hooks/use-partners";
import { learnFileSourcePattern } from "@/lib/operations";
import { db, functions } from "@/lib/firebase/config";
import { httpsCallable } from "firebase/functions";
import { GmailAttachmentsTab } from "./connect-transaction-tabs/gmail-attachments-tab";
import { EmailInvoiceTab } from "./connect-transaction-tabs/email-invoice-tab";

const MOCK_USER_ID = "dev-user-123";

interface ConnectFileDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called when a file is selected - receives fileId for local files, or saves Gmail attachment first */
  onSelect: (
    fileId: string,
    sourceInfo?: {
      sourceType: "local" | "gmail";
      searchPattern?: string;
      gmailIntegrationId?: string;
      gmailMessageId?: string;
    }
  ) => Promise<void>;
  /** File IDs that are already connected (to show as disabled) */
  connectedFileIds?: string[];
  /** Transaction info for display, search, and pattern learning */
  transactionInfo?: {
    date: Date;
    amount: number;
    currency: string;
    /** Counterparty name */
    partner?: string;
    /** Transaction description/booking text */
    name?: string;
    /** Bank reference */
    reference?: string;
    /** Counterparty IBAN */
    partnerIban?: string;
    partnerId?: string;
    transactionId?: string;
  };
}

export function ConnectFileDialog({
  open,
  onClose,
  onSelect,
  connectedFileIds = [],
  transactionInfo,
}: ConnectFileDialogProps) {
  const [selectedResult, setSelectedResult] = useState<UnifiedSearchResult | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [isGeneratingQuery, setIsGeneratingQuery] = useState(false);
  const [querySource, setQuerySource] = useState<"learned" | "ai" | "simple" | null>(null);
  const hasTriedAutoSearch = useRef(false);

  // Get partner info for pattern learning
  const { partners } = usePartners();
  const partner = useMemo(
    () => (transactionInfo?.partnerId ? partners.find((p) => p.id === transactionInfo.partnerId) : null),
    [partners, transactionInfo?.partnerId]
  );

  // Build transaction info for the search hook
  const searchTransactionInfo: TransactionInfo | null = useMemo(() => {
    if (!transactionInfo) return null;
    return {
      id: transactionInfo.transactionId || "",
      date: transactionInfo.date,
      amount: transactionInfo.amount,
      currency: transactionInfo.currency,
      partner: transactionInfo.partner,
      partnerId: transactionInfo.partnerId,
    };
  }, [transactionInfo]);

  // Unified search hook
  const {
    results,
    loading,
    error,
    search,
    clear,
    hasSearched,
    searchQuery,
    setSearchQuery,
  } = useUnifiedFileSearch(
    searchTransactionInfo || {
      id: "",
      date: new Date(),
      amount: 0,
      currency: "EUR",
    },
    partner,
    {
      localOnly: true, // Files tab only searches local files
      dateFrom,
      dateTo,
    }
  );

  // Get best learned file source pattern for this partner
  const bestLearnedPattern = useMemo(() => {
    if (!partner?.fileSourcePatterns?.length) return null;
    // Sort by usage count (most used first), then by confidence
    const sorted = [...partner.fileSourcePatterns].sort((a, b) => {
      if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
      return b.confidence - a.confidence;
    });
    return sorted[0];
  }, [partner?.fileSourcePatterns]);

  // Generate simple fallback search (no AI) - returns single keyword
  const simpleSearch = useMemo(() => {
    const cleanText = (text: string) => {
      const cleaned = text
        .toLowerCase()
        .replace(/^(pp\*|sq\*|paypal\s*\*|ec\s+|sepa\s+)/i, "")
        .replace(/\.(com|de|at|ch|eu|net|org|io)(\/.*)?$/i, "")
        .replace(/\s+(gmbh|ag|inc|llc|ltd|sagt danke|marketplace|lastschrift|gutschrift|ab|bv|nv).*$/i, "")
        .replace(/\s+\d{4,}.*$/, "")
        .replace(/\d{6,}\*+\d+/g, "")
        .replace(/[*]{3,}/g, "")
        .replace(/[^a-z\s]/g, " ")
        .trim();
      // Return first word only
      const words = cleaned.split(/\s+/).filter((w) => w.length > 2);
      return words[0] || "";
    };

    // Try fields in priority order
    const candidates = [
      partner?.name,
      transactionInfo?.partner,
      transactionInfo?.name,
      transactionInfo?.reference,
    ].filter(Boolean);

    for (const text of candidates) {
      const cleaned = cleanText(text!);
      if (cleaned && cleaned.length >= 2) {
        return cleaned;
      }
    }
    return "";
  }, [partner?.name, transactionInfo?.partner, transactionInfo?.name, transactionInfo?.reference]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedResult(null);
      setIsConnecting(false);
      setQuerySource(null);
      hasTriedAutoSearch.current = false;
      clear();
      setDateFrom(undefined);
      setDateTo(undefined);
    }
  }, [open, clear]);

  // Auto-run search when dialog opens
  // Priority: 1) Learned pattern, 2) AI-generated query, 3) Simple extraction
  useEffect(() => {
    if (!open || hasSearched || hasTriedAutoSearch.current) return;
    if (!transactionInfo) return;

    hasTriedAutoSearch.current = true;

    const runAutoSearch = async () => {
      let queryToUse = "";

      // 1. Check for learned pattern
      if (bestLearnedPattern?.pattern) {
        queryToUse = bestLearnedPattern.pattern;
        setQuerySource("learned");
        console.log(`[AutoSearch] Using learned pattern: "${queryToUse}"`);
      } else {
        // 2. Try AI-generated query via Cloud Function
        setIsGeneratingQuery(true);
        try {
          const generateQuery = httpsCallable<
            {
              transactionName?: string;
              transactionPartner?: string;
              transactionReference?: string;
              partnerIban?: string;
              partnerName?: string;
              amount?: number;
              currency?: string;
              date?: string;
            },
            { query: string; fallback?: boolean }
          >(functions, "generateFileSearchQuery");

          const result = await generateQuery({
            transactionName: transactionInfo.name,
            transactionPartner: transactionInfo.partner,
            transactionReference: transactionInfo.reference,
            partnerIban: transactionInfo.partnerIban,
            partnerName: partner?.name,
            amount: transactionInfo.amount,
            currency: transactionInfo.currency,
            date: format(transactionInfo.date, "yyyy-MM-dd"),
          });

          if (result.data.query) {
            queryToUse = result.data.query;
            setQuerySource(result.data.fallback ? "simple" : "ai");
            console.log(`[AutoSearch] Using AI query: "${queryToUse}"`);
          }
        } catch (err) {
          console.error("AI query generation failed:", err);
        } finally {
          setIsGeneratingQuery(false);
        }

        // 3. Fallback to simple extraction
        if (!queryToUse && simpleSearch) {
          queryToUse = simpleSearch;
          setQuerySource("simple");
          console.log(`[AutoSearch] Using simple extraction: "${queryToUse}"`);
        }
      }

      // Run the search
      if (queryToUse) {
        setSearchQuery(queryToUse);
        // Small delay to let state update
        setTimeout(() => search(queryToUse), 50);
      }
    };

    runAutoSearch();
  }, [
    open,
    hasSearched,
    transactionInfo,
    partner?.name,
    bestLearnedPattern,
    simpleSearch,
    search,
    setSearchQuery,
  ]);

  const handleSearch = useCallback(() => {
    search(searchQuery);
  }, [search, searchQuery]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSearch();
      }
    },
    [handleSearch]
  );

  // Handle selecting a result (both local and Gmail)
  const handleSelect = async () => {
    if (!selectedResult) return;

    setIsConnecting(true);
    try {
      if (selectedResult.type === "local" && selectedResult.fileId) {
        // Local file - just connect it
        await onSelect(selectedResult.fileId, {
          sourceType: "local",
          searchPattern: searchQuery || undefined,
        });

        // Learn pattern if partner assigned (only if partner exists locally)
        if (partner && searchQuery && transactionInfo?.transactionId) {
          try {
            await learnFileSourcePattern(
              { db, userId: MOCK_USER_ID },
              partner.id,
              transactionInfo.transactionId,
              {
                sourceType: "local",
                searchPattern: searchQuery,
              }
            );
          } catch (err) {
            console.error("Failed to learn file source pattern:", err);
          }
        }
      } else if (selectedResult.type === "gmail") {
        // Gmail attachment - save it first, then connect
        const response = await fetch("/api/gmail/attachment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            integrationId: selectedResult.integrationId,
            messageId: selectedResult.messageId,
            attachmentId: selectedResult.attachmentId,
            mimeType: selectedResult.mimeType,
            filename: selectedResult.filename,
            gmailMessageSubject: selectedResult.emailSubject,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to save attachment");
        }

        const data = await response.json();

        // Connect the saved file
        await onSelect(data.fileId, {
          sourceType: "gmail",
          searchPattern: searchQuery || undefined,
          gmailIntegrationId: selectedResult.integrationId,
          gmailMessageId: selectedResult.messageId,
        });

        // Learn pattern if partner assigned (only if partner exists locally)
        if (partner && searchQuery && transactionInfo?.transactionId) {
          try {
            await learnFileSourcePattern(
              { db, userId: MOCK_USER_ID },
              partner.id,
              transactionInfo.transactionId,
              {
                sourceType: "gmail",
                searchPattern: searchQuery,
                integrationId: selectedResult.integrationId,
              }
            );
          } catch (err) {
            console.error("Failed to learn file source pattern:", err);
          }
        }
      }

      onClose();
    } catch (error) {
      console.error("Failed to connect file:", error);
    } finally {
      setIsConnecting(false);
    }
  };

  const formatAmount = (amount: number | null | undefined, currency: string | null | undefined) => {
    if (amount == null) return null;
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: currency || "EUR",
    }).format(amount / 100);
  };

  const isFileConnected = (result: UnifiedSearchResult) => {
    if (result.type === "local" && result.fileId) {
      return connectedFileIds.includes(result.fileId);
    }
    return false;
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-[900px] h-[700px] p-0 gap-0 flex flex-col">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>Connect File to Transaction</DialogTitle>
          {transactionInfo && (
            <p className="text-sm text-muted-foreground">
              {format(transactionInfo.date, "MMM d, yyyy")} &middot;{" "}
              <span className={transactionInfo.amount < 0 ? "text-red-600" : "text-green-600"}>
                {new Intl.NumberFormat("de-DE", {
                  style: "currency",
                  currency: transactionInfo.currency,
                }).format(transactionInfo.amount / 100)}
              </span>
              {transactionInfo.partner && ` · ${transactionInfo.partner}`}
            </p>
          )}
        </DialogHeader>

        <Tabs defaultValue="files" className="flex flex-col flex-1 min-h-0">
          <div className="border-b shrink-0">
            <TabsList className="h-10 w-full grid grid-cols-3 rounded-none">
              <TabsTrigger value="files" className="gap-2">
                <HardDrive className="h-4 w-4" />
                Files
              </TabsTrigger>
              <TabsTrigger value="gmail-attachments" className="gap-2">
                <Paperclip className="h-4 w-4" />
                Gmail Attachments
              </TabsTrigger>
              <TabsTrigger value="email-to-pdf" className="gap-2">
                <Mail className="h-4 w-4" />
                Email to PDF
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Files Tab - Local file search */}
          <TabsContent value="files" className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden data-[state=active]:flex data-[state=active]:flex-col" forceMount>
            <div className="flex flex-1 min-h-0">
              {/* Left column: Search and results */}
              <div className="w-[350px] shrink-0 border-r flex flex-col min-h-0">
            {/* Search */}
            <div className="p-4 border-b space-y-3">
              {/* Query source indicator */}
              {querySource && (
                <div className="flex items-center gap-1.5 text-xs">
                  {querySource === "learned" && (
                    <Badge variant="secondary" className="gap-1 text-green-600 bg-green-50">
                      <BookmarkCheck className="h-3 w-3" />
                      Learned pattern
                    </Badge>
                  )}
                  {querySource === "ai" && (
                    <Badge variant="secondary" className="gap-1 text-purple-600 bg-purple-50">
                      <Sparkles className="h-3 w-3" />
                      AI suggested
                    </Badge>
                  )}
                  {querySource === "simple" && (
                    <Badge variant="outline" className="gap-1 text-muted-foreground">
                      Auto-extracted
                    </Badge>
                  )}
                </div>
              )}

              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search uploaded files..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setQuerySource(null); // Clear source when user types
                  }}
                  onKeyDown={handleKeyDown}
                  className="pl-9"
                />
                {isGeneratingQuery && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>

              {/* Date range */}
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="flex-1 justify-start text-xs">
                      <Calendar className="h-3 w-3 mr-1" />
                      {dateFrom ? format(dateFrom, "MMM d, yyyy") : "From"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={dateFrom}
                      onSelect={setDateFrom}
                      defaultMonth={dateFrom || transactionInfo?.date}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                {dateFrom && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setDateFrom(undefined)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="flex-1 justify-start text-xs">
                      <Calendar className="h-3 w-3 mr-1" />
                      {dateTo ? format(dateTo, "MMM d, yyyy") : "To"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={dateTo}
                      onSelect={setDateTo}
                      defaultMonth={dateTo || transactionInfo?.date}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                {dateTo && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setDateTo(undefined)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>

              <Button onClick={handleSearch} disabled={loading} className="w-full">
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Search className="h-4 w-4 mr-2" />
                )}
                Search
              </Button>
            </div>

            {/* Error */}
            {error && (
              <div className="px-4 py-2 text-sm text-red-600 bg-red-50 border-b">
                {error}
              </div>
            )}

            {/* Results */}
            <ScrollArea className="flex-1">
              {!hasSearched ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Search for files or Gmail attachments</p>
                </div>
              ) : results.length === 0 && !loading ? (
                <div className="p-8 text-center text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No files found</p>
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {results.map((result) => {
                    const isConnected = isFileConnected(result);
                    const isSelected = selectedResult?.id === result.id;
                    const isPdf = result.mimeType === "application/pdf";
                    const isLocal = result.type === "local";

                    return (
                      <button
                        key={result.id}
                        type="button"
                        disabled={isConnected}
                        onClick={() => setSelectedResult(result)}
                        className={cn(
                          "w-full flex items-start gap-3 p-3 rounded-md text-left transition-colors",
                          isSelected && "bg-primary/10 ring-1 ring-primary",
                          !isSelected && !isConnected && "hover:bg-muted",
                          isConnected && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        {/* Source and type indicator */}
                        <div className="flex-shrink-0 w-10 h-10 rounded bg-muted flex items-center justify-center relative">
                          {isPdf ? (
                            <FileText className="h-5 w-5 text-red-500" />
                          ) : (
                            <Image className="h-5 w-5 text-blue-500" />
                          )}
                          {/* Source badge */}
                          <div
                            className={cn(
                              "absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center",
                              isLocal ? "bg-slate-600" : "bg-red-500"
                            )}
                          >
                            {isLocal ? (
                              <HardDrive className="h-2.5 w-2.5 text-white" />
                            ) : (
                              <Mail className="h-2.5 w-2.5 text-white" />
                            )}
                          </div>
                        </div>

                        {/* File info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{result.filename}</p>
                            {isConnected && (
                              <Badge variant="secondary" className="text-xs">
                                <Link2 className="h-3 w-3 mr-1" />
                                Connected
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {result.date && (
                              <span>{format(result.date, "MMM d, yyyy")}</span>
                            )}
                            {result.amount && (
                              <>
                                <span>·</span>
                                <span>{formatAmount(result.amount, result.currency)}</span>
                              </>
                            )}
                            {result.score > 0 && (
                              <>
                                <span>·</span>
                                <Badge variant="outline" className="text-xs py-0 h-4">
                                  {result.score}%
                                </Badge>
                              </>
                            )}
                          </div>
                          {result.partner && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {result.partner}
                            </p>
                          )}
                          {result.matchReasons.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {result.matchReasons.slice(0, 2).map((reason, i) => (
                                <Badge key={i} variant="secondary" className="text-xs py-0 h-4 text-green-600">
                                  {reason}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Selection indicator */}
                        {isSelected && (
                          <Check className="h-4 w-4 text-primary flex-shrink-0 mt-1" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>

              {/* Right column: Preview */}
              <div className="flex-1 flex flex-col min-h-0 min-w-0">
            {selectedResult ? (
              <>
                {/* Preview */}
                <div className="flex-1 overflow-hidden">
                  <FilePreview
                    downloadUrl={selectedResult.previewUrl}
                    fileType={selectedResult.mimeType}
                    fileName={selectedResult.filename}
                    fullSize
                  />
                </div>

                {/* Selected file info */}
                <div className="border-t p-4 bg-muted/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant={selectedResult.type === "local" ? "secondary" : "destructive"}>
                      {selectedResult.type === "local" ? (
                        <>
                          <HardDrive className="h-3 w-3 mr-1" />
                          Local File
                        </>
                      ) : (
                        <>
                          <Mail className="h-3 w-3 mr-1" />
                          Gmail
                        </>
                      )}
                    </Badge>
                    <h4 className="font-medium text-sm truncate flex-1">
                      {selectedResult.filename}
                    </h4>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Date:</span>{" "}
                      {selectedResult.date
                        ? format(selectedResult.date, "MMM d, yyyy")
                        : "—"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Amount:</span>{" "}
                      {formatAmount(selectedResult.amount, selectedResult.currency) || "—"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">From:</span>{" "}
                      {selectedResult.partner || "—"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Size:</span>{" "}
                      {Math.round(selectedResult.size / 1024)} KB
                    </div>
                  </div>
                  {selectedResult.type === "gmail" && selectedResult.emailSubject && (
                    <p className="text-xs text-muted-foreground mt-2 truncate">
                      Subject: {selectedResult.emailSubject}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Select a file to preview</p>
                </div>
              </div>
            )}
              </div>
            </div>

            {/* Footer for Files tab */}
            <div className="border-t p-4 flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleSelect} disabled={!selectedResult || isConnecting}>
                {isConnecting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  "Connect File"
                )}
              </Button>
            </div>
          </TabsContent>

          {/* Gmail Attachments Tab */}
          <TabsContent value="gmail-attachments" className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden data-[state=active]:flex data-[state=active]:flex-col" forceMount>
            <div className="flex-1 min-h-0">
              <GmailAttachmentsTab
                transactionInfo={transactionInfo ? {
                  name: transactionInfo.name || transactionInfo.partner || "",
                  partner: transactionInfo.partner,
                  amount: transactionInfo.amount,
                  date: transactionInfo.date,
                  partnerId: transactionInfo.partnerId,
                } : undefined}
                onFileCreated={async (fileId) => {
                  await onSelect(fileId, { sourceType: "gmail" });
                  onClose();
                }}
              />
            </div>
          </TabsContent>

          {/* Email to PDF Tab */}
          <TabsContent value="email-to-pdf" className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden data-[state=active]:flex data-[state=active]:flex-col" forceMount>
            <div className="flex-1 min-h-0">
              <EmailInvoiceTab
                transactionInfo={transactionInfo ? {
                  name: transactionInfo.name || transactionInfo.partner || "",
                  partner: transactionInfo.partner,
                  amount: transactionInfo.amount,
                  date: transactionInfo.date,
                  partnerId: transactionInfo.partnerId,
                } : undefined}
                onFileCreated={async (fileId) => {
                  await onSelect(fileId, { sourceType: "gmail" });
                  onClose();
                }}
              />
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
