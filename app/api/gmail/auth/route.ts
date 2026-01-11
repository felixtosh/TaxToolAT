import { NextRequest, NextResponse } from "next/server";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { getServerDb, MOCK_USER_ID } from "@/lib/firebase/config-server";
import {
  createEmailIntegration,
  getEmailIntegrationByEmail,
  getDisconnectedIntegrationByEmail,
  reconnectEmailIntegration,
  restoreFilesForIntegration,
  clearIntegrationReauthFlag,
  addOwnEmail,
} from "@/lib/operations";

const db = getServerDb();

// Collection for storing tokens securely (server-side only)
const TOKENS_COLLECTION = "emailTokens";

/**
 * POST /api/gmail/auth
 * Complete Gmail OAuth and store integration
 *
 * Body: {
 *   accessToken: string;
 *   email: string;
 *   displayName?: string;
 *   googleUserId: string;
 *   expiresAt: string; // ISO date
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accessToken, email, displayName, googleUserId, expiresAt } = body;

    if (!accessToken || !email || !googleUserId || !expiresAt) {
      return NextResponse.json(
        { error: "Missing required fields: accessToken, email, googleUserId, expiresAt" },
        { status: 400 }
      );
    }

    const ctx = { db, userId: MOCK_USER_ID };

    // 1. Check if this email is already connected (active)
    const existing = await getEmailIntegrationByEmail(ctx, email);
    if (existing) {
      // Update the existing integration with new tokens
      await updateTokens(existing.id, accessToken, new Date(expiresAt));

      // Clear the reauth flag after successful token refresh
      await clearIntegrationReauthFlag(ctx, existing.id, new Date(expiresAt));

      return NextResponse.json({
        success: true,
        integrationId: existing.id,
        isExisting: true,
        isReconnected: false,
        message: "Integration tokens updated",
      });
    }

    // 2. Check if there's a disconnected integration for this email (reconnection)
    const disconnected = await getDisconnectedIntegrationByEmail(ctx, email);
    if (disconnected) {
      // Update tokens for the reconnection
      await updateTokens(disconnected.id, accessToken, new Date(expiresAt));

      // Reconnect the integration (clears disconnectedAt, sets isActive = true)
      await reconnectEmailIntegration(ctx, disconnected.id, new Date(expiresAt));

      // Restore soft-deleted files
      const restoreResult = await restoreFilesForIntegration(ctx, disconnected.id);
      console.log(
        `[Reconnect] Restored ${restoreResult.restored} files for ${email}`
      );

      // Ensure email is in user's own emails list
      if (email) {
        await addOwnEmail(ctx, email);
      }

      // Note: The Cloud Function trigger on integration update will handle
      // starting a new sync if needed. The processedMessageIds are preserved
      // on the integration for deduplication.

      return NextResponse.json({
        success: true,
        integrationId: disconnected.id,
        isExisting: true,
        isReconnected: true,
        filesRestored: restoreResult.restored,
        message: "Gmail integration reconnected successfully",
      });
    }

    // 3. Create new integration
    const integrationId = await createEmailIntegration(ctx, {
      provider: "gmail",
      email,
      displayName,
      accountId: googleUserId,
      accessToken, // Will be stored in tokens collection
      refreshToken: "", // Firebase Auth popup doesn't give us refresh token
      expiresAt: new Date(expiresAt),
    });

    // Store tokens in secure server-side collection
    await storeTokens(integrationId, accessToken, "", new Date(expiresAt));

    // Auto-add email to user's own emails list
    if (email) {
      await addOwnEmail(ctx, email);
    }

    return NextResponse.json({
      success: true,
      integrationId,
      isExisting: false,
      isReconnected: false,
      message: "Gmail integration created successfully",
    });
  } catch (error) {
    console.error("Error creating Gmail integration:", error);

    if (error instanceof Error && error.message.includes("already connected")) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create Gmail integration" },
      { status: 500 }
    );
  }
}

/**
 * Store tokens in server-side collection
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
    accessToken, // In production, encrypt this
    refreshToken, // In production, encrypt this
    expiresAt: Timestamp.fromDate(expiresAt),
    updatedAt: Timestamp.now(),
  });
}

/**
 * Update tokens for existing integration
 */
async function updateTokens(
  integrationId: string,
  accessToken: string,
  expiresAt: Date
): Promise<void> {
  const tokenDoc = doc(db, TOKENS_COLLECTION, integrationId);
  await setDoc(
    tokenDoc,
    {
      accessToken, // In production, encrypt this
      expiresAt: Timestamp.fromDate(expiresAt),
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}
