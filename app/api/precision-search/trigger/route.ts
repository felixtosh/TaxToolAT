import { NextRequest, NextResponse } from "next/server";
import { getServerDb, MOCK_USER_ID } from "@/lib/firebase/config-server";
import { queuePrecisionSearch } from "@/lib/operations";

const db = getServerDb();

/**
 * POST /api/precision-search/trigger
 * Trigger a precision receipt search
 *
 * Body: {
 *   scope: "all_incomplete" | "single_transaction";
 *   transactionId?: string; // Required when scope is "single_transaction"
 * }
 *
 * Returns: {
 *   success: boolean;
 *   queueId: string;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { scope, transactionId } = body;

    if (!scope || !["all_incomplete", "single_transaction"].includes(scope)) {
      return NextResponse.json(
        { error: "Invalid scope. Must be 'all_incomplete' or 'single_transaction'" },
        { status: 400 }
      );
    }

    if (scope === "single_transaction" && !transactionId) {
      return NextResponse.json(
        { error: "transactionId is required when scope is 'single_transaction'" },
        { status: 400 }
      );
    }

    const ctx = { db, userId: MOCK_USER_ID };

    // Note: We no longer block duplicate searches - the UI handles showing progress
    // and users can re-trigger if needed. The queue processor will handle deduplication.

    // Queue the precision search
    const queueId = await queuePrecisionSearch(ctx, {
      userId: MOCK_USER_ID,
      scope,
      transactionId: scope === "single_transaction" ? transactionId : undefined,
      triggeredBy: "manual",
      triggeredByAuthor: {
        type: "user",
        userId: MOCK_USER_ID,
      },
    });

    console.log(
      `[PrecisionSearch API] Queued ${scope} search: ${queueId}`,
      transactionId ? `for tx ${transactionId}` : ""
    );

    return NextResponse.json({
      success: true,
      queueId,
    });
  } catch (error) {
    console.error("[PrecisionSearch API] Error triggering search:", error);
    return NextResponse.json(
      { error: "Failed to trigger precision search" },
      { status: 500 }
    );
  }
}
