/**
 * Server-side GoCardless client factory
 * Loads credentials from environment variables
 */

import { GoCardlessClient } from "./client";

let clientInstance: GoCardlessClient | null = null;

/**
 * Get or create a GoCardless client instance
 * Credentials are loaded from environment variables
 *
 * Required environment variables:
 * - GOCARDLESS_SECRET_ID
 * - GOCARDLESS_SECRET_KEY
 */
export function getGoCardlessClient(): GoCardlessClient {
  if (clientInstance) {
    return clientInstance;
  }

  const secretId = process.env.GOCARDLESS_SECRET_ID;
  const secretKey = process.env.GOCARDLESS_SECRET_KEY;

  if (!secretId || !secretKey) {
    throw new Error(
      "GoCardless credentials not configured. " +
      "Please set GOCARDLESS_SECRET_ID and GOCARDLESS_SECRET_KEY environment variables."
    );
  }

  clientInstance = new GoCardlessClient(secretId, secretKey);
  return clientInstance;
}

/**
 * Reset client instance (useful for testing or credential rotation)
 */
export function resetGoCardlessClient(): void {
  clientInstance = null;
}

/**
 * Get the redirect URL for OAuth callback
 * Uses GOCARDLESS_REDIRECT_URL env var or constructs from NEXT_PUBLIC_APP_URL
 */
export function getRedirectUrl(): string {
  const explicitRedirect = process.env.GOCARDLESS_REDIRECT_URL;
  if (explicitRedirect) {
    return explicitRedirect;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${appUrl}/api/gocardless/callback`;
}
