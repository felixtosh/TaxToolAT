"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lookupByVatId = exports.lookupCompany = void 0;
exports.createVertexAI = createVertexAI;
exports.searchByName = searchByName;
exports.parseVatId = parseVatId;
exports.queryViesApi = queryViesApi;
exports.parseViesAddress = parseViesAddress;
const https_1 = require("firebase-functions/v2/https");
const vertexai_1 = require("@google-cloud/vertexai");
const firestore_1 = require("firebase-admin/firestore");
const ai_usage_logger_1 = require("../utils/ai-usage-logger");
const db = (0, firestore_1.getFirestore)();
// VIES cache settings
const VIES_CACHE_COLLECTION = "viesCache";
const VIES_CACHE_DAYS = 30;
// Get project ID from environment (Firebase sets this automatically)
function getProjectId() {
    return process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "taxstudio-f12fb";
}
const VERTEX_LOCATION = "europe-west1";
/**
 * Create a VertexAI instance for company lookup.
 * Exported for use by other functions.
 */
function createVertexAI() {
    const projectId = getProjectId();
    return new vertexai_1.VertexAI({ project: projectId, location: VERTEX_LOCATION });
}
// Try to fetch a page and return its text content
async function fetchPageContent(url) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; FiBuKI/1.0)",
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
async function extractFromContent(model, content, domain, userId) {
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
        // Log token usage if userId provided
        const usageMetadata = result.response.usageMetadata;
        if (userId && usageMetadata) {
            await (0, ai_usage_logger_1.logAIUsage)(userId, {
                function: "companyLookup",
                model: "gemini-2.0-flash-001",
                inputTokens: usageMetadata.promptTokenCount || 0,
                outputTokens: usageMetadata.candidatesTokenCount || 0,
            });
        }
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
async function searchByUrl(vertexAI, normalizedUrl, domain, userId) {
    // Use model with Google Search grounding (snake_case for API)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const googleSearchTool = { google_search: {} };
    const modelName = "gemini-2.0-flash-001";
    const model = vertexAI.getGenerativeModel({
        model: modelName,
        tools: [googleSearchTool],
    });
    const result = await model.generateContent({
        contents: [{
                role: "user",
                parts: [{
                        text: `Find the company that OWNS and OPERATES the website: ${normalizedUrl}

IMPORTANT: I need the company behind THIS SPECIFIC WEBSITE, not companies with similar names.

Search strategy:
1. Search "site:${domain} impressum" or "site:${domain} imprint"
2. Search "${domain} who owns" or "${domain} company behind"
3. Look for legal/about pages on ${domain} itself

Extract ONLY if the company actually owns/operates ${domain}:
- Official registered company name
- Trade names or aliases
- VAT ID / UID number
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

If you cannot verify the company actually owns ${domain}, return {}.
Return ONLY the JSON, no explanation.`
                    }]
            }],
    });
    // Log token usage if userId provided
    const usageMetadata = result.response.usageMetadata;
    if (userId && usageMetadata) {
        await (0, ai_usage_logger_1.logAIUsage)(userId, {
            function: "companyLookupSearch",
            model: modelName,
            inputTokens: usageMetadata.promptTokenCount || 0,
            outputTokens: usageMetadata.candidatesTokenCount || 0,
            metadata: { webSearchUsed: true },
        });
    }
    const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const jsonMatch = text.trim().match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        return { website: domain };
    }
    const info = JSON.parse(jsonMatch[0]);
    info.website = domain;
    return info;
}
/**
 * Search for company by name using Google Search grounding.
 * Exported for use by other functions (e.g., matchFilePartner trigger).
 * @param userId - Optional user ID for token usage tracking
 */
