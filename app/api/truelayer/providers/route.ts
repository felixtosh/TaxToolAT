export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { getProviders } from "@/lib/truelayer";

/**
 * GET /api/truelayer/providers
 * List available banks/providers
 *
 * Query params:
 * - country: ISO country code (e.g., "at", "de", "gb")
 */
export async function GET(request: NextRequest) {
  try {
    const country = request.nextUrl.searchParams.get("country");

    const providers = await getProviders(country || undefined);

    // Transform to match our UI expectations
    // TrueLayer uses logo_url, not logo_uri
    const institutions = providers.map((p) => ({
      id: p.provider_id,
      name: p.display_name,
      logo: p.logo_url || p.logo_uri || "",
      countries: [p.country],
      bic: "",
      transaction_total_days: "90",
    }));

    return NextResponse.json({ institutions });
  } catch (error) {
    console.error("Error fetching providers:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch providers" },
      { status: 500 }
    );
  }
}
