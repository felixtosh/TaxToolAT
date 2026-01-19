import { NextRequest, NextResponse } from "next/server";
import { getServerDb } from "@/lib/firebase/config-server";
import { getServerUserIdWithFallback } from "@/lib/auth/get-server-user";
import {
  listInboundEmailAddresses,
  createInboundEmailAddress,
} from "@/lib/operations";

const db = getServerDb();

/**
 * GET /api/email-inbound
 * List all inbound email addresses for the current user
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getServerUserIdWithFallback(request);
    const ctx = { db, userId };
    const addresses = await listInboundEmailAddresses(ctx);

    return NextResponse.json({ addresses });
  } catch (error) {
    console.error("[email-inbound] Error listing addresses:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list addresses" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/email-inbound
 * Create a new inbound email address
 *
 * Body: { displayName?, allowedDomains?, dailyLimit? }
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserIdWithFallback(request);
    const body = await request.json().catch(() => ({}));
    const { displayName, allowedDomains, dailyLimit } = body;

    const ctx = { db, userId };
    const result = await createInboundEmailAddress(ctx, {
      displayName,
      allowedDomains,
      dailyLimit,
    });

    return NextResponse.json({
      success: true,
      id: result.id,
      email: result.email,
    });
  } catch (error) {
    console.error("[email-inbound] Error creating address:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create address" },
      { status: 500 }
    );
  }
}
