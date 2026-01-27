/**
 * Banking Providers API
 *
 * Lists all available banking providers and their configuration status
 */

export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import {
  getBankingProviderInfo,
  initializeBankingProviders,
} from "@/lib/banking";

// Initialize providers on module load
initializeBankingProviders();

export async function GET() {
  try {
    const providers = getBankingProviderInfo();

    return NextResponse.json({
      providers: providers.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        supportedCountries: p.supportedCountries,
        logoUrl: p.logoUrl,
        isEnabled: p.isEnabled,
        requiresReauth: p.requiresReauth,
        reauthDays: p.reauthDays,
      })),
      enabledCount: providers.filter((p) => p.isEnabled).length,
    });
  } catch (error) {
    console.error("[Banking Providers API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch providers" },
      { status: 500 }
    );
  }
}
