import { NextRequest, NextResponse } from "next/server";
import { doc, getDoc } from "firebase/firestore";
import { getServerDb, MOCK_USER_ID } from "@/lib/firebase/config-server";
import { getEmailIntegration, markIntegrationAccessed, markIntegrationNeedsReauth } from "@/lib/operations";
import { GmailClient } from "@/lib/email-providers/gmail-client";

const db = getServerDb();
const TOKENS_COLLECTION = "emailTokens";

/**
 * POST /api/gmail/email-content
 * Get the HTML and text body content of an email
 *
 * Body: {
 *   integrationId: string;
 *   messageId: string;
 * }
 *
 * Response: {
 *   htmlBody?: string;
 *   textBody?: string;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { integrationId, messageId } = body;

    if (!integrationId) {
      return NextResponse.json(
        { error: "integrationId is required" },
        { status: 400 }
      );
    }

    if (!messageId) {
      return NextResponse.json(
        { error: "messageId is required" },
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

    // Get tokens from secure storage
    const tokens = await getTokens(integrationId);
    if (!tokens) {
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

    // Get email content
    const content = await gmailClient.getEmailContent(messageId);

    // Update last accessed time
    await markIntegrationAccessed(ctx, integrationId);

    return NextResponse.json({
      success: true,
      htmlBody: content.htmlBody,
      textBody: content.textBody,
    });
  } catch (error) {
    console.error("Error fetching email content:", error);

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
      { error: error instanceof Error ? error.message : "Failed to fetch email content" },
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
