import { onCall, HttpsError } from "firebase-functions/v2/https";
import { VertexAI } from "@google-cloud/vertexai";

// Get project ID from environment (Firebase sets this automatically)
function getProjectId(): string {
  const projectId =
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    throw new Error("Could not determine Google Cloud project ID");
  }
  return projectId;
}

const VERTEX_LOCATION = process.env.VERTEX_LOCATION || "europe-west1";

interface GenerateFileSearchQueryRequest {
  /** Transaction description/booking text */
  transactionName?: string;
  /** Counterparty name from transaction */
  transactionPartner?: string;
  /** Bank reference number */
  transactionReference?: string;
  /** Counterparty IBAN */
  partnerIban?: string;
  /** Matched partner name (from UserPartner) */
  partnerName?: string;
  amount?: number;
  currency?: string;
  date?: string;
}

interface GenerateFileSearchQueryResponse {
  query: string;
  fallback?: boolean;
}

/**
 * Generate a file search query for finding receipts related to a transaction.
 * Uses Gemini 2.0 Flash Lite via Vertex AI (no API key needed).
 */
export const generateFileSearchQuery = onCall<GenerateFileSearchQueryRequest>(
  {
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 30,
    cors: true, // Allow CORS for local development
  },
  async (request): Promise<GenerateFileSearchQueryResponse> => {
    const {
      transactionName,
      transactionPartner,
      transactionReference,
      partnerIban,
      partnerName,
      amount,
      currency,
      date,
    } = request.data;

    // Need at least some transaction info
    if (!transactionName && !transactionPartner && !partnerName && !transactionReference) {
      throw new HttpsError(
        "invalid-argument",
        "At least one transaction field is required"
      );
    }

    // Build context for the AI - include all available fields
    const contextParts: string[] = [];
    if (partnerName) contextParts.push(`Matched partner name: ${partnerName}`);
    if (transactionPartner && transactionPartner !== partnerName) {
      contextParts.push(`Counterparty field: ${transactionPartner}`);
    }
    if (transactionName) contextParts.push(`Booking text: ${transactionName}`);
    if (transactionReference) contextParts.push(`Reference: ${transactionReference}`);
    if (partnerIban) contextParts.push(`IBAN: ${partnerIban}`);
    if (amount) {
      contextParts.push(
        `Amount: ${Math.abs(amount / 100).toFixed(2)} ${currency || "EUR"}`
      );
    }
    if (date) contextParts.push(`Date: ${date}`);

    const prompt = `Extract ONE simple keyword to search for receipt files. Return ONLY ONE WORD.

Transaction:
${contextParts.join("\n")}

Rules:
- Return exactly ONE word, lowercase
- Extract the company/brand name only
- Ignore: GmbH, Inc, LLC, AG, numbers, dates, locations
- Ignore payment prefixes: PP*, SQ*, EC, SEPA

Examples:
"AMAZON.DE MARKETPLACE" → amazon
"PP*NETFLIX.COM" → netflix
"REWE SAGT DANKE 12345" → rewe
"Google Cloud EMEA Ltd" → google
"LIDL SAGT DANKE" → lidl
"Media Markt 1070 Wien" → mediamarkt
"SPOTIFY AB" → spotify
"Apple.com/bill" → apple

ONE word:`;

    try {
      const projectId = getProjectId();
      const vertexAI = new VertexAI({ project: projectId, location: VERTEX_LOCATION });
      const model = vertexAI.getGenerativeModel({ model: "gemini-2.0-flash-lite-001" });

      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 50,
          temperature: 0.1,
        },
      });

      const response = result.response;
      let searchQuery =
        response.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toLowerCase() || "";

      // Validate the result - should be short and not contain explanation
      if (searchQuery.length > 50 || searchQuery.includes("\n")) {
        // Fallback: extract first few words
        searchQuery = searchQuery.split(/\s+/).slice(0, 3).join(" ");
      }

      // Remove quotes if present
      searchQuery = searchQuery.replace(/^["']|["']$/g, "");

      if (searchQuery) {
        return { query: searchQuery };
      }
    } catch (error) {
      console.error("Gemini query generation failed:", error);
    }

    // Fallback to simple extraction - try multiple fields
    const fallbackQuery = extractSimpleQuery(
      partnerName,
      transactionPartner,
      transactionName,
      transactionReference
    );
    return { query: fallbackQuery, fallback: true };
  }
);

/**
 * Simple fallback query extraction without AI.
 * Tries multiple fields in priority order.
 */
function extractSimpleQuery(
  partnerName?: string,
  transactionPartner?: string,
  transactionName?: string,
  transactionReference?: string
): string {
  // Priority order: matched partner > counterparty > booking text > reference
  const candidates = [partnerName, transactionPartner, transactionName, transactionReference]
    .filter(Boolean)
    .map((text) => cleanText(text!));

  // Return the first valid cleaned text
  for (const cleaned of candidates) {
    if (cleaned && cleaned.length >= 2 && !looksLikeCardNumber(cleaned)) {
      return cleaned;
    }
  }

  return "";
}

/**
 * Clean a text field for use as search query - returns single word
 */
function cleanText(text: string): string {
  const cleaned = text
    .replace(/^(PP\*|SQ\*|PAYPAL\s*\*|EC\s+|SEPA\s+)/i, "") // Payment prefixes
    .replace(/\.(com|de|at|ch|eu|net|org|io)(\/.*)?$/i, "") // Domain suffixes
    .replace(/\s+(GMBH|AG|INC|LLC|LTD|SAGT DANKE|MARKETPLACE|LASTSCHRIFT|GUTSCHRIFT|AB|BV|NV).*$/i, "")
    .replace(/\s+\d{4,}.*$/, "") // Trailing numbers
    .replace(/\d{6,}\*+\d+/g, "") // Masked card numbers
    .replace(/[*]{3,}/g, "") // Multiple asterisks
    .replace(/[^a-zA-Z\s]/g, " ") // Remove non-letters except spaces
    .trim()
    .toLowerCase();

  // Return first significant word only
  const words = cleaned
    .split(/\s+/)
    .filter((w) => w.length > 2);

  return words[0] || "";
}

/**
 * Check if text looks like a masked card number
 */
function looksLikeCardNumber(text: string): boolean {
  // Matches patterns like "516760******1526" or "4111********1111"
  return /^\d{4,6}\*+\d{4}$/.test(text.replace(/\s/g, ""));
}
