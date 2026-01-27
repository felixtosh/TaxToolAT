export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getServerUserIdWithFallback } from "@/lib/auth/get-server-user";

const db = getAdminDb();

const INTEGRATIONS_COLLECTION = "emailIntegrations";
const TOKENS_COLLECTION = "emailTokens";
const FILES_COLLECTION = "files";
const USERS_COLLECTION = "users";

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

    const userId = await getServerUserIdWithFallback(request);
    const now = Timestamp.now();

    // 1. Check if this email is already connected (active)
    const existingQuery = await db
      .collection(INTEGRATIONS_COLLECTION)
      .where("userId", "==", userId)
      .where("email", "==", email)
      .where("isActive", "==", true)
      .limit(1)
      .get();

    if (!existingQuery.empty) {
      const existingDoc = existingQuery.docs[0];
      const existingId = existingDoc.id;

      // Update the existing integration with new tokens
      await updateTokens(existingId, accessToken, new Date(expiresAt), userId);

      // Clear the reauth flag after successful token refresh
      await db.collection(INTEGRATIONS_COLLECTION).doc(existingId).update({
        needsReauth: false,
        lastError: null,
        tokenExpiresAt: Timestamp.fromDate(new Date(expiresAt)),
        updatedAt: now,
      });

      return NextResponse.json({
        success: true,
        integrationId: existingId,
        isExisting: true,
        isReconnected: false,
        message: "Integration tokens updated",
      });
    }

    // 2. Check if there's a disconnected integration for this email (reconnection)
    const disconnectedQuery = await db
      .collection(INTEGRATIONS_COLLECTION)
      .where("userId", "==", userId)
      .where("email", "==", email)
      .where("isActive", "==", false)
      .limit(1)
      .get();

    if (!disconnectedQuery.empty) {
      const disconnectedDoc = disconnectedQuery.docs[0];
      const disconnectedId = disconnectedDoc.id;

      // Update tokens for the reconnection
      await updateTokens(disconnectedId, accessToken, new Date(expiresAt), userId);

      // Reconnect the integration (clears disconnectedAt, sets isActive = true)
      await db.collection(INTEGRATIONS_COLLECTION).doc(disconnectedId).update({
        isActive: true,
        disconnectedAt: null,
        needsReauth: false,
        lastError: null,
        tokenExpiresAt: Timestamp.fromDate(new Date(expiresAt)),
        updatedAt: now,
      });

      // Restore soft-deleted files
      const restoreResult = await restoreFilesForIntegration(userId, disconnectedId);
      console.log(
        `[Reconnect] Restored ${restoreResult.restored} files for ${email}`
      );

      // Ensure email is in user's own emails list
      if (email) {
        await addOwnEmail(userId, email);
      }

      return NextResponse.json({
        success: true,
        integrationId: disconnectedId,
        isExisting: true,
        isReconnected: true,
        filesRestored: restoreResult.restored,
        message: "Gmail integration reconnected successfully",
      });
    }

    // 3. Create new integration
    const integrationData = {
      userId,
      provider: "gmail",
      email,
      displayName: displayName || null,
      accountId: googleUserId,
      isActive: true,
      needsReauth: false,
      tokenExpiresAt: Timestamp.fromDate(new Date(expiresAt)),
      syncEnabled: true,
      createdAt: now,
      updatedAt: now,
    };

    const integrationRef = await db.collection(INTEGRATIONS_COLLECTION).add(integrationData);
    const integrationId = integrationRef.id;

    // Store tokens in secure server-side collection
    await storeTokens(integrationId, accessToken, "", new Date(expiresAt), userId);

    // Auto-add email to user's own emails list
    if (email) {
      await addOwnEmail(userId, email);
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
  expiresAt: Date,
  userId: string
): Promise<void> {
  await db.collection(TOKENS_COLLECTION).doc(integrationId).set({
    integrationId,
    userId,
    provider: "gmail",
    accessToken,
    refreshToken,
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
  expiresAt: Date,
  userId: string
): Promise<void> {
  await db.collection(TOKENS_COLLECTION).doc(integrationId).set(
    {
      accessToken,
      expiresAt: Timestamp.fromDate(expiresAt),
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}

/**
 * Restore soft-deleted files for an integration
 */
async function restoreFilesForIntegration(
  userId: string,
  integrationId: string
): Promise<{ restored: number }> {
  const filesQuery = await db
    .collection(FILES_COLLECTION)
    .where("userId", "==", userId)
    .where("gmailIntegrationId", "==", integrationId)
    .where("isDeleted", "==", true)
    .get();

  let restored = 0;
  const now = Timestamp.now();

  for (const fileDoc of filesQuery.docs) {
    await fileDoc.ref.update({
      isDeleted: false,
      deletedAt: null,
      restoredAt: now,
      updatedAt: now,
    });
    restored++;
  }

  return { restored };
}

/**
 * Add an email to the user's own emails list
 */
async function addOwnEmail(userId: string, email: string): Promise<void> {
  const userRef = db.collection(USERS_COLLECTION).doc(userId);

  try {
    await userRef.update({
      ownEmails: FieldValue.arrayUnion(email.toLowerCase()),
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    // If user doc doesn't exist, create it
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      await userRef.set({
        ownEmails: [email.toLowerCase()],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    }
  }
}
