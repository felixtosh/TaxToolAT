"use strict";
/**
 * Gemini Search Helper
 *
 * Uses Gemini Flash Lite to generate Gmail search queries and analyze emails
 * for invoice content (links or HTML invoices).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSearchQueries = generateSearchQueries;
exports.analyzeEmailForInvoice = analyzeEmailForInvoice;
exports.batchMatchTransactionsToFiles = batchMatchTransactionsToFiles;
const vertexai_1 = require("@google-cloud/vertexai");
// Using Flash-Lite for maximum speed and lowest cost
const GEMINI_MODEL = "gemini-2.0-flash-lite-001";
// Get project ID from environment
function getProjectId() {
    const projectId = process.env.GCLOUD_PROJECT ||
        process.env.GCP_PROJECT ||
        process.env.GOOGLE_CLOUD_PROJECT;
    if (!projectId) {
        throw new Error("Could not determine Google Cloud project ID");
    }
    return projectId;
}
const VERTEX_LOCATION = process.env.VERTEX_LOCATION || "europe-west1";
/**
 * Fix common JSON issues from LLM output (trailing commas, etc.)
 */
function fixLlmJson(text) {
    return text
        // Remove trailing commas before ] or }
        .replace(/,(\s*[}\]])/g, "$1")
        // Remove markdown code blocks if present
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "");
}
/**
 * Generate Gmail search queries based on transaction data.
 * Returns 2-4 query variants to try.
 */
async function generateSearchQueries(transaction, partnerInfo) {
    const projectId = getProjectId();
    const vertexAI = new vertexai_1.VertexAI({ project: projectId, location: VERTEX_LOCATION });
    const model = vertexAI.getGenerativeModel({ model: GEMINI_MODEL });
    const txDate = transaction.date.toISOString().split("T")[0];
    const amount = Math.abs(transaction.amount / 100).toFixed(2);
    const prompt = `Generate Gmail search queries to find an invoice/receipt email for this transaction.

Transaction:
- Name: ${transaction.name}
- Partner: ${transaction.partner || "Unknown"}
- Amount: €${amount}
- Date: ${txDate}

${partnerInfo ? `Partner Info:
- Company: ${partnerInfo.name}
- Email domains: ${partnerInfo.emailDomains?.join(", ") || "unknown"}
- Website: ${partnerInfo.website || "unknown"}` : ""}

Generate 2-4 Gmail search queries to find this invoice. Consider:
1. If email domain known, use "from:domain.com" in at least one query, but include at least one query without any from: constraint.
2. Include keywords: Rechnung, Invoice, Receipt, Beleg, Quittung
3. Include date range: after:YYYY/MM/DD before:YYYY/MM/DD (±7 days) in most queries, but include one broader query (±90 days) or no date filter.
4. Try amount if exact: "${amount}"
5. If an invoice number is present in the transaction name, include a query using "filename:INVOICE_NUMBER"

Return JSON only:
{
  "queries": ["query1", "query2", ...],
  "reasoning": "brief explanation"
}`;
    const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
    });
    const response = result.response;
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const usage = {
        inputTokens: response.usageMetadata?.promptTokenCount || 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
        model: GEMINI_MODEL,
    };
    try {
        // Extract JSON from response and fix common LLM issues
        const cleanedText = fixLlmJson(text);
        const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return { queries: [], reasoning: "Failed to parse response", usage };
        }
        const parsed = JSON.parse(jsonMatch[0]);
        return {
            queries: parsed.queries || [],
            reasoning: parsed.reasoning || "",
            usage,
        };
    }
    catch {
        console.error("[GeminiSearch] Failed to parse search query response:", text);
        return { queries: [], reasoning: "Parse error", usage };
    }
}
/**
 * Analyze an email body to detect invoice links or determine if the email itself is an invoice.
 */
