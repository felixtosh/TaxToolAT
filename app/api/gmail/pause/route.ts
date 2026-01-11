import { NextRequest, NextResponse } from "next/server";
import { collection, addDoc, doc, getDoc } from "firebase/firestore";
import { Timestamp } from "firebase/firestore";
import { getServerDb, MOCK_USER_ID } from "@/lib/firebase/config-server";
import {
  getEmailIntegration,
  pauseEmailIntegration,
  pauseActiveSyncForIntegration,
} from "@/lib/operations";

const db = getServerDb();

/**
 * POST /api/gmail/pause
 * Pause sync for a Gmail integration
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

    // Check if already paused
    if (integration.isPaused) {
      return NextResponse.json({
        success: true,
        message: "Already paused",
        alreadyPaused: true,
      });
    }

    // Pause any active sync queue items and get the paused item
    const pausedQueueItem = await pauseActiveSyncForIntegration(ctx, integrationId);

    // Create a sync history record showing the pause
    if (pausedQueueItem) {
      const startedAt = pausedQueueItem.startedAt || pausedQueueItem.createdAt;
      const completedAt = Timestamp.now();
      const durationSeconds = Math.round(
        (completedAt.toMillis() - startedAt.toMillis()) / 1000
      );

      await addDoc(collection(db, "gmailSyncHistory"), {
        userId: MOCK_USER_ID,
        integrationId,
        integrationEmail: integration.email,
        type: pausedQueueItem.type,
        status: "paused",
        dateFrom: pausedQueueItem.dateFrom,
        dateTo: pausedQueueItem.dateTo,
        emailsSearched: pausedQueueItem.emailsProcessed,
        filesCreated: pausedQueueItem.filesCreated,
        attachmentsSkipped: pausedQueueItem.attachmentsSkipped,
        errors: pausedQueueItem.errors || [],
        startedAt,
        completedAt,
        durationSeconds,
        triggeredBy: "manual",
      });

      console.log(
        `[Gmail Pause] Created history record for paused sync: ${integrationId}`
      );
    }

    // Mark integration as paused
    await pauseEmailIntegration(ctx, integrationId);

    console.log(`[Gmail Pause] Paused integration: ${integration.email}`);

    return NextResponse.json({
      success: true,
      message: pausedQueueItem
        ? `Sync paused (${pausedQueueItem.filesCreated} files, ${pausedQueueItem.emailsProcessed} emails processed)`
        : "Sync paused",
      hadActiveSync: !!pausedQueueItem,
      pausedProgress: pausedQueueItem
        ? {
            filesCreated: pausedQueueItem.filesCreated,
            emailsProcessed: pausedQueueItem.emailsProcessed,
          }
        : null,
    });
  } catch (error) {
    console.error("[Gmail Pause] Error:", error);
    return NextResponse.json(
      { error: "Failed to pause sync" },
      { status: 500 }
    );
  }
}
