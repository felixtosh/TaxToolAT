"use client";

import { cn } from "@/lib/utils";
import {
  FileCheck,
  FileX,
  FileText,
  Mail,
  Check,
  Paperclip,
} from "lucide-react";

type ToolType = "transactions" | "files" | "gmail";

interface ToolPreviewCardProps {
  type: ToolType;
  className?: string;
}

// Fake data for previews
const FAKE_TRANSACTIONS = [
  {
    date: "15.01.2026",
    name: "REWE Markt",
    partner: "REWE Group",
    amount: -4523,
    hasReceipt: true,
  },
  {
    date: "14.01.2026",
    name: "Amazon.de",
    partner: "Amazon EU",
    amount: -12999,
    hasReceipt: true,
  },
  {
    date: "13.01.2026",
    name: "Gehalt Januar",
    partner: "Arbeitgeber GmbH",
    amount: 350000,
    hasReceipt: false,
  },
];

const FAKE_FILES = [
  {
    date: "15.01.26",
    name: "Rechnung_2026_001.pdf",
    partner: "REWE Group",
    amount: -4523,
  },
  {
    date: "12.01.26",
    name: "Amazon_Invoice.pdf",
    partner: "Amazon EU",
    amount: -12999,
  },
  {
    date: "10.01.26",
    name: "Telefonrechnung.pdf",
    partner: "Telekom",
    amount: -3999,
  },
];

const FAKE_EMAILS = [
  { filename: "Invoice_2026_01.pdf", date: "15.01.26", score: 92, downloaded: true },
  {
    filename: "Bestellung_Bestatigung.pdf",
    date: "14.01.26",
    score: 78,
    downloaded: false,
  },
  { filename: "Rechnung_Amazon.pdf", date: "12.01.26", score: 85, downloaded: true },
];

export function ToolPreviewCard({ type, className }: ToolPreviewCardProps) {
  const formatAmount = (amount: number) => {
    const euros = amount / 100;
    return euros.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  };

  if (type === "transactions") {
    return (
      <div
        className={cn(
          "rounded-md border text-xs overflow-hidden bg-card shadow-lg",
          className
        )}
      >
        <div className="bg-muted/50 grid grid-cols-[auto_1fr_auto_auto] gap-2 px-2 py-1.5 border-b">
          <span className="font-medium text-muted-foreground w-[70px]">
            Date
          </span>
          <span className="font-medium text-muted-foreground">Name</span>
          <span className="font-medium text-muted-foreground text-right w-[80px]">
            Amount
          </span>
          <span className="w-5"></span>
        </div>
        <div className="divide-y divide-muted/50">
          {FAKE_TRANSACTIONS.map((t, i) => (
            <div
              key={i}
              className="grid grid-cols-[auto_1fr_auto_auto] gap-2 px-2 py-2 items-center"
            >
              <span className="text-muted-foreground w-[70px]">{t.date}</span>
              <div className="min-w-0 overflow-hidden">
                <span className="truncate block">{t.name}</span>
                <span className="text-[10px] text-muted-foreground truncate block">
                  {t.partner}
                </span>
              </div>
              <span
                className={cn(
                  "text-right tabular-nums w-[80px]",
                  t.amount < 0 ? "text-amount-negative" : "text-amount-positive"
                )}
              >
                {formatAmount(t.amount)}
              </span>
              <div className="w-5 flex justify-center">
                {t.hasReceipt ? (
                  <FileCheck className="h-3.5 w-3.5 text-green-600" />
                ) : (
                  <FileX className="h-3.5 w-3.5 text-muted-foreground/50" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === "files") {
    return (
      <div
        className={cn(
          "rounded-md border text-xs overflow-hidden bg-card shadow-lg",
          className
        )}
      >
        <div className="bg-muted/50 grid grid-cols-[70px_1fr_70px] gap-2 px-2 py-1.5 border-b">
          <span className="font-medium text-muted-foreground">Date</span>
          <span className="font-medium text-muted-foreground">Name</span>
          <span className="font-medium text-muted-foreground text-right">
            Amount
          </span>
        </div>
        <div className="divide-y divide-muted/50">
          {FAKE_FILES.map((f, i) => (
            <div
              key={i}
              className="grid grid-cols-[70px_1fr_70px] gap-2 px-2 py-2 items-center"
            >
              <span className="text-muted-foreground">{f.date}</span>
              <div className="min-w-0 overflow-hidden flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <span className="truncate block">{f.name}</span>
                  <span className="text-[10px] text-muted-foreground truncate block">
                    {f.partner}
                  </span>
                </div>
              </div>
              <span
                className={cn(
                  "text-right tabular-nums",
                  f.amount < 0 ? "text-amount-negative" : "text-amount-positive"
                )}
              >
                {formatAmount(f.amount)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Gmail type
  return (
    <div
      className={cn(
        "rounded-md border text-xs overflow-hidden bg-card shadow-lg",
        className
      )}
    >
      <div className="bg-muted/50 px-3 py-2 flex items-center justify-between border-b">
        <div className="flex items-center gap-2">
          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium text-sm">Gmail Attachments</span>
        </div>
        <span className="text-muted-foreground">3 found</span>
      </div>
      <div className="divide-y divide-muted/50">
        {FAKE_EMAILS.map((e, i) => (
          <div key={i} className="flex items-center gap-2 px-2.5 py-1.5">
            {e.downloaded ? (
              <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />
            ) : (
              <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
            <span className="text-xs font-medium truncate flex-1 min-w-0">
              {e.filename}
            </span>
            <span className="text-[10px] text-muted-foreground shrink-0">
              {e.date}
            </span>
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full shrink-0",
                e.score >= 90
                  ? "bg-green-100 text-green-700"
                  : e.score >= 70
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-gray-100 text-gray-700"
              )}
            >
              {e.score}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
