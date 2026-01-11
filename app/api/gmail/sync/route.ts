import { NextRequest, NextResponse } from "next/server";
import { collection, query, where, getDocs, addDoc, orderBy, limit } from "firebase/firestore";
import { Timestamp } from "firebase/firestore";
import { getServerDb, MOCK_USER_ID } from "@/lib/firebase/config-server";
import {
  getEmailIntegration,
  getSyncDateRanges,
  hasPendingSync,
  cleanupStaleQueueItems,
} from "@/lib/operations";

const db = getServerDb();

/**
 * POST /api/gmail/sync
 * Manually trigger a sync for a Gmail integration
 *
 * Body: {
 *   integrationId: string;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { integrationId } = body;

    if (!integrationId) {
      return NextResponse.json(
        { error: "integrationId is required" },
        { status: 400 }
      );
    }

    const ctx = { db, userId: MOCK_USER_ID };

    // Verify integration exists and belongs to user
    const integration = await getEmailIntegration(ctx, integrationId);
    if (!integration) {
      return NextResponse.json(
        { error: "Integration not found" },
        { status: 404 }
      );
    }

    if (integration.needsReauth) {
      return NextResponse.json(
        {
          error: "Re-authentication required",
          code: "REAUTH_REQUIRED",
        },
        { status: 403 }
      );
    }

    // Only block if initial sync is actively in progress (started but not complete)
    // Allow if initialSyncComplete is undefined (legacy integrations) or true
    if (integration.initialSyncComplete === false && integration.initialSyncStartedAt) {
      return NextResponse.json(
        {
          error: "Initial sync still in progress",
          code: "INITIAL_SYNC_PENDING",
        },
        { status: 400 }
      );
    }

    // Check for rate limiting (max 1 manual sync per 5 minutes per integration)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (
      integration.lastSyncAt &&
      integration.lastSyncAt.toDate() > fiveMinutesAgo
    ) {
      return NextResponse.json(
        {
          error: "Please wait at least 5 minutes between syncs",
          code: "RATE_LIMITED",
        },
        { status: 429 }
      );
    }

    // Clean up any stale queue items first
    const cleanedUp = await cleanupStaleQueueItems(ctx, integrationId);
    if (cleanedUp > 0) {
      console.log(`[Gmail Sync] Cleaned up ${cleanedUp} stale queue item(s)`);
    }

    // Check if there's already a pending sync (non-stale)
    const hasPending = await hasPendingSync(ctx, integrationId);
    if (hasPending) {
      return NextResponse.json(
        {
          error: "A sync is already in progress",
          code: "SYNC_IN_PROGRESS",
        },
        { status: 400 }
      );
    }

    // Get date ranges that need syncing (gaps between transaction range and synced range)
    const gapsToSync = await getSyncDateRanges(ctx, integrationId);

    if (gapsToSync.length === 0) {
      // No gaps - already fully synced for current transaction range
      return NextResponse.json({
        success: true,
        message: "Already up to date",
        alreadySynced: true,
      });
    }

    // Create queue items for each gap
    const now = Timestamp.now();
    const queueIds: string[] = [];

    for (const gap of gapsToSync) {
      const queueRef = await addDoc(collection(db, "gmailSyncQueue"), {
        userId: MOCK_USER_ID,
        integrationId,
        type: "manual",
        status: "pending",
        dateFrom: Timestamp.fromDate(gap.from),
        dateTo: Timestamp.fromDate(gap.to),
        emailsProcessed: 0,
        filesCreated: 0,
        attachmentsSkipped: 0,
        errors: [],
        retryCount: 0,
        maxRetries: 3,
        processedMessageIds: [],
        createdAt: now,
      });
      queueIds.push(queueRef.id);

      console.log(
        `[Gmail Sync] Queued manual sync for ${integration.email}: ${queueRef.id} ` +
        `(${gap.from.toISOString()} - ${gap.to.toISOString()})`
      );
    }

    return NextResponse.json({
      success: true,
      message: `Sync started for ${gapsToSync.length} date range(s)`,
      queueIds,
    });
  } catch (error) {
    console.error("[Gmail Sync] Error:", error);
    return NextResponse.json(
      { error: "Failed to start sync" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/gmail/sync?integrationId={id}
 * Get sync status for an integration
 */
export async function GET(request: NextRequest) {
  try {
    const integrationId = request.nextUrl.searchParams.get("integrationId");

    if (!integrationId) {
      return NextResponse.json(
        { error: "integrationId is required" },
        { status: 400 }
      );
    }

    const ctx = { db, userId: MOCK_USER_ID };

    // Verify integration exists and belongs to user
    const integration = await getEmailIntegration(ctx, integrationId);
    if (!integration) {
      return NextResponse.json(
        { error: "Integration not found" },
        { status: 404 }
      );
    }

    // Get active sync queue items
    const activeQuery = query(
      collection(db, "gmailSyncQueue"),
      where("integrationId", "==", integrationId),
      where("status", "in", ["pending", "processing"]),
      orderBy("createdAt", "desc"),
      limit(1)
    );
    const activeSnapshot = await getDocs(activeQuery);
    const activeSyncs = activeSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Get most recent completed sync
    const completedQuery = query(
      collection(db, "gmailSyncQueue"),
      where("integrationId", "==", integrationId),
      where("status", "in", ["completed", "failed"]),
      orderBy("createdAt", "desc"),
      limit(1)
    );
    const completedSnapshot = await getDocs(completedQuery);
    const recentCompleted = completedSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))[0];

    return NextResponse.json({
      integration: {
        email: integration.email,
        lastSyncAt: integration.lastSyncAt?.toDate().toISOString() || null,
        lastSyncStatus: integration.lastSyncStatus || null,
        lastSyncError: integration.lastSyncError || null,
        lastSyncFileCount: integration.lastSyncFileCount || 0,
        initialSyncComplete: integration.initialSyncComplete || false,
        initialSyncStartedAt:
          integration.initialSyncStartedAt?.toDate().toISOString() || null,
      },
      activeSyncs,
      recentCompleted: recentCompleted || null,
    });
  } catch (error) {
    console.error("[Gmail Sync] Error:", error);
    return NextResponse.json(
      { error: "Failed to get sync status" },
      { status: 500 }
    );
  }
}
