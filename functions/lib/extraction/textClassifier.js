"use strict";
/**
 * Fast Text-Based Invoice Pre-Classifier
 *
 * This module provides a fast, cost-free classification of PDFs using
 * text extraction and regex patterns. It can be used as a pre-filter
 * before the more expensive Gemini classification.
 *
 * Benefits:
 * - Zero API cost (runs locally)
 * - Very fast (typically <100ms vs 500-2000ms for Gemini)
 * - Can short-circuit obvious invoices/non-invoices
 *
 * Limitation:
 * - Cannot classify image-only PDFs (no extractable text)
 * - May miss scanned documents without OCR
 *
 * PDF Parsing: Uses pdf-parse v2 (https://github.com/mehmet-kozan/pdf-parse)
 * - v2 API: `new PDFParse({ data: buffer })` then `parser.getText({ first: N })`
 * - This is the server-side PDF text extraction library used across the project
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyDocumentByText = classifyDocumentByText;
exports.shouldUseTextClassification = shouldUseTextClassification;
const pdf_parse_1 = require("pdf-parse");
// === Invoice Indicator Patterns ===
// Currency symbols and codes
const CURRENCY_PATTERNS = [
    /€|EUR|EURO/gi,
    /\$|USD/gi,
    /£|GBP/gi,
    /CHF/gi,
    /¥|JPY|CNY/gi,
];
// VAT/Tax indicators (multilingual)
const VAT_PATTERNS = [
    /\bVAT\b/gi,
    /\bMwSt\.?\b/gi,
    /\bMehrwertsteuer\b/gi,
    /\bUSt\.?\b/gi,
    /\bUmsatzsteuer\b/gi,
    /\bTVA\b/gi,
    /\bIVA\b/gi,
    /\b(?:19|20|7|5)%\s*(?:VAT|MwSt|Tax)/gi,
    /VAT[-\s]?(?:ID|Nr|Number)/gi,
    /Steuer(?:nummer|nr\.?)/gi,
];
// Amount patterns (numbers with decimals, typically > 0)
const AMOUNT_PATTERNS = [
    /(?:€|EUR|\$|USD|£|GBP|CHF)\s*[\d.,]+/gi,
    /[\d.,]+\s*(?:€|EUR|\$|USD|£|GBP|CHF)/gi,
    /(?:Total|Summe|Amount|Betrag|Gesamt)[:\s]+[\d.,]+/gi,
    /(?:Netto|Brutto|Net|Gross)[:\s]+[\d.,]+/gi,
];
// Invoice keywords (multilingual)
const INVOICE_KEYWORDS = [
    /\bInvoice\b/gi,
    /\bRechnung\b/gi,
    /\bReceipt\b/gi,
    /\bBeleg\b/gi,
    /\bQuittung\b/gi,
    /\bBon\b/gi,
    /\bTicket\b/gi,
    /\bBuchungsbestätigung\b/gi,
    /\bBooking\s*confirmation\b/gi,
    /\bOrder\s*confirmation\b/gi,
    /\bBestellbestätigung\b/gi,
    /\bZahlungsbestätigung\b/gi,
    /\bPayment\s*confirmation\b/gi,
    /\bFaktura\b/gi,
    /\bFacture\b/gi,
    /Invoice\s*(?:No\.?|Number|#)/gi,
    /Rechnungs(?:nummer|nr\.?)/gi,
    /\bKauf(?:beleg|quittung)\b/gi,
];
// IBAN patterns
const IBAN_PATTERNS = [
    /\bIBAN[:\s]*[A-Z]{2}\d{2}[A-Z0-9]{4,}/gi,
    /\b[A-Z]{2}\d{2}[A-Z0-9]{4,30}\b/g, // Simplified IBAN pattern
];
// Non-invoice indicators (things that suggest this is NOT an invoice)
const NON_INVOICE_PATTERNS = [
    /\bW-8BEN\b/gi,
    /\bW-9\b/gi,
    /\bSteuererklärung\b/gi,
    /\bTax\s*Return\b/gi,
    /\bAnnual\s*Report\b/gi,
    /\bJahresabschluss\b/gi,
    /\bGeschäftsbericht\b/gi,
    /\bVertrag\b/gi,
    /\bContract\b/gi,
    /\bAgreement\b/gi,
    /\bTerms\s*(?:and|&)\s*Conditions\b/gi,
    /\bAGB\b/gi,
    /\bPrivacy\s*Policy\b/gi,
    /\bDatenschutz/gi,
    /\bBank\s*Statement\b/gi,
    /\bKontoauszug\b/gi,
    /\bAccount\s*Statement\b/gi,
];
/**
 * Count matches for an array of patterns against text
 */
function countMatches(text, patterns) {
    let count = 0;
    for (const pattern of patterns) {
        const matches = text.match(pattern);
        if (matches)
            count += matches.length;
    }
    return count;
}
/**
 * Check if any patterns match
 */
