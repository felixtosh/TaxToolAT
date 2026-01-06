import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { logAIUsageToFirestore } from "@/lib/ai/usage-logger";

// Initialize Firebase for server-side
const firebaseConfig = {
  apiKey: "AIzaSyDhxXMbHgaD1z9n0bkuVaSRmmiCrbNL-l4",
  authDomain: "taxstudio-f12fb.firebaseapp.com",
  projectId: "taxstudio-f12fb",
  storageBucket: "taxstudio-f12fb.firebasestorage.app",
  messagingSenderId: "534848611676",
  appId: "1:534848611676:web:8a3d1ede57c65b7e884d99",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig, "lookup-company") : getApps().find(a => a.name === "lookup-company") || initializeApp(firebaseConfig, "lookup-company");
const db = getFirestore(app);

// Connect to Firestore emulator in development
let emulatorConnected = false;
if (process.env.NODE_ENV === "development" && !emulatorConnected) {
  try {
    connectFirestoreEmulator(db, "localhost", 8080);
    emulatorConnected = true;
  } catch {
    // Already connected
  }
}

const MOCK_USER_ID = "dev-user-123";

interface CompanyInfo {
  name?: string;
  aliases?: string[];
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

// Try to fetch a page and return its text content
async function fetchPageContent(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TaxStudio/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const html = await response.text();
    // Basic HTML to text conversion - strip tags
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return text.slice(0, 15000); // Limit content size
  } catch {
    return null;
  }
}

