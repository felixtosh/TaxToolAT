import { NextRequest, NextResponse } from "next/server";
import { getServerDb, MOCK_USER_ID } from "@/lib/firebase/config-server";
import {
  addEmailPatternToPartner,
  getEmailIntegration,
} from "@/lib/operations";

const db = getServerDb();

/**
 * POST /api/gmail/learn-pattern
 * Learn an email search pattern for a partner
 *
 * Body: {
 *   partnerId: string;
 *   pattern: string;
 *   integrationId: string;
 *   transactionId?: string;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { partnerId, pattern, integrationId, transactionId } = body;

    if (!partnerId || !pattern || !integrationId) {
      return NextResponse.json(
        { error: "Missing required fields: partnerId, pattern, integrationId" },
        { status: 400 }
      );
    }

    // Skip empty or very short patterns
    if (pattern.trim().length < 2) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "Pattern too short",
      });
    }

    const ctx = { db, userId: MOCK_USER_ID };

    // Verify the integration belongs to the user
    const integration = await getEmailIntegration(ctx, integrationId);
    if (!integration) {
      return NextResponse.json(
        { error: "Integration not found or unauthorized" },
        { status: 404 }
      );
    }

    // Add the pattern to the partner
    // Initial confidence is 60% for new patterns, will increase with usage
    await addEmailPatternToPartner(ctx, partnerId, {
      pattern: pattern.trim(),
      integrationIds: [integrationId],
      confidence: 60,
      sourceTransactionId: transactionId,
    });

    return NextResponse.json({
      success: true,
      message: "Pattern learned successfully",
    });
  } catch (error) {
    console.error("Error learning email pattern:", error);

    // Don't fail the request for pattern learning issues
    // This is a non-critical operation
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to learn pattern",
    });
  }
}