function hasMatch(text, patterns) {
    return patterns.some((p) => p.test(text));
}
/**
 * Extract text from a PDF buffer using pdf-parse v2
 * Returns null if text extraction fails or yields no text
 */
async function extractTextFromPdf(buffer) {
    try {
        const parser = new pdf_parse_1.PDFParse({ data: buffer });
        const result = await parser.getText({ first: 3 }); // First 3 pages only for speed
        const text = result.text?.trim();
        return text && text.length > 50 ? text : null;
    }
    catch (error) {
        console.log("[TextClassifier] PDF text extraction failed:", error);
        return null;
    }
}
/**
 * Fast text-based pre-classification of a document.
 *
 * Returns a classification result that can be used to decide whether
 * to skip the more expensive Gemini classification.
 *
 * Recommended usage:
 * - If result.confidence === "high" and result.isLikelyInvoice === true:
 *   → Skip Gemini, treat as invoice
 * - If result.confidence === "high" and result.isLikelyInvoice === false:
 *   → Skip Gemini, treat as NOT invoice
 * - Otherwise:
 *   → Fall back to Gemini classification
 */
async function classifyDocumentByText(fileBuffer, fileType) {
    const startTime = Date.now();
    // Only process PDFs for now (images would need OCR)
    if (fileType !== "application/pdf") {
        return {
            isLikelyInvoice: true, // Uncertain, default to processing
            confidence: "uncertain",
            signals: ["Not a PDF, cannot extract text"],
            hasExtractableText: false,
            processingTimeMs: Date.now() - startTime,
        };
    }
    // Extract text from PDF
    const text = await extractTextFromPdf(fileBuffer);
    if (!text) {
        return {
            isLikelyInvoice: true, // Uncertain, default to processing
            confidence: "uncertain",
            signals: ["No extractable text (possibly scanned/image-only)"],
            hasExtractableText: false,
            processingTimeMs: Date.now() - startTime,
        };
    }
    const signals = [];
    // Check for non-invoice indicators first
    const nonInvoiceCount = countMatches(text, NON_INVOICE_PATTERNS);
    if (nonInvoiceCount > 0) {
        signals.push(`Non-invoice keywords: ${nonInvoiceCount}`);
    }
    // Check for invoice indicators
    const hasCurrency = hasMatch(text, CURRENCY_PATTERNS);
    const hasVat = hasMatch(text, VAT_PATTERNS);
    const hasAmounts = hasMatch(text, AMOUNT_PATTERNS);
    const hasInvoiceKeywords = hasMatch(text, INVOICE_KEYWORDS);
    const hasIban = hasMatch(text, IBAN_PATTERNS);
    // Count specific matches for scoring
    const currencyCount = countMatches(text, CURRENCY_PATTERNS);
    const vatCount = countMatches(text, VAT_PATTERNS);
    const amountCount = countMatches(text, AMOUNT_PATTERNS);
    const keywordCount = countMatches(text, INVOICE_KEYWORDS);
    if (hasCurrency)
        signals.push(`Currency: ${currencyCount}`);
    if (hasVat)
        signals.push(`VAT: ${vatCount}`);
    if (hasAmounts)
        signals.push(`Amounts: ${amountCount}`);
    if (hasInvoiceKeywords)
        signals.push(`Keywords: ${keywordCount}`);
    if (hasIban)
        signals.push("Has IBAN");
    // Scoring logic
    let invoiceScore = 0;
    // Strong positive signals
    if (hasInvoiceKeywords)
        invoiceScore += 3;
    if (hasVat)
        invoiceScore += 2;
    if (hasCurrency && hasAmounts)
        invoiceScore += 2;
    if (hasIban)
        invoiceScore += 1;
    // Strong negative signals
    if (nonInvoiceCount >= 2)
        invoiceScore -= 4;
    else if (nonInvoiceCount >= 1)
        invoiceScore -= 2;
    // Determine classification
    let isLikelyInvoice;
    let confidence;
    if (invoiceScore >= 4) {
        isLikelyInvoice = true;
        confidence = "high";
    }
    else if (invoiceScore >= 2) {
        isLikelyInvoice = true;
        confidence = "medium";
    }
    else if (invoiceScore <= -2) {
        isLikelyInvoice = false;
        confidence = "high";
    }
    else if (invoiceScore < 0) {
        isLikelyInvoice = false;
        confidence = "medium";
    }
    else {
        // Score around 0-1: uncertain
        isLikelyInvoice = true; // Default to true when uncertain
        confidence = "uncertain";
    }
    return {
        isLikelyInvoice,
        confidence,
        signals,
        hasExtractableText: true,
        processingTimeMs: Date.now() - startTime,
    };
}
/**
 * Hybrid classification: Try text-based first, fall back to Gemini.
 *
 * This function decides whether to use the fast text classifier result
 * or fall back to the more expensive Gemini classifier.
 *
 * @returns true if text classification is confident enough to use
 */
function shouldUseTextClassification(result) {
    // Use text classification if high confidence
    return result.confidence === "high" && result.hasExtractableText;
}
//# sourceMappingURL=textClassifier.js.map