async function analyzeEmailForInvoice(emailContent, transaction) {
    const projectId = getProjectId();
    const vertexAI = new vertexai_1.VertexAI({ project: projectId, location: VERTEX_LOCATION });
    const model = vertexAI.getGenerativeModel({ model: GEMINI_MODEL });
    const amount = Math.abs(transaction.amount / 100).toFixed(2);
    // Use text body if available, otherwise strip HTML
    let bodyContent = emailContent.textBody || "";
    if (!bodyContent && emailContent.htmlBody) {
        // Simple HTML stripping - extract text and links
        bodyContent = emailContent.htmlBody
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .substring(0, 5000); // Limit content length
    }
    const prompt = `Analyze this email for invoice-related content.

Email:
From: ${emailContent.from}
Subject: ${emailContent.subject}
Body (excerpt): ${bodyContent.substring(0, 3000)}

Transaction we're matching:
- Description: ${transaction.name}
- Partner: ${transaction.partner || "Unknown"}
- Amount: €${amount}

Determine:
1. Does this email contain LINKS to download/view an invoice? Extract all invoice-related URLs.
2. Is the EMAIL ITSELF an invoice (e.g., receipt email, confirmation with itemized charges)?

Return JSON only:
{
  "hasInvoiceLink": true/false,
  "invoiceLinks": [{"url": "...", "anchorText": "..."}],
  "isMailInvoice": true/false,
  "mailInvoiceConfidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`;
    const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
    });
    const response = result.response;
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const usage = {
        inputTokens: response.usageMetadata?.promptTokenCount || 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
        model: GEMINI_MODEL,
    };
    try {
        const cleanedText = fixLlmJson(text);
        const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return {
                hasInvoiceLink: false,
                invoiceLinks: [],
                isMailInvoice: false,
                mailInvoiceConfidence: 0,
                reasoning: "Failed to parse response",
                usage,
            };
        }
        const parsed = JSON.parse(jsonMatch[0]);
        return {
            hasInvoiceLink: parsed.hasInvoiceLink || false,
            invoiceLinks: parsed.invoiceLinks || [],
            isMailInvoice: parsed.isMailInvoice || false,
            mailInvoiceConfidence: parsed.mailInvoiceConfidence || 0,
            reasoning: parsed.reasoning || "",
            usage,
        };
    }
    catch {
        console.error("[GeminiSearch] Failed to parse email analysis response:", text);
        return {
            hasInvoiceLink: false,
            invoiceLinks: [],
            isMailInvoice: false,
            mailInvoiceConfidence: 0,
            reasoning: "Parse error",
            usage,
        };
    }
}
/**
 * Batch match multiple transactions to multiple files.
 * Used for many-to-many matching (e.g., 12 months of Netflix transactions + 11 receipts).
 */
async function batchMatchTransactionsToFiles(transactions, files) {
    const projectId = getProjectId();
    const vertexAI = new vertexai_1.VertexAI({ project: projectId, location: VERTEX_LOCATION });
    const model = vertexAI.getGenerativeModel({ model: GEMINI_MODEL });
    // Format transactions for prompt
    const txList = transactions
        .map((tx) => {
        const amount = Math.abs(tx.amount / 100).toFixed(2);
        return `  - ID: ${tx.id}, Amount: €${amount}, Date: ${tx.date}, Partner: ${tx.partner || "N/A"}`;
    })
        .join("\n");
    // Format files for prompt
    const fileList = files
        .map((f) => {
        const amount = f.extractedAmount
            ? `€${Math.abs(f.extractedAmount / 100).toFixed(2)}`
            : "unknown";
        return `  - ID: ${f.id}, Amount: ${amount}, Date: ${f.extractedDate || "N/A"}, Partner: ${f.extractedPartner || "N/A"}, File: ${f.fileName}`;
    })
        .join("\n");
    const prompt = `Match these transactions to these invoice files. Each transaction should match at most one file, and each file should match at most one transaction.

TRANSACTIONS:
${txList}

FILES:
${fileList}

Rules:
1. Match by amount (must be within 5%)
2. Match by date (file date should be within 30 days of transaction)
3. Partner name similarity helps but is not required
4. If multiple files could match, pick the one with closest date
5. Some transactions may not have a matching file - that's okay

Return JSON only:
{
  "matches": [
    {"transactionId": "...", "fileId": "...", "confidence": 0-100, "reasoning": "..."}
  ],
  "unmatched": [
    {"transactionId": "...", "reason": "..."}
  ]
}`;
    const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
    });
    const response = result.response;
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const usage = {
        inputTokens: response.usageMetadata?.promptTokenCount || 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
        model: GEMINI_MODEL,
    };
    try {
        const cleanedText = fixLlmJson(text);
        const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return { matches: [], unmatched: [], usage };
        }
        const parsed = JSON.parse(jsonMatch[0]);
        return {
            matches: parsed.matches || [],
            unmatched: parsed.unmatched || [],
            usage,
        };
    }
    catch {
        console.error("[GeminiSearch] Failed to parse batch match response:", text);
        return { matches: [], unmatched: [], usage };
    }
}
//# sourceMappingURL=geminiSearchHelper.js.map