async function searchByName(vertexAI, companyName, userId) {
    // Use model with Google Search grounding (snake_case for API)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const googleSearchTool = { google_search: {} };
    const modelName = "gemini-2.0-flash-001";
    const model = vertexAI.getGenerativeModel({
        model: modelName,
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
    // Log token usage if userId provided
    const usageMetadata = result.response.usageMetadata;
    if (userId && usageMetadata) {
        await (0, ai_usage_logger_1.logAIUsage)(userId, {
            function: "companyLookupSearch",
            model: modelName,
            inputTokens: usageMetadata.promptTokenCount || 0,
            outputTokens: usageMetadata.candidatesTokenCount || 0,
            metadata: { webSearchUsed: true },
        });
    }
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
    const userId = request.auth?.uid;
    const projectId = getProjectId();
    const vertexAI = new vertexai_1.VertexAI({ project: projectId, location: VERTEX_LOCATION });
    // Model without grounding for extracting from fetched content
    const extractionModel = vertexAI.getGenerativeModel({ model: "gemini-2.0-flash-001" });
    try {
        // Name-only search (uses Google Search grounding)
        if (name && typeof name === "string" && !url) {
            return await searchByName(vertexAI, name.trim(), userId);
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
                const info = await extractFromContent(extractionModel, content, domain, userId);
                if (isComplete(info)) {
                    return info;
                }
            }
        }
        // Step 2: Fallback to Google Search grounding
        return await searchByUrl(vertexAI, normalizedUrl, domain, userId);
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
// ============================================================================
// EU VIES VAT ID Lookup
// ============================================================================
/** EU member state country codes for VAT validation */
const EU_COUNTRIES = [
    "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES",
    "FI", "FR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT",
    "NL", "PL", "PT", "RO", "SE", "SI", "SK", "XI", // XI = Northern Ireland
];
/**
 * Parse a VAT ID string into country code and number.
 * Handles various formats: ATU12345678, AT U12345678, ATU 123 456 78, AT-U12345678
 */
function parseVatId(vatId) {
    // Remove all whitespace and non-alphanumeric characters
    const cleaned = vatId.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (cleaned.length < 4)
        return null;
    // Extract 2-letter country code prefix
    const countryCode = cleaned.substring(0, 2);
    const vatNumber = cleaned.substring(2);
    // Validate country code is valid EU member state
    if (!EU_COUNTRIES.includes(countryCode))
        return null;
    if (!vatNumber || vatNumber.length < 2)
        return null;
    return { countryCode, vatNumber };
}
/**
 * Normalize VIES text from ALL CAPS to title case
 */
function normalizeViesText(text) {
    return text
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .replace(/---+/g, "")
        .trim();
}
/**
 * Parse VIES XML response
 */
function parseViesResponse(xml) {
    // Check for SOAP Fault (errors like MS_MAX_CONCURRENT_REQ)
    const faultMatch = xml.match(/<(?:\w+:)?faultstring>([^<]+)<\/(?:\w+:)?faultstring>/);
    if (faultMatch) {
        const faultCode = xml.match(/<(?:\w+:)?faultcode>([^<]+)<\/(?:\w+:)?faultcode>/)?.[1] || "UNKNOWN";
        return { code: faultCode, message: faultMatch[1] };
    }
    // Parse successful response - handle namespace prefixes like ns2:, urn:, etc.
    const extractValue = (tag) => {
        // Match with optional namespace prefix (e.g., <ns2:valid> or <valid>)
        const match = xml.match(new RegExp(`<(?:\\w+:)?${tag}>([^<]*)</(?:\\w+:)?${tag}>`));
        return match?.[1]?.trim() || undefined;
    };
    const valid = extractValue("valid") === "true";
    const name = extractValue("name");
    const address = extractValue("address");
    const countryCode = extractValue("countryCode") || "";
    const vatNumber = extractValue("vatNumber") || "";
    const requestDate = extractValue("requestDate") || new Date().toISOString().split("T")[0];
    // Clean up VIES quirks (all-caps, trailing ----)
    const cleanName = name && name !== "---" ? normalizeViesText(name) : undefined;
    const cleanAddress = address && address !== "---" ? normalizeViesText(address) : undefined;
    return { valid, name: cleanName, address: cleanAddress, countryCode, vatNumber, requestDate };
}
/**
 * Query the EU VIES SOAP API for VAT validation
 */
async function queryViesApi(countryCode, vatNumber) {
    const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:urn="urn:ec.europa.eu:taxud:vies:services:checkVat:types">
  <soapenv:Body>
    <urn:checkVat>
      <urn:countryCode>${countryCode}</urn:countryCode>
      <urn:vatNumber>${vatNumber}</urn:vatNumber>
    </urn:checkVat>
  </soapenv:Body>
</soapenv:Envelope>`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
    try {
        const response = await fetch("https://ec.europa.eu/taxation_customs/vies/services/checkVatService", {
            method: "POST",
            headers: {
                "Content-Type": "text/xml; charset=utf-8",
                SOAPAction: "",
            },
            body: soapEnvelope,
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
            return { code: "HTTP_ERROR", message: `HTTP ${response.status}` };
        }
        const xml = await response.text();
        return parseViesResponse(xml);
    }
    catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === "AbortError") {
            return { code: "TIMEOUT", message: "VIES API request timed out" };
        }
        return { code: "NETWORK_ERROR", message: String(error) };
    }
}
/**
 * Parse VIES address string into structured format
 */
function parseViesAddress(addressString, countryCode) {
    if (!addressString)
        return undefined;
    // VIES format varies by country, but common pattern is:
    // "STREET NAME 123\nPOSTAL CITY" or "STREET 123, POSTAL CITY, COUNTRY"
    const lines = addressString.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    if (lines.length === 0)
        return undefined;
    // Attempt to extract postal code and city from last line(s)
    // Common EU postal codes: 4-6 digits, sometimes with letters (UK, NL)
    const lastLine = lines[lines.length - 1];
    const postalCityMatch = lastLine.match(/^(\d{4,6})\s+(.+)$/);
    if (postalCityMatch) {
        return {
            street: lines.slice(0, -1).join(", ") || undefined,
            postalCode: postalCityMatch[1],
            city: postalCityMatch[2],
            country: countryCode,
        };
    }
    // If no postal code pattern found, return street only
    return {
        street: lines.join(", "),
        country: countryCode,
    };
}
/**
 * Look up company information by EU VAT ID using the VIES service.
 * This is the official EU VAT validation service - results are authoritative.
 * Results are cached for 30 days to reduce VIES API load and improve reliability.
 */
exports.lookupByVatId = (0, https_1.onCall)({
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 30,
}, async (request) => {
    const { vatId } = request.data;
    if (!vatId || typeof vatId !== "string") {
        throw new https_1.HttpsError("invalid-argument", "VAT ID is required");
    }
    // Parse VAT ID
    const parsed = parseVatId(vatId);
    if (!parsed) {
        throw new https_1.HttpsError("invalid-argument", "Invalid VAT ID format. Expected EU format like ATU12345678");
    }
    const cacheKey = `${parsed.countryCode}${parsed.vatNumber}`;
    const cacheRef = db.collection(VIES_CACHE_COLLECTION).doc(cacheKey);
    // Check cache first
    const cachedDoc = await cacheRef.get();
    if (cachedDoc.exists) {
        const cached = cachedDoc.data();
        const age = Date.now() - cached.timestamp.toMillis();
        const maxAge = VIES_CACHE_DAYS * 24 * 60 * 60 * 1000;
        if (age < maxAge) {
            console.log(`[VIES] Cache hit for ${cacheKey} (age: ${Math.round(age / 86400000)}d)`);
            return cached.result;
        }
    }
    console.log(`[VIES] Looking up VAT ID: ${cacheKey}`);
    // Query VIES API
    const viesResult = await queryViesApi(parsed.countryCode, parsed.vatNumber);
    // Handle VIES errors
    if ("code" in viesResult) {
        console.warn(`[VIES] API error: ${viesResult.code} - ${viesResult.message}`);
        // On VIES timeout/error, return stale cache if available
        if (cachedDoc.exists) {
            console.log(`[VIES] Returning stale cache for ${cacheKey} due to API error`);
            return cachedDoc.data().result;
        }
        // Return partial info for known errors (still return the formatted VAT ID)
        return {
            vatId: cacheKey,
            country: parsed.countryCode,
            viesValid: false,
            viesError: viesResult.message,
        };
    }
    // VAT is invalid
    if (!viesResult.valid) {
        const result = {
            vatId: cacheKey,
            country: parsed.countryCode,
            viesValid: false,
            viesError: "VAT ID not valid according to VIES",
        };
        // Cache invalid results too (VAT status doesn't change often)
        await cacheRef.set({
            vatId: cacheKey,
            result,
            timestamp: firestore_1.FieldValue.serverTimestamp(),
        });
        return result;
    }
    // VIES returned valid + data
    const result = {
        vatId: cacheKey,
        country: parsed.countryCode,
        viesValid: true,
    };
    if (viesResult.name) {
        result.name = viesResult.name;
    }
    if (viesResult.address) {
        result.address = parseViesAddress(viesResult.address, parsed.countryCode);
    }
    // Cache the successful result
    await cacheRef.set({
        vatId: cacheKey,
        result,
        timestamp: firestore_1.FieldValue.serverTimestamp(),
    });
    console.log(`[VIES] Found and cached: name="${result.name || "none"}", country=${result.country}`);
    return result;
});
//# sourceMappingURL=lookupCompany.js.map