import { NextRequest, NextResponse } from "next/server";
import { doc, getDoc } from "firebase/firestore";
import { getServerDb, MOCK_USER_ID } from "@/lib/firebase/config-server";
import { getEmailIntegration, markIntegrationAccessed, markIntegrationNeedsReauth } from "@/lib/operations";
import { GmailClient } from "@/lib/email-providers/gmail-client";

const db = getServerDb();
const TOKENS_COLLECTION = "emailTokens";

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
    } = body;

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
    const tokens = await getTokens(integrationId);
    if (!tokens) {
      console.log("[Gmail Search] 403: Tokens not found for", integrationId);
      return NextResponse.json(
        {
          error: "Tokens not found. Please reconnect Gmail.",
          code: "TOKENS_MISSING",
        },
        { status: 403 }
      );
    }

    // Check if token is expired
    const expiresAt = tokens.expiresAt.toDate();
    const now = new Date();
    if (expiresAt < now) {
      console.log("[Gmail Search] 403: Token expired", { integrationId, expiresAt, now });
      await markIntegrationNeedsReauth(ctx, integrationId, "Access token expired");
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
    });

    // Update last accessed time
    await markIntegrationAccessed(ctx, integrationId);

    return NextResponse.json({
      success: true,
      messages: result.messages.map((msg) => ({
        ...msg,
        date: msg.date.toISOString(),
      })),
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

/**
 * Get tokens from secure storage
 */
async function getTokens(integrationId: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresAt: { toDate: () => Date };
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
    expiresAt: data.expiresAt,
  };
}
