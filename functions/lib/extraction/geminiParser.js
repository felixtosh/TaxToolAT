"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_GEMINI_MODEL = void 0;
exports.parseWithGemini = parseWithGemini;
const vertexai_1 = require("@google-cloud/vertexai");
// Using Flash-Lite for maximum speed - good enough for invoice extraction
exports.DEFAULT_GEMINI_MODEL = "gemini-2.0-flash-lite-001";
// Get project ID from environment (Firebase sets this automatically)
function getProjectId() {
    const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
    if (!projectId) {
        throw new Error("Could not determine Google Cloud project ID");
    }
    return projectId;
}
// Vertex AI location - match Firebase region to minimize latency
const VERTEX_LOCATION = process.env.VERTEX_LOCATION || "europe-west1";
/**
 * Parse a document using Gemini's native vision capabilities via Vertex AI.
 * Uses service account authentication (no API key needed).
 * Gemini can process PDFs directly without a separate OCR step.
 */
async function parseWithGemini(fileBuffer, fileType, model = exports.DEFAULT_GEMINI_MODEL) {
    const projectId = getProjectId();
    const vertexAI = new vertexai_1.VertexAI({ project: projectId, location: VERTEX_LOCATION });
    const geminiModel = vertexAI.getGenerativeModel({ model });
    // Determine MIME type
    let mimeType;
    if (fileType === "application/pdf") {
        mimeType = "application/pdf";
    }
    else if (fileType.startsWith("image/")) {
        mimeType = fileType;
    }
    else {
        // Fallback for common image types
        mimeType = "image/jpeg";
    }
    // Create the file part for Gemini
    const filePart = {
        inlineData: {
            data: fileBuffer.toString("base64"),
            mimeType,
        },
    };
    // Compact prompt - balance speed vs accuracy
    const prompt = `Extract invoice data. Return JSON only.

Input format: German (dates DD.MM.YYYY, amounts with comma like 123,45)
Output: date as YYYY-MM-DD, amount in cents (123,45 → 12345)

{"rawText":"<all text from document>","extracted":{"date":"2024-01-15","amount":12345,"currency":"EUR","vatPercent":20,"partner":"Company Name","vatId":"ATU12345678","iban":"AT1234567890123456","address":"Street 1, City","confidence":0.9,"fieldSpans":{"date":"15.01.2024","amount":"123,45","partner":"Company Name"}}}

Null for missing fields. JSON only, no markdown.`;
    const apiStart = Date.now();
    const result = await geminiModel.generateContent({
        contents: [{ role: "user", parts: [filePart, { text: prompt }] }],
    });
    console.log(`  [Gemini] API call took ${Date.now() - apiStart}ms (region: ${VERTEX_LOCATION})`);
    const response = result.response;
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    // Parse JSON from response, handling potential markdown code blocks
    let jsonStr = text.trim();
    if (jsonStr.startsWith("```json")) {
        jsonStr = jsonStr.slice(7);
    }
    else if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith("```")) {
        jsonStr = jsonStr.slice(0, -3);
    }
    jsonStr = jsonStr.trim();
    const parsed = JSON.parse(jsonStr);
    const extracted = {
        date: parsed.extracted?.date || null,
        amount: typeof parsed.extracted?.amount === "number" ? parsed.extracted.amount : null,
        currency: parsed.extracted?.currency || null,
        vatPercent: typeof parsed.extracted?.vatPercent === "number" ? parsed.extracted.vatPercent : null,
        partner: parsed.extracted?.partner || null,
        vatId: parsed.extracted?.vatId || null,
        iban: parsed.extracted?.iban || null,
        address: parsed.extracted?.address || null,
        confidence: typeof parsed.extracted?.confidence === "number" ? parsed.extracted.confidence : 0.5,
        fieldSpans: parsed.extracted?.fieldSpans || {},
    };
    return {
        extracted,
        rawText: parsed.rawText || "",
    };
}
//# sourceMappingURL=geminiParser.js.map