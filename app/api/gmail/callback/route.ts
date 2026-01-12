import { NextRequest, NextResponse } from "next/server";
import { doc, setDoc, updateDoc, Timestamp } from "firebase/firestore";
import { getServerDb, MOCK_USER_ID } from "@/lib/firebase/config-server";
import {
  createEmailIntegration,
  getEmailIntegrationByEmail,
  getDisconnectedIntegrationByEmail,
  reconnectEmailIntegration,
  restoreFilesForIntegration,
  addOwnEmail,
} from "@/lib/operations";

const db = getServerDb();
const TOKENS_COLLECTION = "emailTokens";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

interface GoogleUserInfo {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}

/**
 * GET /api/gmail/callback
 * Handle OAuth 2.0 callback from Google
 * Exchanges authorization code for tokens and creates integration
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Handle errors from Google
  if (error) {
    console.error("OAuth error from Google:", error);
    return redirectWithParams(request, "/integrations", { error });
  }

  // Verify required parameters
  if (!code) {
    return redirectWithParams(request, "/integrations", { error: "missing_code" });
  }

  // Verify state parameter (CSRF protection)
  const storedState = request.cookies.get("gmail_oauth_state")?.value;
  if (!state || state !== storedState) {
    console.error("OAuth state mismatch:", { state, storedState });
    return redirectWithParams(request, "/integrations", { error: "invalid_state" });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || "http://localhost:3000/api/gmail/callback";

  if (!clientId || !clientSecret) {
    return redirectWithParams(request, "/integrations", { error: "oauth_not_configured" });
  }

  try {
    // Exchange authorization code for tokens
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error("Token exchange failed:", errorData);
      return redirectWithParams(request, "/integrations", { error: "token_exchange_failed" });
    }

    const tokens: GoogleTokenResponse = await tokenResponse.json();

    if (!tokens.access_token) {
      console.error("No access token in response:", tokens);
      return redirectWithParams(request, "/integrations", { error: "no_access_token" });
    }

    // Get user info
    const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoResponse.ok) {
      console.error("Failed to get user info");
      return redirectWithParams(request, "/integrations", { error: "userinfo_failed" });
    }

    const userInfo: GoogleUserInfo = await userInfoResponse.json();

    if (!userInfo.email) {
      return redirectWithParams(request, "/integrations", { error: "no_email" });
    }

    // Calculate token expiry
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    const ctx = { db, userId: MOCK_USER_ID };

    // Check if email is already connected (active)
    const existing = await getEmailIntegrationByEmail(ctx, userInfo.email);
    if (existing) {
      // Update existing integration with new tokens
      await storeTokens(
        existing.id,
        tokens.access_token,
        tokens.refresh_token || "",
        expiresAt
      );

      // Update token expiry on integration
      await updateDoc(doc(db, "emailIntegrations", existing.id), {
        tokenExpiresAt: Timestamp.fromDate(expiresAt),
        needsReauth: false,
        updatedAt: Timestamp.now(),
      });

      return redirectWithParams(request, "/integrations", { success: "tokens_updated" });
    }

    // Check for disconnected integration (reconnection)
    const disconnected = await getDisconnectedIntegrationByEmail(ctx, userInfo.email);
    if (disconnected) {
      await storeTokens(
        disconnected.id,
        tokens.access_token,
        tokens.refresh_token || "",
        expiresAt
      );

      await reconnectEmailIntegration(ctx, disconnected.id, expiresAt);
      const restoreResult = await restoreFilesForIntegration(ctx, disconnected.id);
      console.log(`[Reconnect] Restored ${restoreResult.restored} files for ${userInfo.email}`);

      if (userInfo.email) {
        await addOwnEmail(ctx, userInfo.email);
      }

      return redirectWithParams(request, "/integrations", { success: "reconnected" });
    }

    // Create new integration
    const integrationId = await createEmailIntegration(ctx, {
      provider: "gmail",
      email: userInfo.email,
      displayName: userInfo.name,
      accountId: userInfo.id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || "",
      expiresAt,
    });

    // Store tokens securely
    await storeTokens(
      integrationId,
      tokens.access_token,
      tokens.refresh_token || "",
      expiresAt
    );

    // Add email to user's own emails
    if (userInfo.email) {
      await addOwnEmail(ctx, userInfo.email);
    }

    console.log(`[Gmail OAuth] Created integration for ${userInfo.email} with refresh token: ${tokens.refresh_token ? "yes" : "no"}`);

    return redirectWithParams(request, "/integrations", { success: "connected" });

  } catch (error) {
    console.error("OAuth callback error:", error);
    return redirectWithParams(request, "/integrations", { error: String(error) });
  }
}

/**
 * Store tokens in secure server-side collection
 */
async function storeTokens(
  integrationId: string,
  accessToken: string,
  refreshToken: string,
  expiresAt: Date
): Promise<void> {
  const tokenDoc = doc(db, TOKENS_COLLECTION, integrationId);
  await setDoc(tokenDoc, {
    integrationId,
    userId: MOCK_USER_ID,
    provider: "gmail",
    accessToken,
    refreshToken,
    expiresAt: Timestamp.fromDate(expiresAt),
    updatedAt: Timestamp.now(),
  });
}

function getSafeReturnTo(request: NextRequest): string | null {
  const returnTo = request.cookies.get("gmail_oauth_return_to")?.value;
  if (!returnTo) return null;
  if (!returnTo.startsWith("/") || returnTo.startsWith("//")) return null;
  return returnTo;
}

function redirectWithParams(
  request: NextRequest,
  fallbackPath: string,
  params: Record<string, string>
): NextResponse {
  const returnTo = getSafeReturnTo(request);
  const url = new URL(returnTo || fallbackPath, request.url);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = NextResponse.redirect(url);
  response.cookies.delete("gmail_oauth_state");
  response.cookies.delete("gmail_oauth_return_to");
  return response;
}