// Extract company info from page content using Claude (Haiku for structured extraction)
async function extractFromContent(
  anthropic: Anthropic,
  content: string,
  domain: string
): Promise<CompanyInfo | null> {
  try {
    const response = await anthropic.messages.create({
      model: "claude-3-5-haiku-20241022", // Using Haiku for structured JSON extraction
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Extract company information from this Impressum/Imprint page content:

${content}

Look for:
- Official registered company name (e.g., "Company GmbH", "Company AG")
- Trade names or aliases (shorter marketing names different from official name)
- VAT ID / UID number (format: country code + numbers, e.g., ATU12345678, DE123456789)
- Address (street, city, postal code, country)
- Country (ISO 2-letter code like AT, DE, CH)

Return ONLY a JSON object with this structure (include only fields you found):
{
  "name": "Official Company Name GmbH",
  "aliases": ["Trade Name", "Short Name"],
  "vatId": "ATU12345678",
  "country": "AT",
  "address": {
    "street": "Street Name 123",
    "city": "City",
    "postalCode": "1234",
    "country": "AT"
  }
}

If no company info found, return {}. Return ONLY the JSON, no explanation.`,
        },
      ],
    });

    // Log AI usage
    await logAIUsageToFirestore(db, MOCK_USER_ID, {
      function: "companyLookup",
      model: "claude-3-5-haiku-20241022",
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      metadata: { webSearchUsed: false },
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const info: CompanyInfo = JSON.parse(jsonMatch[0]);
    info.website = domain;
    return info;
  } catch {
    return null;
  }
}

// Check if company info is complete enough
function isComplete(info: CompanyInfo | null): boolean {
  if (!info) return false;
  // Consider complete if we have at least name and (vatId or address)
  return !!info.name && (!!info.vatId || !!info.address?.city);
}

// Search for company info using Claude web search
async function searchForCompanyInfo(
  anthropic: Anthropic,
  normalizedUrl: string,
  domain: string
): Promise<CompanyInfo> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    tools: [
      {
        type: "web_search_20250305" as const,
        name: "web_search",
        max_uses: 5,
      },
    ],
    messages: [
      {
        role: "user",
        content: `Find the official company information for: ${normalizedUrl}

Search strategy:
1. First search for "${domain} impressum" to find the company's legal page
2. Then search for the company name + "UID" or "ATU" to find the VAT number
3. If needed, search the company name in official registers (Firmenbuch, Handelsregister)

Extract:
- Official registered company name (not marketing names)
- Any trade names or aliases
- VAT ID / UID number (format: ATU12345678, DE123456789, etc.)
- Registered address
- Country (ISO 2-letter code)

Return ONLY a JSON object:
{
  "name": "Official Company Name GmbH",
  "aliases": ["Trade Name"],
  "vatId": "ATU12345678",
  "country": "AT",
  "address": {
    "street": "Street 123",
    "city": "Vienna",
    "postalCode": "1010",
    "country": "AT"
  }
}

Include only fields you found from official sources. If nothing found, return {}.
Return ONLY the JSON, no explanation.`,
      },
    ],
  });

  // Log AI usage
  await logAIUsageToFirestore(db, MOCK_USER_ID, {
    function: "companyLookup",
    model: "claude-sonnet-4-20250514",
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    metadata: { webSearchUsed: true },
  });

  let jsonText = "";
  for (const block of response.content) {
    if (block.type === "text") {
      jsonText += block.text;
    }
  }

  const jsonMatch = jsonText.trim().match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { website: domain };
  }

  const info: CompanyInfo = JSON.parse(jsonMatch[0]);
  info.website = domain;
  return info;
}

// Search for company by name (no URL provided)
async function searchByCompanyName(
  anthropic: Anthropic,
  companyName: string
): Promise<CompanyInfo> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    tools: [
      {
        type: "web_search_20250305" as const,
        name: "web_search",
        max_uses: 5,
      },
    ],
    messages: [
      {
        role: "user",
        content: `Find the official company information for: "${companyName}"

Search strategy:
1. Search for "${companyName} official website" to find the company's website
2. Search for "${companyName} impressum" or "${companyName} imprint" to find legal info
3. Search for "${companyName} VAT number" or "${companyName} UID" to find tax ID
4. If needed, search in official company registers (Firmenbuch, Handelsregister)

Extract:
- Official registered company name (verify it matches "${companyName}")
- Company website URL
- Any trade names or aliases
- VAT ID / UID number (format: ATU12345678, DE123456789, etc.)
- Registered address
- Country (ISO 2-letter code)

Return ONLY a JSON object:
{
  "name": "Official Company Name GmbH",
  "website": "example.com",
  "aliases": ["Trade Name"],
  "vatId": "ATU12345678",
  "country": "AT",
  "address": {
    "street": "Street 123",
    "city": "Vienna",
    "postalCode": "1010",
    "country": "AT"
  }
}

Include only fields you found from official sources. If nothing found, return {}.
Return ONLY the JSON, no explanation.`,
      },
    ],
  });

  // Log AI usage
  await logAIUsageToFirestore(db, MOCK_USER_ID, {
    function: "companyLookup",
    model: "claude-sonnet-4-20250514",
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    metadata: { webSearchUsed: true },
  });

  let jsonText = "";
  for (const block of response.content) {
    if (block.type === "text") {
      jsonText += block.text;
    }
  }

  const jsonMatch = jsonText.trim().match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {};
  }

  const info: CompanyInfo = JSON.parse(jsonMatch[0]);
  return info;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { url, name } = body;

    // Name-only search (no URL)
    if (name && typeof name === "string" && !url) {
      const anthropic = new Anthropic();
      const info = await searchByCompanyName(anthropic, name.trim());
      return NextResponse.json(info);
    }

    // URL-based search
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL or name is required" }, { status: 400 });
    }

    // Normalize URL
    let normalizedUrl = url.trim();
    if (
      !normalizedUrl.startsWith("http://") &&
      !normalizedUrl.startsWith("https://")
    ) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    // Extract domain for website field
    const domain = normalizedUrl.replace(/^https?:\/\//, "").split("/")[0];
    const baseUrl = `https://${domain}`;

    const anthropic = new Anthropic();

    // Step 1: Try to fetch impressum pages directly
    const impressumPaths = [
      "/impressum",
      "/imprint",
      "/about/impressum",
      "/legal/impressum",
      "/de/impressum",
      "/kontakt/impressum",
    ];

    for (const path of impressumPaths) {
      const content = await fetchPageContent(`${baseUrl}${path}`);
      if (content && content.length > 200) {
        const info = await extractFromContent(anthropic, content, domain);
        if (isComplete(info)) {
          return NextResponse.json(info);
        }
      }
    }

    // Step 2: Fallback to web search
    const info = await searchForCompanyInfo(anthropic, normalizedUrl, domain);
    return NextResponse.json(info);
  } catch (error) {
    console.error("Company lookup error:", error);

    // Try to at least return the domain
    try {
      const body = await req.clone().json();
      const domain = body.url?.trim().replace(/^https?:\/\//, "").split("/")[0];
      if (domain) {
        return NextResponse.json({ website: domain });
      }
    } catch {
      // Ignore
    }

    return NextResponse.json(
      { error: "Failed to lookup company" },
      { status: 500 }
    );
  }
}
