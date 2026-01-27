export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { getGoCardlessClient } from "@/lib/gocardless";

/**
 * GET /api/gocardless/institutions?country=AT
 * List available financial institutions for a country
 */
export async function GET(request: NextRequest) {
  try {
    const country = request.nextUrl.searchParams.get("country");

    if (!country || country.length !== 2) {
      return NextResponse.json(
        { error: "Country code is required (2-letter ISO code)" },
        { status: 400 }
      );
    }

    const client = getGoCardlessClient();
    const institutions = await client.listInstitutions(country.toUpperCase());

    return NextResponse.json({ institutions });
  } catch (error) {
    console.error("Error fetching institutions:", error);

    if (error instanceof Error && error.message.includes("credentials not configured")) {
      return NextResponse.json(
        { error: "GoCardless is not configured" },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch institutions" },
      { status: 500 }
    );
  }
}
