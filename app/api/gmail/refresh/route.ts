import { NextRequest, NextResponse } from "next/server";
import { doc, getDoc, updateDoc, Timestamp } from "firebase/firestore";
import { getServerDb } from "@/lib/firebase/config-server";
import { getServerUserIdWithFallback } from "@/lib/auth/get-server-user";

const db = getServerDb();
const TOKENS_COLLECTION = "emailTokens";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  // Note: refresh_token is NOT returned when refreshing
}

/**
 * POST /api/gmail/refresh
 * Refresh access token using refresh token
 *
 * Body: { integrationId: string }
 * Returns: { accessToken, expiresAt } or error
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { integrationId } = body;

    if (!integrationId) {
      return NextResponse.json(
        { error: "Missing integrationId" },
        { status: 400 }
      );
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: "Google OAuth is not configured" },
        { status: 500 }
      );
    }

    // Get stored tokens
    const tokenDoc = await getDoc(doc(db, TOKENS_COLLECTION, integrationId));
    if (!tokenDoc.exists()) {
      return NextResponse.json(
        { error: "Token not found" },
        { status: 404 }
      );
    }

    const tokenData = tokenDoc.data();
    const refreshToken = tokenData.refreshToken;

    if (!refreshToken) {
      // Mark integration as needing re-auth
      await updateDoc(doc(db, "emailIntegrations", integrationId), {
        needsReauth: true,
        lastError: "No refresh token available",
        updatedAt: Timestamp.now(),
      });

      return NextResponse.json(
        { error: "No refresh token available. User needs to re-authenticate." },
        { status: 401 }
      );
    }

    // Refresh the token
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error("Token refresh failed:", errorData);

      // Check if refresh token is invalid/expired
      if (tokenResponse.status === 400 || tokenResponse.status === 401) {
        await updateDoc(doc(db, "emailIntegrations", integrationId), {
          needsReauth: true,
          lastError: "Refresh token expired or revoked",
          updatedAt: Timestamp.now(),
        });

        return NextResponse.json(
          { error: "Refresh token is invalid. User needs to re-authenticate." },
          { status: 401 }
        );
      }

      return NextResponse.json(
        { error: "Token refresh failed" },
        { status: 500 }
      );
    }

    const tokens: GoogleTokenResponse = await tokenResponse.json();
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Update stored tokens
    await updateDoc(doc(db, TOKENS_COLLECTION, integrationId), {
      accessToken: tokens.access_token,
      expiresAt: Timestamp.fromDate(expiresAt),
      updatedAt: Timestamp.now(),
    });

    // Update integration
    await updateDoc(doc(db, "emailIntegrations", integrationId), {
      tokenExpiresAt: Timestamp.fromDate(expiresAt),
      needsReauth: false,
      lastError: null,
      updatedAt: Timestamp.now(),
    });

    console.log(`[Gmail OAuth] Refreshed token for integration ${integrationId}`);

    return NextResponse.json({
      success: true,
      accessToken: tokens.access_token,
      expiresAt: expiresAt.toISOString(),
    });

  } catch (error) {
    console.error("Token refresh error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Token refresh failed" },
      { status: 500 }
    );
  }
}
