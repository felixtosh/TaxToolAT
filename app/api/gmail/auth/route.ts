import { NextRequest, NextResponse } from "next/server";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { getServerDb, MOCK_USER_ID } from "@/lib/firebase/config-server";
import {
  createEmailIntegration,
  getEmailIntegrationByEmail,
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

    // Check if this email is already connected
    const existing = await getEmailIntegrationByEmail(ctx, email);
    if (existing) {
      // Update the existing integration with new tokens
      await updateTokens(existing.id, accessToken, new Date(expiresAt));

      return NextResponse.json({
        success: true,
        integrationId: existing.id,
        isExisting: true,
        message: "Integration tokens updated",
      });
    }

    // Create new integration
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

    return NextResponse.json({
      success: true,
      integrationId,
      isExisting: false,
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
