"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
  FileText,
  Image,
  Link2,
  ExternalLink,
  Unlink,
  Upload,
  Loader2,
} from "lucide-react";
import { Transaction } from "@/types/transaction";
import { TaxFile } from "@/types/file";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ConnectFileDialog } from "@/components/files/connect-file-dialog";
import { useTransactionFiles } from "@/hooks/use-files";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface TransactionFilesSectionProps {
  transaction: Transaction;
}

export function TransactionFilesSection({ transaction }: TransactionFilesSectionProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { files, loading, connectFile, disconnectFile } = useTransactionFiles(transaction.id);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const handleConnect = async (fileId: string) => {
    await connectFile(fileId);
  };

  const handleDisconnect = async (fileId: string) => {
    setDisconnecting(fileId);
    try {
      await disconnectFile(fileId);
    } finally {
      setDisconnecting(null);
    }
  };

  const formatAmount = (amount: number | null | undefined, currency: string | null | undefined) => {
    if (amount == null) return null;
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: currency || "EUR",
    }).format(amount / 100);
  };

  return (
    <TooltipProvider>
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Files</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsDialogOpen(true)}
          className="h-7 px-2"
        >
          <Link2 className="h-3.5 w-3.5 mr-1.5" />
          Connect File
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : files.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-4 border rounded-md bg-muted/30">
          No files connected
        </div>
      ) : (
        <ScrollArea className="max-h-[200px]">
          <div className="space-y-2">
            {files.map((file) => {
              const isPdf = file.fileType === "application/pdf";
              const isImage = file.fileType.startsWith("image/");

              return (
                <div
                  key={file.id}
                  className="flex items-start gap-3 p-2 border rounded-md hover:bg-muted/50 group"
                >
                  {/* Thumbnail */}
                  <div className="flex-shrink-0 w-10 h-10 rounded bg-muted flex items-center justify-center overflow-hidden">
                    {file.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={file.thumbnailUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : isPdf ? (
                      <FileText className="h-5 w-5 text-red-500" />
                    ) : isImage ? (
                      <Image className="h-5 w-5 text-blue-500" />
                    ) : (
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>

                  {/* File info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.fileName}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {file.extractedDate ? (
                        <span>{format(file.extractedDate.toDate(), "MMM d, yyyy")}</span>
                      ) : (
                        <span>{format(file.uploadedAt.toDate(), "MMM d, yyyy")}</span>
                      )}
                      {file.extractedAmount && (
                        <>
                          <span>&middot;</span>
                          <span>{formatAmount(file.extractedAmount, file.extractedCurrency)}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                          <Link href={`/files?id=${file.id}`}>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>View file</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDisconnect(file.id)}
                          disabled={disconnecting === file.id}
                        >
                          {disconnecting === file.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Unlink className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Disconnect file</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}

      {/* Connect file dialog */}
      <ConnectFileDialog
        open={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onSelect={handleConnect}
        connectedFileIds={files.map((f) => f.id)}
        transactionInfo={{
          date: transaction.date.toDate(),
          amount: transaction.amount,
          currency: transaction.currency,
          partner: transaction.partner || undefined,
        }}
      />
    </div>
    </TooltipProvider>
  );
}
