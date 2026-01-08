"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lookupCompany = void 0;
const https_1 = require("firebase-functions/v2/https");
const vertexai_1 = require("@google-cloud/vertexai");
// Get project ID from environment (Firebase sets this automatically)
function getProjectId() {
    return process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "taxstudio-f12fb";
}
const VERTEX_LOCATION = "europe-west1";
// Try to fetch a page and return its text content
async function fetchPageContent(url) {
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
        if (!response.ok)
            return null;
        const html = await response.text();
        // Basic HTML to text conversion - strip tags
        const text = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        return text.slice(0, 15000);
    }
    catch {
        return null;
    }
}
// Extract company info from page content using Gemini Flash
async function extractFromContent(model, content, domain) {
    try {
        const result = await model.generateContent({
            contents: [{
                    role: "user",
                    parts: [{
                            text: `Extract company information from this Impressum/Imprint page content:

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

If no company info found, return {}. Return ONLY the JSON, no explanation.`
                        }]
                }],
        });
        const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch)
            return null;
        const info = JSON.parse(jsonMatch[0]);
        info.website = domain;
        return info;
    }
    catch (error) {
        console.error("Extract from content failed:", error);
        return null;
    }
}
// Check if company info is complete enough
function isComplete(info) {
    if (!info)
        return false;
    return !!info.name && (!!info.vatId || !!info.address?.city);
}
// Search for company info by URL using Google Search grounding
async function searchByUrl(vertexAI, normalizedUrl, domain) {
    // Use model with Google Search grounding (snake_case for API)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const googleSearchTool = { google_search: {} };
    const model = vertexAI.getGenerativeModel({
        model: "gemini-2.0-flash-001",
        tools: [googleSearchTool],
    });
    const result = await model.generateContent({
        contents: [{
                role: "user",
                parts: [{
                        text: `Search for the official company information for: ${normalizedUrl}

Search for "${domain} impressum" or "${domain} imprint" to find official company info.

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
Return ONLY the JSON, no explanation.`
                    }]
            }],
    });
    const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const jsonMatch = text.trim().match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        return { website: domain };
    }
    const info = JSON.parse(jsonMatch[0]);
    info.website = domain;
    return info;
}
// Search for company by name using Google Search grounding
async function searchByName(vertexAI, companyName) {
    // Use model with Google Search grounding (snake_case for API)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const googleSearchTool = { google_search: {} };
    const model = vertexAI.getGenerativeModel({
        model: "gemini-2.0-flash-001",
        tools: [googleSearchTool],
    });
    const result = await model.generateContent({
        contents: [{
                role: "user",
                parts: [{
                        text: `Search for the official company information for: "${companyName}"

Search for "${companyName} impressum" or "${companyName} official website" to find official company info.

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
Return ONLY the JSON, no explanation.`
                    }]
            }],
    });
    const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const jsonMatch = text.trim().match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        return {};
    }
    return JSON.parse(jsonMatch[0]);
}
/**
 * Look up company information by URL or name.
 * Uses Gemini Flash via Vertex AI (service account auth).
 */
exports.lookupCompany = (0, https_1.onCall)({
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 30,
}, async (request) => {
    const { url, name } = request.data;
    const projectId = getProjectId();
    const vertexAI = new vertexai_1.VertexAI({ project: projectId, location: VERTEX_LOCATION });
    // Model without grounding for extracting from fetched content
    const extractionModel = vertexAI.getGenerativeModel({ model: "gemini-2.0-flash-001" });
    try {
        // Name-only search (uses Google Search grounding)
        if (name && typeof name === "string" && !url) {
            return await searchByName(vertexAI, name.trim());
        }
        // URL-based search
        if (!url || typeof url !== "string") {
            throw new https_1.HttpsError("invalid-argument", "URL or name is required");
        }
        // Normalize URL
        let normalizedUrl = url.trim();
        if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
            normalizedUrl = `https://${normalizedUrl}`;
        }
        const domain = normalizedUrl.replace(/^https?:\/\//, "").split("/")[0];
        const baseUrl = `https://${domain}`;
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
                const info = await extractFromContent(extractionModel, content, domain);
                if (isComplete(info)) {
                    return info;
                }
            }
        }
        // Step 2: Fallback to Google Search grounding
        return await searchByUrl(vertexAI, normalizedUrl, domain);
    }
    catch (error) {
        console.error("Company lookup error:", error);
        // Try to at least return the domain
        if (url) {
            const domain = url.trim().replace(/^https?:\/\//, "").split("/")[0];
            if (domain) {
                return { website: domain };
            }
        }
        throw new https_1.HttpsError("internal", "Failed to lookup company");
    }
});
//# sourceMappingURL=lookupCompany.js.map