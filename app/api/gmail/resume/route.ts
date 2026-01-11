import { NextRequest, NextResponse } from "next/server";
import { collection, addDoc } from "firebase/firestore";
import { Timestamp } from "firebase/firestore";
import { getServerDb, MOCK_USER_ID } from "@/lib/firebase/config-server";
import {
  getEmailIntegration,
  resumeEmailIntegration,
  getSyncDateRanges,
  cleanupStaleQueueItems,
  hasPendingSync,
} from "@/lib/operations";

const db = getServerDb();

/**
 * POST /api/gmail/resume
 * Resume sync for a Gmail integration
 * Also triggers an immediate sync
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

    // Resume the integration
    await resumeEmailIntegration(ctx, integrationId);
    console.log(`[Gmail Resume] Resumed integration: ${integration.email}`);

    // Check if reauth is needed
    if (integration.needsReauth) {
      return NextResponse.json({
        success: true,
        message: "Sync resumed, but re-authentication is required",
        needsReauth: true,
        syncStarted: false,
      });
    }

    // Clean up any stale queue items
    const cleanedUp = await cleanupStaleQueueItems(ctx, integrationId);
    if (cleanedUp > 0) {
      console.log(`[Gmail Resume] Cleaned up ${cleanedUp} stale queue item(s)`);
    }

    // Check if there's already a pending sync
    const hasPending = await hasPendingSync(ctx, integrationId);
    if (hasPending) {
      return NextResponse.json({
        success: true,
        message: "Sync resumed, a sync is already in progress",
        syncStarted: false,
        alreadySyncing: true,
      });
    }

    // Get date ranges that need syncing
    const gapsToSync = await getSyncDateRanges(ctx, integrationId);

    if (gapsToSync.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Sync resumed, already up to date",
        syncStarted: false,
        alreadySynced: true,
      });
    }

    // Create queue items for each gap (trigger immediate sync)
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
        `[Gmail Resume] Queued sync for ${integration.email}: ${queueRef.id} ` +
        `(${gap.from.toISOString()} - ${gap.to.toISOString()})`
      );
    }

    return NextResponse.json({
      success: true,
      message: `Sync resumed and started for ${gapsToSync.length} date range(s)`,
      syncStarted: true,
      queueIds,
    });
  } catch (error) {
    console.error("[Gmail Resume] Error:", error);
    return NextResponse.json(
      { error: "Failed to resume sync" },
      { status: 500 }
    );
  }
}
