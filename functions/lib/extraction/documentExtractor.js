"use strict";
/**
 * Document Extraction Abstraction Layer
 *
 * Provides a unified interface for document (PDF/image) extraction
 * that can switch between different providers:
 *
 * - "vision-claude": Google Vision API for OCR + Claude Haiku for parsing (original)
 * - "gemini": Gemini Flash for native PDF vision + extraction (new)
 *
 * Set EXTRACTION_PROVIDER environment variable to switch providers.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultProvider = getDefaultProvider;
exports.extractDocument = extractDocument;
exports.generateTextBlocks = generateTextBlocks;
/**
 * Get the default extraction provider from environment
 */
function getDefaultProvider() {
    const provider = process.env.EXTRACTION_PROVIDER;
    if (provider === "gemini" || provider === "vision-claude") {
        return provider;
    }
    // Default to gemini (faster, uses service account auth)
    return "gemini";
}
/**
 * Extract text and structured data from a document
 * Uses the configured provider (vision-claude or gemini)
 */
async function extractDocument(fileBuffer, fileType, config) {
    const provider = config.provider;
    if (provider === "gemini") {
        return extractWithGemini(fileBuffer, fileType, config);
    }
    else {
        return extractWithVisionClaude(fileBuffer, fileType, config);
    }
}
/**
 * Extract using Google Vision API + Claude Haiku (original approach)
 */
async function extractWithVisionClaude(fileBuffer, fileType, config) {
    // Lazy import to avoid loading both providers unnecessarily
    const { callVisionAPI } = await Promise.resolve().then(() => __importStar(require("./visionApi")));
    const { parseWithClaude } = await Promise.resolve().then(() => __importStar(require("./claudeParser")));
    if (!config.anthropicApiKey) {
        throw new Error("Anthropic API key required for vision-claude provider");
    }
    // Step 1: OCR with Vision API
    const ocrResult = await callVisionAPI(fileBuffer, fileType);
    if (!ocrResult.text || ocrResult.text.trim().length === 0) {
        throw new Error("No text extracted from document");
    }
    // Step 2: Parse with Claude Haiku
    const extracted = await parseWithClaude(ocrResult.text, config.anthropicApiKey);
    return {
        text: ocrResult.text,
        blocks: ocrResult.blocks,
        extracted,
        provider: "vision-claude",
    };
}
/**
 * Extract using Gemini Flash (native PDF vision)
 * Classification is separate from extraction:
 * 1. classifyDocument determines if it's an invoice (unless skipClassification)
 * 2. parseWithGemini extracts data (assumes document is valid)
 */
async function extractWithGemini(fileBuffer, fileType, config) {
    const { parseWithGemini, classifyDocument, DEFAULT_GEMINI_MODEL, } = await Promise.resolve().then(() => __importStar(require("./geminiParser")));
    // Gemini uses service account auth via Vertex AI (no API key needed)
    const model = (config.geminiModel || DEFAULT_GEMINI_MODEL);
    // Classification phase - skip if user has already confirmed it's an invoice
    if (!config.skipClassification) {
        console.log(`  [Classification] Checking if document is a valid invoice...`);
        const classification = await classifyDocument(fileBuffer, fileType, model);
        if (!classification.isInvoice) {
            console.log(`  [Classification] Not an invoice: ${classification.reason}`);
            // Return early without full extraction
            return {
                text: "(classification only - not an invoice)",
                blocks: [],
                extracted: {
                    date: null,
                    amount: null,
                    currency: null,
                    vatPercent: null,
                    partner: null,
                    vatId: null,
                    iban: null,
                    address: null,
                    website: null,
                    issuer: null,
                    recipient: null,
                    confidence: classification.confidence,
                    fieldSpans: {},
                },
                provider: "gemini",
                isNotInvoice: true,
                notInvoiceReason: classification.reason,
            };
        }
        console.log(`  [Classification] Valid invoice, proceeding with extraction`);
    }
    else {
        console.log(`  [Skip-Classification] User override - treating as invoice`);
    }
    // Extraction phase - parseWithGemini only extracts, no classification
    const result = await parseWithGemini(fileBuffer, fileType, model);
    // Use rawText if available, otherwise generate from extracted data
    // Gemini Flash Lite sometimes omits rawText to save tokens
    let text = result.rawText || "";
    if (!text.trim()) {
        // Generate fallback text from extracted fields for display
        const parts = [];
        const e = result.extracted;
        if (e.partner)
            parts.push(e.partner);
        if (e.date)
            parts.push(e.date);
        if (e.amount !== null) {
            const amt = (e.amount / 100).toFixed(2).replace(".", ",");
            parts.push(`${amt} ${e.currency || "EUR"}`);
        }
        if (e.address)
            parts.push(e.address);
        if (e.vatId)
            parts.push(e.vatId);
        if (e.iban)
            parts.push(e.iban);
        text = parts.join("\n") || "(no text extracted)";
    }
    // Only fail if we got no useful data at all
    const hasUsefulData = result.extracted.partner ||
        result.extracted.amount !== null ||
        result.extracted.date ||
        text.trim().length > 0;
    if (!hasUsefulData) {
        throw new Error("No text or data extracted from document");
    }
    return {
        text,
        blocks: [], // Gemini native vision uses geminiBoundingBoxes instead
        extracted: result.extracted,
        provider: "gemini",
        isNotInvoice: false, // Classification already passed, or user override
        notInvoiceReason: null,
        geminiBoundingBoxes: result.boundingBoxes,
        extractedRaw: result.extractedRaw,
        additionalFields: result.additionalFields,
        usage: result.usage,
    };
}
/**
 * Generate fake OCR blocks from extracted text for Gemini
 * This provides basic text search capability when bounding boxes aren't available
 */
function generateTextBlocks(text) {
    // Split text into paragraphs/lines and create simple blocks
    const lines = text.split(/\n+/).filter((line) => line.trim());
    return lines.map((line) => ({
        text: line.trim(),
        boundingBox: { vertices: [] }, // No position info from Gemini
        confidence: 1.0,
    }));
}
//# sourceMappingURL=documentExtractor.js.map