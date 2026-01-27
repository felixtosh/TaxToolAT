/**
 * Unified Banking Institutions API
 *
 * Lists available financial institutions from all configured providers
 * (GoCardless, TrueLayer) or a specific provider.
 */

export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import {
  getBankingProvider,
  getEnabledBankingProviders,
  BankingProviderId,
  initializeBankingProviders,
} from "@/lib/banking";

// Initialize providers on module load
initializeBankingProviders();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const countryCode = searchParams.get("country");
    const providerId = searchParams.get("provider") as BankingProviderId | null;

    if (!countryCode) {
      return NextResponse.json(
        { error: "Country code is required" },
        { status: 400 }
      );
    }

    // Normalize country code
    const country = countryCode.toUpperCase();

    // Get institutions from specified provider or all providers
    if (providerId) {
      try {
        const provider = getBankingProvider(providerId);
        if (!provider.isConfigured()) {
          return NextResponse.json(
            { error: `Provider ${providerId} is not configured` },
            { status: 400 }
          );
        }

        const institutions = await provider.listInstitutions(country);
        return NextResponse.json({
          institutions: institutions.map((inst) => ({
            id: inst.id,
            name: inst.name,
            logo: inst.logoUrl,
            bic: inst.bic,
            countries: inst.countries,
            transaction_total_days: inst.maxHistoryDays.toString(),
            providerId: inst.providerId,
          })),
          provider: providerId,
        });
      } catch (error) {
        return NextResponse.json(
          { error: `Provider ${providerId} not available` },
          { status: 400 }
        );
      }
    }

    // Query all enabled providers
    const enabledProviders = getEnabledBankingProviders();

    if (enabledProviders.length === 0) {
      return NextResponse.json(
        {
          error:
            "No banking providers configured. Set GOCARDLESS_* or TRUELAYER_* environment variables.",
        },
        { status: 500 }
      );
    }

    // Fetch from all providers in parallel
    const results = await Promise.allSettled(
      enabledProviders.map(async (provider) => {
        const institutions = await provider.listInstitutions(country);
        return institutions.map((inst) => ({
          id: inst.id,
          name: inst.name,
          logo: inst.logoUrl,
          bic: inst.bic,
          countries: inst.countries,
          transaction_total_days: inst.maxHistoryDays.toString(),
          providerId: inst.providerId,
        }));
      })
    );

    // Merge results, handling failures gracefully
    const allInstitutions: Array<{
      id: string;
      name: string;
      logo?: string;
      bic?: string;
      countries: string[];
      transaction_total_days: string;
      providerId: BankingProviderId;
    }> = [];

    const errors: string[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "fulfilled") {
        allInstitutions.push(...result.value);
      } else {
        const provider = enabledProviders[i];
        errors.push(`${provider.id}: ${result.reason?.message || "Unknown error"}`);
      }
    }

    // Sort by name
    allInstitutions.sort((a, b) => a.name.localeCompare(b.name));

    // Deduplicate by name (in case same bank appears in multiple providers)
    // Keep the first occurrence (preserving the original order)
    const seen = new Set<string>();
    const deduped = allInstitutions.filter((inst) => {
      const key = inst.name.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

    return NextResponse.json({
      institutions: deduped,
      providers: enabledProviders.map((p) => p.id),
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("[Banking API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch institutions" },
      { status: 500 }
    );
  }
}
