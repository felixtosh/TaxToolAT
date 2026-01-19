import { NextRequest, NextResponse } from "next/server";
import { doc, getDoc, deleteDoc, collection, query, where, getDocs } from "firebase/firestore";
import { getServerDb } from "@/lib/firebase/config-server";
import { getServerUserIdWithFallback } from "@/lib/auth/get-server-user";
import {
  getEmailIntegration,
  softDisconnectEmailIntegration,
  removeIntegrationFromPatterns,
  softDeleteFilesForIntegration,
} from "@/lib/operations";

const db = getServerDb();
const TOKENS_COLLECTION = "emailTokens";
const SYNC_QUEUE_COLLECTION = "gmailSyncQueue";

/**
 * DELETE /api/gmail/disconnect
 * Soft-disconnect a Gmail integration.
 *
 * This performs a "soft disconnect" that:
 * 1. Revokes OAuth tokens
 * 2. Soft-deletes files WITHOUT transaction connections (keeps files with connections)
 * 3. Preserves sync state (processedMessageIds) for easy reconnection
 *
 * Query: integrationId
 */
export async function DELETE(request: NextRequest) {
  try {
    const userId = await getServerUserIdWithFallback(request);
    const integrationId = request.nextUrl.searchParams.get("integrationId");

    if (!integrationId) {
      return NextResponse.json(
        { error: "integrationId is required" },
        { status: 400 }
      );
    }

    const ctx = { db, userId };

    // Verify integration exists and belongs to user
    const integration = await getEmailIntegration(ctx, integrationId);
    if (!integration) {
      return NextResponse.json(
        { error: "Integration not found" },
        { status: 404 }
      );
    }

    // 1. Get tokens to revoke
    const tokens = await getTokens(integrationId);
    if (tokens?.accessToken) {
      try {
        // Revoke Google OAuth access
        const revokeResponse = await fetch(
          `https://oauth2.googleapis.com/revoke?token=${tokens.accessToken}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
          }
        );
        if (!revokeResponse.ok) {
          console.warn("Token revocation returned non-OK status:", revokeResponse.status);
        }
      } catch (error) {
        // Log but don't fail - token might already be invalid
        console.warn("Failed to revoke Google access:", error);
      }
    }

    // 2. Delete tokens from secure storage
    try {
      const tokenDoc = doc(db, TOKENS_COLLECTION, integrationId);
      await deleteDoc(tokenDoc);
    } catch (error) {
      console.warn("Failed to delete tokens:", error);
    }

    // 3. Get processedMessageIds from queue items BEFORE deleting them
    const { processedMessageIds, dateRange } = await getQueueStateAndDelete(integrationId);

    // 4. Soft delete files WITHOUT transaction connections
    //    Files WITH connections are preserved (they're still useful)
    const fileResult = await softDeleteFilesForIntegration(ctx, integrationId);
    console.log(
      `[Disconnect] Soft-deleted ${fileResult.softDeleted} files, ` +
        `preserved ${fileResult.skipped} files with transaction connections`
    );

    // 5. Remove integration ID from partner patterns
    await removeIntegrationFromPatterns(ctx, integrationId);

    // 6. Soft-disconnect the integration (preserves processedMessageIds for reconnection)
    await softDisconnectEmailIntegration(ctx, integrationId, processedMessageIds, dateRange);

    return NextResponse.json({
      success: true,
      message: "Gmail integration disconnected successfully",
      filesSoftDeleted: fileResult.softDeleted,
      filesPreserved: fileResult.skipped,
    });
  } catch (error) {
    console.error("Error disconnecting Gmail:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to disconnect Gmail" },
      { status: 500 }
    );
  }
}

/**
 * Get tokens from secure storage
 */
async function getTokens(integrationId: string): Promise<{
  accessToken: string;
  refreshToken?: string;
} | null> {
  const tokenDoc = doc(db, TOKENS_COLLECTION, integrationId);
  const snapshot = await getDoc(tokenDoc);

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data();
  return {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
  };
}

/**
 * Get state from queue items before deleting them.
 * Extracts processedMessageIds and date range for preservation on the integration.
 */
async function getQueueStateAndDelete(integrationId: string): Promise<{
  processedMessageIds: string[];
  dateRange?: { from: Date; to: Date };
}> {
  try {
    const queueQuery = query(
      collection(db, SYNC_QUEUE_COLLECTION),
      where("integrationId", "==", integrationId)
    );
    const queueSnapshot = await getDocs(queueQuery);

    // Collect all processed message IDs from all queue items
    const allProcessedIds = new Set<string>();
    let minDate: Date | undefined;
    let maxDate: Date | undefined;

    for (const queueDoc of queueSnapshot.docs) {
      const data = queueDoc.data();

      // Collect processed message IDs
      const ids = data.processedMessageIds as string[] | undefined;
      if (ids) {
        ids.forEach((id) => allProcessedIds.add(id));
      }

      // Track date range
      const from = data.dateFrom?.toDate();
      const to = data.dateTo?.toDate();
      if (from && (!minDate || from < minDate)) minDate = from;
      if (to && (!maxDate || to > maxDate)) maxDate = to;
    }

    // Delete all queue items
    const deletePromises = queueSnapshot.docs.map((d) => deleteDoc(d.ref));
    await Promise.all(deletePromises);

    console.log(
      `[Disconnect] Deleted ${queueSnapshot.size} queue items, ` +
        `preserved ${allProcessedIds.size} message IDs for future reconnection`
    );

    return {
      processedMessageIds: Array.from(allProcessedIds),
      dateRange: minDate && maxDate ? { from: minDate, to: maxDate } : undefined,
    };
  } catch (error) {
    console.warn("Failed to get queue state:", error);
    return { processedMessageIds: [] };
  }
}
