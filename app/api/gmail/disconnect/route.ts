import { NextRequest, NextResponse } from "next/server";
import { doc, getDoc, deleteDoc } from "firebase/firestore";
import { getServerDb, MOCK_USER_ID } from "@/lib/firebase/config-server";
import {
  getEmailIntegration,
  deleteEmailIntegration,
  removeIntegrationFromPatterns,
} from "@/lib/operations";
import { revokeGoogleAccess } from "@/lib/firebase/auth-gmail";

const db = getServerDb();
const TOKENS_COLLECTION = "emailTokens";

/**
 * DELETE /api/gmail/disconnect
 * Disconnect a Gmail integration
 *
 * Query: integrationId
 */
export async function DELETE(request: NextRequest) {
  try {
    const integrationId = request.nextUrl.searchParams.get("integrationId");

    if (!integrationId) {
      return NextResponse.json(
        { error: "integrationId is required" },
        { status: 400 }
      );
    }

    const ctx = { db, userId: MOCK_USER_ID };

    // Verify integration exists and belongs to user
    const integration = await getEmailIntegration(ctx, integrationId);
    if (!integration) {
      return NextResponse.json(
        { error: "Integration not found" },
        { status: 404 }
      );
    }

    // Get tokens to revoke
    const tokens = await getTokens(integrationId);
    if (tokens?.accessToken) {
      try {
        await revokeGoogleAccess(tokens.accessToken);
      } catch (error) {
        // Log but don't fail - token might already be invalid
        console.warn("Failed to revoke Google access:", error);
      }
    }

    // Delete tokens from secure storage
    try {
      const tokenDoc = doc(db, TOKENS_COLLECTION, integrationId);
      await deleteDoc(tokenDoc);
    } catch (error) {
      console.warn("Failed to delete tokens:", error);
    }

    // Remove integration ID from any partner patterns
    await removeIntegrationFromPatterns(ctx, integrationId);

    // Soft-delete the integration
    await deleteEmailIntegration(ctx, integrationId);

    return NextResponse.json({
      success: true,
      message: "Gmail integration disconnected successfully",
    });
  } catch (error) {
    console.error("Error disconnecting Gmail:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to disconnect Gmail" },
      { status: 500 }
    );
  }
}

/**
 * Get tokens from secure storage
 */
async function getTokens(integrationId: string): Promise<{
  accessToken: string;
  refreshToken?: string;
} | null> {
  const tokenDoc = doc(db, TOKENS_COLLECTION, integrationId);
  const snapshot = await getDoc(tokenDoc);

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data();
  return {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
  };
}
