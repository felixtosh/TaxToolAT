import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getServerUserIdWithFallback } from "@/lib/auth/get-server-user";
import { GmailClient } from "@/lib/email-providers/gmail-client";

const db = getAdminDb();
const INTEGRATIONS_COLLECTION = "emailIntegrations";
const TOKENS_COLLECTION = "emailTokens";
const FILES_COLLECTION = "files";

/**
 * POST /api/gmail/search
 * Search Gmail for emails with attachments
 *
 * Body: {
 *   integrationId: string;
 *   query?: string;
 *   dateFrom?: string; // ISO date
 *   dateTo?: string; // ISO date
 *   from?: string;
 *   hasAttachments?: boolean;
 *   limit?: number;
 *   pageToken?: string;
 *   expandThreads?: boolean; // If true, fetch all messages in matching threads
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      integrationId,
      query,
      dateFrom,
      dateTo,
      from,
      hasAttachments = true,
      limit = 20,
      pageToken,
      expandThreads = false,
    } = body;

    console.log("[Gmail Search] Request", {
      integrationId,
      query,
      dateFrom,
      dateTo,
      from,
      hasAttachments,
      limit,
      pageToken,
      expandThreads,
    });

    if (!integrationId) {
      return NextResponse.json(
        { error: "integrationId is required" },
        { status: 400 }
      );
    }

    const userId = await getServerUserIdWithFallback(request);

    // Verify integration exists and belongs to user
    const integrationRef = db.collection(INTEGRATIONS_COLLECTION).doc(integrationId);
    const integrationSnap = await integrationRef.get();

    if (!integrationSnap.exists) {
      return NextResponse.json(
        { error: "Integration not found" },
        { status: 404 }
      );
    }

    const integration = integrationSnap.data()!;
    if (integration.userId !== userId) {
      return NextResponse.json(
        { error: "Integration not found" },
        { status: 404 }
      );
    }

    if (integration.needsReauth) {
      console.log("[Gmail Search] 403: Integration needs reauth", integrationId);
      return NextResponse.json(
        {
          error: "Re-authentication required",
          code: "REAUTH_REQUIRED",
        },
        { status: 403 }
      );
    }

    // Get tokens from secure storage
    const tokenRef = db.collection(TOKENS_COLLECTION).doc(integrationId);
    const tokenSnap = await tokenRef.get();

    if (!tokenSnap.exists) {
      console.log("[Gmail Search] 403: Tokens not found for", integrationId);
      return NextResponse.json(
        {
          error: "Tokens not found. Please reconnect Gmail.",
          code: "TOKENS_MISSING",
        },
        { status: 403 }
      );
    }

    const tokens = tokenSnap.data()!;

    // Check if token is expired
    const expiresAt = tokens.expiresAt.toDate();
    const now = new Date();
    if (expiresAt < now) {
      console.log("[Gmail Search] 403: Token expired", { integrationId, expiresAt, now });
      await integrationRef.update({
        needsReauth: true,
        lastError: "Access token expired",
        updatedAt: Timestamp.now(),
      });
      return NextResponse.json(
        {
          error: "Access token expired. Please reconnect Gmail.",
          code: "TOKEN_EXPIRED",
        },
        { status: 403 }
      );
    }

    // Create Gmail client
    const gmailClient = new GmailClient(
      integrationId,
      tokens.accessToken,
      tokens.refreshToken || ""
    );

    // Perform search
    const result = await gmailClient.searchMessages({
      query,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      from,
      hasAttachments,
      limit,
      pageToken,
      expandThreads,
    });

    // Update last accessed time (fire and forget - don't block response)
    integrationRef.update({
      lastAccessedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    }).catch((err) => console.error("[Gmail Search] Failed to update lastAccessedAt:", err));

    // Collect all attachment IDs to check for existing imports
    const attachmentKeys: { messageId: string; attachmentId: string }[] = [];
    for (const msg of result.messages) {
      for (const att of msg.attachments) {
        attachmentKeys.push({ messageId: msg.messageId, attachmentId: att.attachmentId });
      }
    }

    // Query for existing files with these Gmail references
    const existingFilesMap = new Map<string, string>(); // key: "messageId:attachmentId" -> fileId
    if (attachmentKeys.length > 0) {
      // Query in batches of 30 (Firestore 'in' query limit)
      const messageIds = [...new Set(attachmentKeys.map(k => k.messageId))];
      for (let i = 0; i < messageIds.length; i += 30) {
        const batch = messageIds.slice(i, i + 30);
        const existingQuery = await db
          .collection(FILES_COLLECTION)
          .where("userId", "==", userId)
          .where("gmailMessageId", "in", batch)
          .get();

        for (const doc of existingQuery.docs) {
          const data = doc.data();
          if (data.gmailAttachmentId) {
            const key = `${data.gmailMessageId}:${data.gmailAttachmentId}`;
            existingFilesMap.set(key, doc.id);
          }
        }
      }
    }

    // Enrich attachments with existing file info
    const enrichedMessages = result.messages.map((msg) => ({
      ...msg,
      date: msg.date.toISOString(),
      attachments: msg.attachments.map((att) => {
        const key = `${msg.messageId}:${att.attachmentId}`;
        const existingFileId = existingFilesMap.get(key);
        return {
          ...att,
          existingFileId: existingFileId || null,
        };
      }),
    }));

    console.log("[Gmail Search] Response", {
      integrationId,
      messageCount: result.messages.length,
      totalEstimate: result.totalEstimate,
      nextPageToken: result.nextPageToken,
      existingFilesFound: existingFilesMap.size,
    });

    return NextResponse.json({
      success: true,
      messages: enrichedMessages,
      nextPageToken: result.nextPageToken,
      totalEstimate: result.totalEstimate,
    });
  } catch (error) {
    console.error("Error searching Gmail:", error);

    if (error instanceof Error) {
      if (error.message === "AUTH_EXPIRED") {
        return NextResponse.json(
          {
            error: "Authentication expired. Please reconnect Gmail.",
            code: "AUTH_EXPIRED",
          },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to search Gmail" },
      { status: 500 }
    );
  }
}
