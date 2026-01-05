import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

interface CompanyInfo {
  name?: string;
  vatId?: string;
  website?: string;
  country?: string;
  address?: {
    street?: string;
    city?: string;
    postalCode?: string;
    country?: string;
  };
}

export async function POST(req: Request) {
  try {
    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    // Normalize URL
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    const anthropic = new Anthropic();

    // Use Claude with web search to look up company info
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Look up the company website: ${normalizedUrl}

Extract the following company information and return it as JSON:
- name: The official company name
- vatId: VAT/Tax ID if available (format: country code + number, e.g., ATU12345678)
- website: The main website domain (without https://)
- country: ISO 2-letter country code (e.g., AT, DE, US)
- address: Object with street, city, postalCode, country

Only include fields you can confidently find. Return valid JSON only, no explanation.

Example response:
{
  "name": "Example Company GmbH",
  "vatId": "ATU12345678",
  "website": "example.com",
  "country": "AT",
  "address": {
    "street": "Main Street 123",
    "city": "Vienna",
    "postalCode": "1010",
    "country": "AT"
  }
}`,
        },
      ],
    });

    // Extract text content from response
    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      return NextResponse.json(
        { error: "No response from AI" },
        { status: 500 }
      );
    }

    // Parse JSON from response
    const text = textContent.text.trim();

    // Try to extract JSON from the response (in case there's extra text)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Could not parse company info" },
        { status: 500 }
      );
    }

    const companyInfo: CompanyInfo = JSON.parse(jsonMatch[0]);

    return NextResponse.json(companyInfo);
  } catch (error) {
    console.error("Company lookup error:", error);
    return NextResponse.json(
      { error: "Failed to lookup company" },
      { status: 500 }
    );
  }
}
