"use client";

/**
 * @deprecated This file contains the old Firebase Auth popup flow.
 * Gmail OAuth is now handled via server-side authorization code flow:
 * - /api/gmail/authorize - Initiates OAuth
 * - /api/gmail/callback - Handles OAuth callback and token exchange
 * - /api/gmail/refresh - Refreshes access tokens
 *
 * The functions below are kept for backwards compatibility and utility.
 */

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
