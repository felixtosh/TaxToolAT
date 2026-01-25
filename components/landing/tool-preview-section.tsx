"use client";

import { useTranslations } from "next-intl";
import { ToolPreviewCard } from "./tool-preview-card";
import { Receipt, FileText, Mail } from "lucide-react";

export function ToolPreviewSection() {
  const t = useTranslations("landing.toolPreviews");

  return (
    <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl w-full px-4">
      {/* Transactions Preview */}
      <div className="space-y-3 animate-float-slow">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Receipt className="h-4 w-4" />
          <span>{t("transactions.title")}</span>
        </div>
        <ToolPreviewCard type="transactions" />
      </div>

      {/* Files Preview */}
      <div className="space-y-3 animate-float-medium">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <FileText className="h-4 w-4" />
          <span>{t("files.title")}</span>
        </div>
        <ToolPreviewCard type="files" />
      </div>

      {/* Gmail Preview */}
      <div className="space-y-3 animate-float-fast">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Mail className="h-4 w-4" />
          <span>{t("gmail.title")}</span>
        </div>
        <ToolPreviewCard type="gmail" />
      </div>
    </div>
  );
}
