"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { collection, query, orderBy, onSnapshot, where, limit, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { AIUsageRecord, AIUsageSummary, AIUsageDailyStats, AIFunction, AI_MODEL_PRICING } from "@/types/ai-usage";
import {
  OperationsContext,
  getAIUsageSummary,
  getAIUsageDailyStats,
  getAIUsageByFunction,
} from "@/lib/operations";
import { useAuth } from "@/components/auth";

const MAX_RECORDS = 100;

export function useAIUsage(options?: { dateRange?: "7d" | "30d" | "all" }) {
  const { userId } = useAuth();
  const [records, setRecords] = useState<AIUsageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const dateRange = options?.dateRange || "30d";

  // Create operations context
  const ctx: OperationsContext = useMemo(
    () => ({
      db,
      userId: userId ?? "",
    }),
    [userId]
  );

  // Calculate date filter
  const dateFrom = useMemo(() => {
    if (dateRange === "all") return undefined;
    const days = dateRange === "7d" ? 7 : 30;
    const d = new Date();
    d.setDate(d.getDate() - days);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [dateRange]);

  // Real-time listener for recent usage records
  useEffect(() => {
    if (!userId) {
      setRecords([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    let q = query(
      collection(db, "aiUsage"),
      where("userId", "==", userId),
      orderBy("createdAt", "desc"),
      limit(MAX_RECORDS)
    );

    if (dateFrom) {
      q = query(
        collection(db, "aiUsage"),
        where("userId", "==", userId),
        where("createdAt", ">=", Timestamp.fromDate(dateFrom)),
        orderBy("createdAt", "desc"),
        limit(MAX_RECORDS)
      );
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as AIUsageRecord[];

        setRecords(data);
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching AI usage:", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId, dateFrom]);

  // Calculate summary from records
  const summary: AIUsageSummary = useMemo(() => {
    const result: AIUsageSummary = {
      totalCalls: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0,
      byFunction: {
        chat: { calls: 0, inputTokens: 0, outputTokens: 0, cost: 0 },
        companyLookup: { calls: 0, inputTokens: 0, outputTokens: 0, cost: 0 },
        companyLookupSearch: { calls: 0, inputTokens: 0, outputTokens: 0, cost: 0 },
        patternLearning: { calls: 0, inputTokens: 0, outputTokens: 0, cost: 0 },
        columnMatching: { calls: 0, inputTokens: 0, outputTokens: 0, cost: 0 },
        extraction: { calls: 0, inputTokens: 0, outputTokens: 0, cost: 0 },
        classification: { calls: 0, inputTokens: 0, outputTokens: 0, cost: 0 },
      },
      byModel: {},
    };

    for (const record of records) {
      result.totalCalls++;
      result.totalInputTokens += record.inputTokens;
      result.totalOutputTokens += record.outputTokens;
      result.totalCost += record.estimatedCost;

      // By function
      const fn = record.function;
      if (result.byFunction[fn]) {
        result.byFunction[fn].calls++;
        result.byFunction[fn].inputTokens += record.inputTokens;
        result.byFunction[fn].outputTokens += record.outputTokens;
        result.byFunction[fn].cost += record.estimatedCost;
      }

      // By model
      if (!result.byModel[record.model]) {
        result.byModel[record.model] = { calls: 0, inputTokens: 0, outputTokens: 0, cost: 0 };
      }
      result.byModel[record.model].calls++;
      result.byModel[record.model].inputTokens += record.inputTokens;
      result.byModel[record.model].outputTokens += record.outputTokens;
      result.byModel[record.model].cost += record.estimatedCost;
    }

    return result;
  }, [records]);

  // Calculate daily stats for charts
  const dailyStats: AIUsageDailyStats[] = useMemo(() => {
    const days = dateRange === "7d" ? 7 : 30;
    const dailyMap = new Map<string, AIUsageDailyStats>();

    // Initialize all days
    for (let i = 0; i <= days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (days - i));
      const dateStr = d.toISOString().split("T")[0];
      dailyMap.set(dateStr, {
        date: dateStr,
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
      });
    }

    // Aggregate records
    for (const record of records) {
      const dateStr = record.createdAt.toDate().toISOString().split("T")[0];
      const day = dailyMap.get(dateStr);
      if (day) {
        day.calls++;
        day.inputTokens += record.inputTokens;
        day.outputTokens += record.outputTokens;
        day.cost += record.estimatedCost;
      }
    }

    return Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [records, dateRange]);

  // Get function breakdown for charts
  const functionBreakdown = useMemo(() => {
    return (Object.entries(summary.byFunction) as [AIFunction, typeof summary.byFunction.chat][])
      .map(([fn, stats]) => ({
        function: fn,
        name: formatFunctionName(fn),
        calls: stats.calls,
        cost: stats.cost,
      }))
      .filter((item) => item.calls > 0)
      .sort((a, b) => b.calls - a.calls);
  }, [summary]);

  return {
    records,
    summary,
    dailyStats,
    functionBreakdown,
    loading,
    error,
  };
}

// Helper function
function formatFunctionName(fn: AIFunction): string {
  const names: Record<AIFunction, string> = {
    chat: "Chat",
    companyLookup: "Company Lookup",
    companyLookupSearch: "Company Search",
    patternLearning: "Pattern Learning",
    columnMatching: "Column Matching",
    extraction: "File Extraction",
    classification: "Classification",
  };
  return names[fn] || fn;
}
