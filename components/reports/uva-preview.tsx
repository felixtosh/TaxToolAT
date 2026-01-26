"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { UVAReport, ReportPeriod, formatPeriod } from "@/types/report";
import { TaxCountryCode } from "@/types/user-data";

interface UVAPreviewProps {
  report: Omit<UVAReport, "id" | "createdAt" | "updatedAt">;
  period: ReportPeriod;
  country: TaxCountryCode;
}

function formatAmount(cents: number): string {
  return (cents / 100).toLocaleString("de-AT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function KennzahlRow({
  kz,
  label,
  amount,
  isSubtotal = false,
  isTotal = false,
  isNegative = false,
}: {
  kz: string;
  label: string;
  amount: number;
  isSubtotal?: boolean;
  isTotal?: boolean;
  isNegative?: boolean;
}) {
  const displayAmount = isNegative ? -amount : amount;
  const isPositiveBalance = displayAmount > 0;
  const isNegativeBalance = displayAmount < 0;

  return (
    <div
      className={cn(
        "flex items-center gap-4 py-2 px-3 rounded",
        isTotal && "bg-muted font-semibold",
        isSubtotal && "font-medium"
      )}
    >
      <span className="w-16 font-mono text-xs text-muted-foreground">{kz}</span>
      <span className="flex-1 text-sm">{label}</span>
      <span
        className={cn(
          "font-mono text-sm tabular-nums",
          isTotal && (isPositiveBalance ? "text-amount-negative" : "text-amount-positive")
        )}
      >
        {displayAmount !== 0 ? formatAmount(displayAmount) : "-"} EUR
      </span>
    </div>
  );
}

export function UVAPreview({ report, period, country }: UVAPreviewProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>UVA Preview</CardTitle>
            <CardDescription>
              Umsatzsteuervoranmeldung for {formatPeriod(period)}
            </CardDescription>
          </div>
          <Badge variant="outline">{country}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Revenue Section */}
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Revenue (Umsätze)
          </h3>

          {/* 20% Rate */}
          {(report.taxableRevenue.rate20Net > 0 || report.taxableRevenue.rate20Vat > 0) && (
            <>
              <KennzahlRow
                kz="KZ 000"
                label="Taxable revenue at 20% (net)"
                amount={report.taxableRevenue.rate20Net}
              />
              <KennzahlRow
                kz="KZ 001"
                label="VAT at 20%"
                amount={report.taxableRevenue.rate20Vat}
              />
            </>
          )}

          {/* 13% Rate */}
          {(report.taxableRevenue.rate13Net > 0 || report.taxableRevenue.rate13Vat > 0) && (
            <>
              <KennzahlRow
                kz="KZ 029"
                label="Taxable revenue at 13% (net)"
                amount={report.taxableRevenue.rate13Net}
              />
              <KennzahlRow
                kz="KZ 008"
                label="VAT at 13%"
                amount={report.taxableRevenue.rate13Vat}
              />
            </>
          )}

          {/* 10% Rate */}
          {(report.taxableRevenue.rate10Net > 0 || report.taxableRevenue.rate10Vat > 0) && (
            <>
              <KennzahlRow
                kz="KZ 006"
                label="Taxable revenue at 10% (net)"
                amount={report.taxableRevenue.rate10Net}
              />
              <KennzahlRow
                kz="KZ 007"
                label="VAT at 10%"
                amount={report.taxableRevenue.rate10Vat}
              />
            </>
          )}

          {/* Exempt Revenue */}
          {(report.exemptRevenue.exports > 0 ||
            report.exemptRevenue.euDeliveries > 0 ||
            report.exemptRevenue.other > 0) && (
            <>
              <Separator className="my-2" />
              <h4 className="text-xs font-medium text-muted-foreground px-3">Tax-Exempt Revenue</h4>
              {report.exemptRevenue.exports > 0 && (
                <KennzahlRow
                  kz="KZ 011"
                  label="Export deliveries (Ausfuhrlieferungen)"
                  amount={report.exemptRevenue.exports}
                />
              )}
              {report.exemptRevenue.euDeliveries > 0 && (
                <KennzahlRow
                  kz="KZ 017"
                  label="EU deliveries (innergemeinschaftliche Lieferungen)"
                  amount={report.exemptRevenue.euDeliveries}
                />
              )}
              {report.exemptRevenue.other > 0 && (
                <KennzahlRow
                  kz="KZ 019"
                  label="Other exempt revenue"
                  amount={report.exemptRevenue.other}
                />
              )}
            </>
          )}
        </div>

        <Separator />

        {/* EU Acquisitions */}
        {(report.euAcquisitions.netAmount > 0 || report.euAcquisitions.vatAmount > 0) && (
          <>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                EU Acquisitions (Innergemeinschaftliche Erwerbe)
              </h3>
              <KennzahlRow
                kz="KZ 070"
                label="EU acquisitions (net)"
                amount={report.euAcquisitions.netAmount}
              />
              <KennzahlRow
                kz="KZ 071"
                label="VAT on EU acquisitions"
                amount={report.euAcquisitions.vatAmount}
              />
            </div>
            <Separator />
          </>
        )}

        {/* Input VAT Section */}
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Input VAT (Vorsteuer)
          </h3>
          <KennzahlRow
            kz="KZ 060"
            label="Input VAT from invoices"
            amount={report.inputVat.standard}
          />
          {report.inputVat.euAcquisitions > 0 && (
            <KennzahlRow
              kz="KZ 061"
              label="Input VAT from EU acquisitions"
              amount={report.inputVat.euAcquisitions}
            />
          )}
          {report.inputVat.imports > 0 && (
            <KennzahlRow
              kz="KZ 083"
              label="Input VAT from imports"
              amount={report.inputVat.imports}
            />
          )}
        </div>

        <Separator />

        {/* Totals */}
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Calculation
          </h3>
          <KennzahlRow
            kz="KZ 095"
            label="Total VAT payable"
            amount={report.totalVatPayable}
            isSubtotal
          />
          <KennzahlRow
            kz="KZ 090"
            label="Total deductible input VAT"
            amount={report.totalInputVat}
            isSubtotal
            isNegative
          />
          <Separator className="my-2" />
          <KennzahlRow
            kz="KZ 096"
            label={report.vatBalance >= 0 ? "VAT payable (Zahllast)" : "VAT refund (Gutschrift)"}
            amount={report.vatBalance}
            isTotal
          />
        </div>

        {/* Summary */}
        <div
          className={cn(
            "p-4 rounded-lg text-center",
            report.vatBalance >= 0 ? "bg-red-50 border border-red-200" : "bg-green-50 border border-green-200"
          )}
        >
          <p className="text-sm text-muted-foreground mb-1">
            {report.vatBalance >= 0 ? "Amount to pay" : "Amount to be refunded"}
          </p>
          <p
            className={cn(
              "text-2xl font-bold",
              report.vatBalance >= 0 ? "text-amount-negative" : "text-amount-positive"
            )}
          >
            {formatAmount(Math.abs(report.vatBalance))} EUR
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
