"use client";

import { getAuth, GoogleAuthProvider, signInWithPopup, OAuthCredential } from "firebase/auth";
import app from "./config";

/**
 * Gmail API OAuth scopes
 * - gmail.readonly: Read all emails and attachments
 * - userinfo.email: Get user's email address
 * - userinfo.profile: Get user's display name
 */
const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

/**
 * Result of successful Gmail OAuth
 */
export interface GmailOAuthResult {
  accessToken: string;
  email: string;
  displayName: string;
  googleUserId: string;
  expiresAt: Date;
}

/**
 * Create a GoogleAuthProvider configured for Gmail access
 */
function createGmailProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();

  // Add Gmail scopes
  GMAIL_SCOPES.forEach((scope) => provider.addScope(scope));

  // Force consent screen to always show (needed to get refresh token behavior)
  // and hint at the account selection
  provider.setCustomParameters({
    access_type: "offline",
    prompt: "consent",
  });

  return provider;
}

/**
 * Initiate Gmail OAuth flow via popup
 *
 * Note: Firebase Auth's signInWithPopup gives us an access token but NOT a refresh token
 * directly. For long-lived access, we need to implement a server-side OAuth flow
 * that exchanges the authorization code for tokens.
 *
 * For now, this provides the access token which is valid for ~1 hour.
 * The user will need to re-authenticate when it expires.
 *
 * For production, consider using:
 * 1. Server-side OAuth flow with Google OAuth library
 * 2. Firebase Cloud Functions to handle token refresh
 *
 * @returns OAuth result with access token and user info
 * @throws Error if OAuth fails or user cancels
 */
export async function connectGmailAccount(): Promise<GmailOAuthResult> {
  const auth = getAuth(app);
  const provider = createGmailProvider();

  try {
    const result = await signInWithPopup(auth, provider);

    // Get the OAuth credential
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential || !credential.accessToken) {
      throw new Error("Failed to get OAuth credentials from Google");
    }

    const user = result.user;
    if (!user.email) {
      throw new Error("Failed to get email from Google account");
    }

    // Access tokens from signInWithPopup are typically valid for 1 hour
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    return {
      accessToken: credential.accessToken,
      email: user.email,
      displayName: user.displayName || user.email.split("@")[0],
      googleUserId: user.uid,
      expiresAt,
    };
  } catch (error: unknown) {
    // Handle specific Firebase Auth errors
    if (error && typeof error === "object" && "code" in error) {
      const firebaseError = error as { code: string; message: string };
      switch (firebaseError.code) {
        case "auth/popup-closed-by-user":
          throw new Error("Sign-in was cancelled");
        case "auth/popup-blocked":
          throw new Error("Popup was blocked. Please allow popups for this site.");
        case "auth/cancelled-popup-request":
          throw new Error("Sign-in was cancelled");
        case "auth/network-request-failed":
          throw new Error("Network error. Please check your connection.");
        default:
          throw new Error(`Authentication failed: ${firebaseError.message}`);
      }
    }
    throw error;
  }
}

/**
 * Sign out from Google (clears Firebase Auth session)
 * Note: This doesn't revoke the OAuth tokens
 */
export async function signOutGoogle(): Promise<void> {
  const auth = getAuth(app);
  await auth.signOut();
}

/**
 * Revoke Google OAuth access
 * This should be called when disconnecting a Gmail integration
 *
 * @param accessToken The access token to revoke
 */
export async function revokeGoogleAccess(accessToken: string): Promise<void> {
  try {
    const response = await fetch(
      `https://oauth2.googleapis.com/revoke?token=${accessToken}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    if (!response.ok) {
      // Token might already be invalid/expired, which is fine
      console.warn("Token revocation returned non-OK status:", response.status);
    }
  } catch (error) {
    // Revocation failed but we should still clean up locally
    console.warn("Token revocation failed:", error);
  }
}

/**
 * Check if an access token is still valid
 *
 * @param accessToken The access token to validate
 * @returns True if valid, false otherwise
 */
export async function validateGoogleToken(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${accessToken}`
    );
    return response.ok;
  } catch {
    return false;
  }
}
