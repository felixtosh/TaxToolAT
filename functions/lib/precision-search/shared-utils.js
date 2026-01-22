"use strict";
/**
 * Shared Utilities for Precision Search
 *
 * Extracted from precisionSearchQueue.ts for reuse in:
 * - Cloud Functions (precision search queue)
 * - Chat API tools (agentic search)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.INVOICE_LINK_KEYWORDS = exports.MAIL_INVOICE_KEYWORDS = void 0;
exports.classifyEmail = classifyEmail;
exports.isLikelyReceiptMimeType = isLikelyReceiptMimeType;
// ============================================================================
// Email Classification Keywords (German + English)
// ============================================================================
/**
 * Keywords indicating the email body IS an invoice/receipt (German + English)
 */
exports.MAIL_INVOICE_KEYWORDS = [
    // English
    "order confirmation",
    "payment received",
    "payment confirmation",
    "your purchase",
    "order summary",
    "receipt for your",
    "thank you for your order",
    "your order has been",
    "purchase confirmation",
    // German
    "bestellbestätigung",
    "zahlungsbestätigung",
    "zahlungseingang",
    "ihre bestellung",
    "kaufbestätigung",
    "vielen dank für ihre bestellung",
    "ihre zahlung",
    "buchungsbestätigung",
];
/**
 * Keywords indicating the email contains a link to download invoice (German + English)
 */
exports.INVOICE_LINK_KEYWORDS = [
    // English
    "download your invoice",
    "view your invoice",
    "download invoice",
    "view invoice",
    "click here to download",
    "access your invoice",
    "get your receipt",
    "download pdf",
    "download receipt",
    // German
    "rechnung herunterladen",
    "rechnung anzeigen",
    "rechnung abrufen",
    "hier klicken",
    "pdf herunterladen",
    "beleg herunterladen",
    "rechnung ansehen",
    "zum download",
];
// ============================================================================
// Classification Function
// ============================================================================
/**
 * Classify an email based on subject, snippet, and attachments.
 * Used to prioritize which emails to process and how.
 *
 * Classification types:
 * - hasPdfAttachment: Email has a PDF attachment (most common invoice format)
 * - possibleMailInvoice: Email body IS the invoice (no attachment needed)
 * - possibleInvoiceLink: Email contains a link to download the invoice
 *
 * @param subject - Email subject line
 * @param snippet - Email snippet/preview text
 * @param attachments - Array of attachments
 * @returns Classification result with confidence score
 */
function classifyEmail(subject, snippet, attachments) {
    const combined = `${subject} ${snippet}`.toLowerCase();
    const matchedKeywords = [];
    // Check for PDF attachments
    const hasPdfAttachment = attachments.some((a) => a.mimeType === "application/pdf" ||
        (a.mimeType === "application/octet-stream" &&
            a.filename.toLowerCase().endsWith(".pdf")));
    // Check for mail invoice keywords (email body IS the invoice)
    let possibleMailInvoice = false;
    for (const keyword of exports.MAIL_INVOICE_KEYWORDS) {
        if (combined.includes(keyword)) {
            possibleMailInvoice = true;
            matchedKeywords.push(keyword);
            break;
        }
    }
    // Check for invoice link keywords
    let possibleInvoiceLink = false;
    for (const keyword of exports.INVOICE_LINK_KEYWORDS) {
        if (combined.includes(keyword)) {
            possibleInvoiceLink = true;
            matchedKeywords.push(keyword);
            break;
        }
    }
    // Calculate confidence
    let confidence = 0;
    if (hasPdfAttachment)
        confidence += 40;
    if (possibleMailInvoice)
        confidence += 30;
    if (possibleInvoiceLink)
        confidence += 25;
    confidence = Math.min(confidence, 100);
    // If has PDF and no other signals, still likely relevant
    if (hasPdfAttachment && confidence < 50) {
        confidence = 50;
    }
    return {
        hasPdfAttachment,
        possibleMailInvoice: possibleMailInvoice && !hasPdfAttachment, // Only if no PDF
        possibleInvoiceLink,
        confidence,
        matchedKeywords,
    };
}
/**
 * Check if a MIME type is likely a receipt (PDF or image)
 */
function isLikelyReceiptMimeType(mimeType) {
    const receiptTypes = [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
    ];
    return receiptTypes.includes(mimeType.toLowerCase());
}
//# sourceMappingURL=shared-utils.js.map