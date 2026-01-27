export const dynamic = "force-dynamic";
/**
 * Unified Banking Connection API
 *
 * Creates bank connections through any configured provider
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerUserIdWithFallback } from "@/lib/auth/get-server-user";
import {
  getBankingProvider,
  BankingProviderId,
  initializeBankingProviders,
} from "@/lib/banking";
import { createBankConnection } from "@/lib/operations/banking-ops";
import { getAdminDb } from "@/lib/firebase/admin";
import { OperationsContext } from "@/lib/operations/types";

// Initialize providers on module load
initializeBankingProviders();

export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserIdWithFallback(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { providerId, institutionId, sourceId, maxHistoryDays, language } = body;

    // Validate required fields
    if (!providerId) {
      return NextResponse.json(
        { error: "Provider ID is required" },
        { status: 400 }
      );
    }

    if (!institutionId) {
      return NextResponse.json(
        { error: "Institution ID is required" },
        { status: 400 }
      );
    }

    // Validate provider exists and is configured
    let provider;
    try {
      provider = getBankingProvider(providerId as BankingProviderId);
    } catch {
      return NextResponse.json(
        { error: `Unknown provider: ${providerId}` },
        { status: 400 }
      );
    }

    if (!provider.isConfigured()) {
      return NextResponse.json(
        { error: `Provider ${providerId} is not configured` },
        { status: 400 }
      );
    }

    // Create connection using operations layer
    const ctx: OperationsContext = {
      db: getAdminDb() as any, // Firebase Admin DB
      userId,
    };

    const result = await createBankConnection(
      ctx,
      providerId as BankingProviderId,
      institutionId,
      {
        sourceId,
        maxHistoryDays,
        language,
      }
    );

    return NextResponse.json({
      connectionId: result.connectionId,
      authUrl: result.authUrl,
      expiresAt: result.expiresAt.toISOString(),
      provider: providerId,
    });
  } catch (error) {
    console.error("[Banking Connect API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create connection" },
      { status: 500 }
    );
  }
}
