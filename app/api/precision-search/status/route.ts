import { NextRequest, NextResponse } from "next/server";
import { getServerDb } from "@/lib/firebase/config-server";
import { getServerUserIdWithFallback } from "@/lib/auth/get-server-user";
import {
  getPrecisionSearchQueueItem,
  getTransactionSearchHistory,
} from "@/lib/operations";

const db = getServerDb();

/**
 * GET /api/precision-search/status
 * Get precision search status and history
 *
 * Query params:
 *   - queueId: Get status of a specific queue item
 *   - transactionId: Get search history for a specific transaction
 *
 * Returns: {
 *   queueItem?: PrecisionSearchQueueItem;
 *   history?: TransactionSearchEntry[];
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getServerUserIdWithFallback(request);
    const queueId = request.nextUrl.searchParams.get("queueId");
    const transactionId = request.nextUrl.searchParams.get("transactionId");

    if (!queueId && !transactionId) {
      return NextResponse.json(
        { error: "Either queueId or transactionId is required" },
        { status: 400 }
      );
    }

    const ctx = { db, userId };
    const result: Record<string, unknown> = {};

    // Get queue item if requested
    if (queueId) {
      const queueItem = await getPrecisionSearchQueueItem(ctx, queueId);
      if (!queueItem) {
        return NextResponse.json(
          { error: "Queue item not found" },
          { status: 404 }
        );
      }
      result.queueItem = {
        id: queueItem.id,
        status: queueItem.status,
        scope: queueItem.scope,
        triggeredBy: queueItem.triggeredBy,
        progress: queueItem.transactionsToProcess > 0
          ? Math.round((queueItem.transactionsProcessed / queueItem.transactionsToProcess) * 100)
          : 0,
        transactionsProcessed: queueItem.transactionsProcessed,
        transactionsToProcess: queueItem.transactionsToProcess,
        transactionsWithMatches: queueItem.transactionsWithMatches,
        totalFilesConnected: queueItem.totalFilesConnected,
        errors: queueItem.errors,
        lastError: queueItem.lastError,
        createdAt: queueItem.createdAt,
        startedAt: queueItem.startedAt,
        completedAt: queueItem.completedAt,
      };
    }

    // Get transaction search history if requested
    if (transactionId) {
      const history = await getTransactionSearchHistory(ctx, transactionId, {
        limitCount: 10,
      });
      result.history = history.map((entry) => ({
        id: entry.id,
        triggeredBy: entry.triggeredBy,
        status: entry.status,
        strategiesAttempted: entry.strategiesAttempted,
        totalFilesConnected: entry.totalFilesConnected,
        automationSource: entry.automationSource,
        totalGeminiCalls: entry.totalGeminiCalls,
        createdAt: entry.createdAt,
        completedAt: entry.completedAt,
        attempts: entry.attempts.map((attempt) => ({
          strategy: attempt.strategy,
          candidatesFound: attempt.candidatesFound,
          matchesFound: attempt.matchesFound,
          fileIdsConnected: attempt.fileIdsConnected,
          error: attempt.error,
          searchParams: attempt.searchParams, // Include search params for debugging
        })),
      }));
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[PrecisionSearch API] Error getting status:", error);
    return NextResponse.json(
      { error: "Failed to get precision search status" },
      { status: 500 }
    );
  }
}
