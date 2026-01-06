import { NextRequest, NextResponse } from "next/server";
import { getTrueLayerClient } from "@/lib/truelayer";

/**
 * POST /api/truelayer/connect
 * Get authorization URL to connect a bank
 *
 * Body: { providerId?, sourceId? }
 * - providerId: Optional specific bank to connect
 * - sourceId: Optional existing source to link after auth
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { providerId, providerName, providerLogo, sourceId } = body;

    const client = getTrueLayerClient();

    // Create state to pass through OAuth flow
    // This survives the redirect and contains provider info + sourceId
    const state = Buffer.from(JSON.stringify({
      providerId: providerId || null,
      providerName: providerName || "Unknown Bank",
      providerLogo: providerLogo || null,
      sourceId: sourceId || null,
      ts: Date.now(),
    })).toString("base64url");

    const authUrl = client.getAuthUrl(providerId, state);

    return NextResponse.json({ authUrl, state });
  } catch (error) {
    console.error("Error creating auth URL:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create auth URL" },
      { status: 500 }
    );
  }
}
