/**
 * Shared Utilities for Precision Search
 *
 * Extracted from precisionSearchQueue.ts for reuse in:
 * - Cloud Functions (precision search queue)
 * - Chat API tools (agentic search)
 */

// ============================================================================
// Types
// ============================================================================

export interface GmailAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
  isLikelyReceipt: boolean;
}

export interface EmailClassification {
  hasPdfAttachment: boolean;
  possibleMailInvoice: boolean;
  possibleInvoiceLink: boolean;
  confidence: number;
  matchedKeywords: string[];
}

// ============================================================================
// Email Classification Keywords (German + English)
// ============================================================================

/**
 * Keywords indicating the email body IS an invoice/receipt (German + English)
 * Ordered by specificity - more specific patterns first
 */
export const MAIL_INVOICE_KEYWORDS = [
  // English - Subject line patterns
  "order confirmation",
  "payment received",
  "payment confirmation",
  "purchase confirmation",
  "your receipt",
  "your invoice",
  "receipt for",        // Catches "Receipt for AutoTrading", "Receipt for your order"
  "invoice for",
  "thank you for your order",
  "thank you for your purchase",
  "your order has been",
  "order summary",
  "your purchase",

  // English - Body content patterns (structural indicators)
  "order number:",
  "order number",
  "order #",
  "order id:",
  "invoice number:",
  "invoice number",
  "invoice #",
  "transaction id:",
  "transaction id",
  "billing info",
  "billing address",
  "payment method:",
  "payment method",
  "subtotal",
  "sub-total",
  "total amount",
  "amount paid",
  "amount charged",
  // VAT indicators (strong invoice signal)
  "vat number",
  "vat id",
  "vat:",
  "vat de",      // VAT DE123456789
  "vat at",      // VAT AT...
  "vat gb",      // VAT GB...
  "vat fr",      // VAT FR...
  "vat nl",      // VAT NL...
  "vat be",      // VAT BE...
  "vat it",      // VAT IT...
  "vat es",      // VAT ES...
  "tax id",
  "tax number",

  // German - Subject line patterns
  "bestellbestätigung",
  "zahlungsbestätigung",
  "zahlungseingang",
  "ihre bestellung",
  "kaufbestätigung",
  "vielen dank für ihre bestellung",
  "vielen dank für ihren einkauf",
  "ihre zahlung",
  "buchungsbestätigung",
  "ihre rechnung",
  "rechnung für",
  "quittung für",

  // German - Body content patterns
  "bestellnummer:",
  "bestellnummer",
  "bestell-nr",
  "rechnungsnummer:",
  "rechnungsnummer",
  "rechnungs-nr",
  "transaktions-id",
  "zahlungsmethode:",
  "zahlungsmethode",
  "rechnungsadresse",
  "zwischensumme",
  "gesamtbetrag",
  "endbetrag",
  "bezahlter betrag",
  // German VAT indicators
  "ust-idnr",
  "ust-id",
  "ust id",
  "umsatzsteuer-id",
  "umsatzsteuer id",
  "mwst",
  "mehrwertsteuer",
  "steuernummer",
  "steuer-nr",
];

/**
 * Keywords indicating the email contains a link to download invoice (German + English)
 */
export const INVOICE_LINK_KEYWORDS = [
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
  "view your receipt",
  "download your receipt",
  "see invoice",
  "view receipt",
  "print invoice",
  "print receipt",
  "invoice attached",
  "attached invoice",
  "find attached",
  "see attached",
  // German
  "rechnung herunterladen",
  "rechnung anzeigen",
  "rechnung abrufen",
  "hier klicken",
  "pdf herunterladen",
  "beleg herunterladen",
  "rechnung ansehen",
  "zum download",
  "quittung herunterladen",
  "quittung anzeigen",
  "rechnung im anhang",
  "im anhang finden",
  "anbei ihre rechnung",
  "anbei finden sie",
];

// ============================================================================
// Classification Function
// ============================================================================

/**
 * Classify an email based on subject, snippet, body text, and attachments.
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
 * @param bodyText - Optional full email body text (for better classification)
 * @returns Classification result with confidence score
 */
export function classifyEmail(
  subject: string,
  snippet: string,
  attachments: GmailAttachment[],
  bodyText?: string | null
): EmailClassification {
  // Include bodyText for more comprehensive keyword matching
  const combined = `${subject} ${snippet} ${bodyText || ""}`.toLowerCase();
  const matchedKeywords: string[] = [];

  // Check for PDF attachments
  const hasPdfAttachment = attachments.some(
    (a) =>
      a.mimeType === "application/pdf" ||
      (a.mimeType === "application/octet-stream" &&
        a.filename.toLowerCase().endsWith(".pdf"))
  );

  // Check for mail invoice keywords (email body IS the invoice)
  let possibleMailInvoice = false;
  for (const keyword of MAIL_INVOICE_KEYWORDS) {
    if (combined.includes(keyword)) {
      possibleMailInvoice = true;
      matchedKeywords.push(keyword);
      break;
    }
  }

  // Check for invoice link keywords
  let possibleInvoiceLink = false;
  for (const keyword of INVOICE_LINK_KEYWORDS) {
    if (combined.includes(keyword)) {
      possibleInvoiceLink = true;
      matchedKeywords.push(keyword);
      break;
    }
  }

  // Calculate confidence
  let confidence = 0;
  if (hasPdfAttachment) confidence += 40;
  if (possibleMailInvoice) confidence += 30;
  if (possibleInvoiceLink) confidence += 25;
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
export function isLikelyReceiptMimeType(mimeType: string): boolean {
  const receiptTypes = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
  ];
  return receiptTypes.includes(mimeType.toLowerCase());
}
