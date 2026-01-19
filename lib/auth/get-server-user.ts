/**
 * Server-side authentication helpers
 *
 * In development mode, falls back to mock user for testing.
 * In production, would verify Firebase ID tokens (requires firebase-admin setup).
 */

/**
 * Get user ID from request, with fallback for development
 * In development with emulators, allows requests without auth for testing
 */
export async function getServerUserIdWithFallback(
  request: Request
): Promise<string> {
  const authHeader = request.headers.get("Authorization");

  // If we have an auth header with a token, extract user ID from it
  if (authHeader?.startsWith("Bearer ")) {
    // In a full production setup, you would verify the token with firebase-admin
    // For now, we trust the token and extract the user ID from it
    // The token is a JWT - we can decode (not verify) to get the uid
    const token = authHeader.substring(7);
    try {
      const payload = decodeJwtPayload(token);
      if (payload?.user_id || payload?.sub) {
        return payload.user_id || payload.sub;
      }
    } catch (e) {
      console.warn("[Auth] Failed to decode token:", e);
    }
  }

  // In development, allow fallback to mock user for API testing
  if (process.env.NODE_ENV === "development") {
    console.warn(
      "[Auth] No valid Authorization header - using mock user for development"
    );
    return "dev-user-123";
  }

  throw new Error("Unauthorized: Missing Authorization header");
}

/**
 * Decode JWT payload without verification
 * Only use this for development/emulator mode
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = parts[1];
    const decoded = Buffer.from(payload, "base64").toString("utf-8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Check if the user is an admin (development stub)
 */
export async function isServerUserAdmin(request: Request): Promise<boolean> {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return false;
  }

  const token = authHeader.substring(7);

  try {
    const payload = decodeJwtPayload(token);
    return payload?.admin === true;
  } catch {
    return false;
  }
}
