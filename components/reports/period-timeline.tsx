"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, query, where, orderBy, getDocs, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { cn } from "@/lib/utils";
import { ReportPeriod } from "@/types/report";
import { Skeleton } from "@/components/ui/skeleton";

interface PeriodData {
  year: number;
  period: number; // 1-12 for months, 1-4 for quarters
  income: number;
  expense: number;
  balance: number; // income - expense (positive = profit, negative = loss)
  transactionCount: number;
}

interface PeriodTimelineProps {
  userId: string;
  periodType: "monthly" | "quarterly";
  selectedPeriod: ReportPeriod;
  onSelectPeriod: (period: ReportPeriod) => void;
}

export function PeriodTimeline({
  userId,
  periodType,
  selectedPeriod,
  onSelectPeriod,
}: PeriodTimelineProps) {
  const [data, setData] = useState<PeriodData[]>([]);
  const [loading, setLoading] = useState(true);

  // Load all transactions and aggregate by period
  useEffect(() => {
    if (!userId) return;

    const loadData = async () => {
      setLoading(true);
      try {
        const q = query(
          collection(db, "transactions"),
          where("userId", "==", userId),
          orderBy("date", "asc")
        );

        const snapshot = await getDocs(q);
        const transactions = snapshot.docs.map((doc) => doc.data());

        // Aggregate by period
        const periodMap = new Map<string, PeriodData>();

        for (const tx of transactions) {
          const date = tx.date instanceof Timestamp ? tx.date.toDate() : new Date(tx.date);
          const year = date.getFullYear();
          const month = date.getMonth() + 1;
          const period = periodType === "monthly" ? month : Math.ceil(month / 3);
          const key = `${year}-${period}`;

          const existing = periodMap.get(key) || {
            year,
            period,
            income: 0,
            expense: 0,
            balance: 0,
            transactionCount: 0,
          };

          const amount = tx.amount || 0;
          if (amount > 0) {
            existing.income += amount;
          } else {
            existing.expense += Math.abs(amount);
          }
          existing.balance = existing.income - existing.expense;
          existing.transactionCount += 1;

          periodMap.set(key, existing);
        }

        setData(Array.from(periodMap.values()));
      } catch (error) {
        console.error("Error loading timeline data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [userId, periodType]);

  // Generate periods - show full years for any year that has transactions
  const allPeriods = useMemo(() => {
    if (data.length === 0) return [];

    // Find all years that have any transactions
    const yearsWithData = new Set<number>();
    for (const d of data) {
      if (d.transactionCount > 0) {
        yearsWithData.add(d.year);
      }
    }

    if (yearsWithData.size === 0) return [];

    // Generate all periods for those years
    const periods: { year: number; period: number; key: string }[] = [];
    const periodsPerYear = periodType === "monthly" ? 12 : 4;
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const currentPeriod = periodType === "monthly" ? currentMonth : Math.ceil(currentMonth / 3);

    const sortedYears = Array.from(yearsWithData).sort((a, b) => a - b);

    for (const year of sortedYears) {
      for (let p = 1; p <= periodsPerYear; p++) {
        // Don't show current or future periods
        if (year === currentYear && p >= currentPeriod) continue;
        if (year > currentYear) continue;
        periods.push({ year, period: p, key: `${year}-${p}` });
      }
    }

    return periods;
  }, [data, periodType]);

  // Create lookup map for data
  const dataMap = useMemo(() => {
    const map = new Map<string, PeriodData>();
    for (const d of data) {
      map.set(`${d.year}-${d.period}`, d);
    }
    return map;
  }, [data]);

  // Find max absolute balance for scaling
  const maxAbsBalance = useMemo(() => {
    let max = 0;
    for (const d of data) {
      max = Math.max(max, Math.abs(d.balance));
    }
    return max || 1; // Avoid division by zero
  }, [data]);

  // Group periods by year for display
  const periodsByYear = useMemo(() => {
    const byYear = new Map<number, { year: number; period: number; key: string }[]>();
    for (const p of allPeriods) {
      const existing = byYear.get(p.year) || [];
      existing.push(p);
      byYear.set(p.year, existing);
    }
    return byYear;
  }, [allPeriods]);

  if (loading) {
    return <Skeleton className="h-24 w-full" />;
  }

  const barHeight = 40; // Max height for bars (up or down)
  const totalHeight = barHeight * 2 + 20; // Up + down + labels

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex" style={{ minWidth: allPeriods.length * 12 }}>
        {Array.from(periodsByYear.entries()).map(([year, periods]) => (
          <div key={year} className="flex flex-col">
            {/* Bars */}
            <div className="flex items-end" style={{ height: totalHeight }}>
              {periods.map((p) => {
                const periodData = dataMap.get(p.key);
                const balance = periodData?.balance || 0;
                const barPercent = Math.abs(balance) / maxAbsBalance;
                const barPx = Math.max(1, barPercent * barHeight);
                const isSelected =
                  selectedPeriod.year === p.year && selectedPeriod.period === p.period;
                const hasData = periodData && periodData.transactionCount > 0;

                return (
                  <div
                    key={p.key}
                    className={cn(
                      "flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors",
                      isSelected && "bg-muted"
                    )}
                    style={{ width: 12, height: totalHeight }}
                    onClick={() =>
                      onSelectPeriod({ year: p.year, period: p.period, type: periodType })
                    }
                    title={`${periodType === "monthly" ? `${p.period}/${p.year}` : `Q${p.period}/${p.year}`}: ${hasData ? `${(balance / 100).toLocaleString("de-AT")} EUR` : "No data"}`}
                  >
                    {/* Upper half (positive/profit) */}
                    <div
                      className="w-full flex items-end justify-center"
                      style={{ height: barHeight }}
                    >
                      {balance > 0 && (
                        <div
                          className={cn(
                            "w-2 bg-green-500",
                            isSelected && "bg-green-600"
                          )}
                          style={{ height: barPx }}
                        />
                      )}
                    </div>
                    {/* Center line */}
                    <div className="w-full h-px bg-border" />
                    {/* Lower half (negative/loss) */}
                    <div
                      className="w-full flex items-start justify-center"
                      style={{ height: barHeight }}
                    >
                      {balance < 0 && (
                        <div
                          className={cn(
                            "w-2 bg-red-500",
                            isSelected && "bg-red-600"
                          )}
                          style={{ height: barPx }}
                        />
                      )}
                      {balance === 0 && hasData && (
                        <div className="w-2 h-1 bg-muted-foreground/30" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Year label */}
            <div
              className={cn(
                "text-xs text-center border-l border-border pt-1",
                selectedPeriod.year === year ? "font-bold bg-muted" : "text-muted-foreground"
              )}
              style={{ width: periods.length * 12 }}
            >
              {year}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
