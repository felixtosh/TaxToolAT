export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import crypto from "crypto";

/**
 * Gmail OAuth 2.0 scopes
 * - gmail.readonly: Read all emails and attachments
 * - userinfo.email: Get user's email address
 * - userinfo.profile: Get user's display name
 */
const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

/**
 * GET /api/gmail/authorize
 * Initiate OAuth 2.0 authorization code flow
 * Redirects user to Google consent screen
 */
export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || "http://localhost:3000/api/gmail/callback";
  const returnTo = request.nextUrl.searchParams.get("returnTo");
  const userId = request.nextUrl.searchParams.get("userId");

  if (!userId) {
    return NextResponse.json(
      { error: "Missing userId parameter" },
      { status: 400 }
    );
  }

  if (!clientId) {
    return NextResponse.json(
      { error: "Google OAuth is not configured. Missing GOOGLE_CLIENT_ID." },
      { status: 500 }
    );
  }

  // Generate state parameter for CSRF protection
  const state = crypto.randomBytes(32).toString("hex");

  // Store state in a cookie for verification in callback
  const stateExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Build authorization URL
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline", // Required to get refresh token
    prompt: "consent", // Force consent to ensure refresh token is returned
    state,
  });

  const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`;

  // Create response with redirect
  const response = NextResponse.redirect(authUrl);

  // Set state cookie for CSRF verification
  response.cookies.set("gmail_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: stateExpiry,
    path: "/",
  });

  if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
    response.cookies.set("gmail_oauth_return_to", returnTo, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: stateExpiry,
      path: "/",
    });
  }

  // Store user ID for callback to associate integration with correct user
  response.cookies.set("gmail_oauth_user_id", userId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: stateExpiry,
    path: "/",
  });

  return response;
}
