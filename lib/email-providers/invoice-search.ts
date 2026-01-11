/**
 * Invoice Search Utility
 *
 * Builds Gmail search queries for finding invoice-related emails.
 * Supports German and English keywords for comprehensive coverage.
 */

/**
 * Keywords that indicate an email likely contains an invoice.
 * These are used in Gmail search queries with OR operator.
 */
export const INVOICE_KEYWORDS = {
  german: [
    "Rechnung",
    "Beleg",
    "Quittung",
    "Faktura",
    "Zahlungsbeleg",
    "Kaufbeleg",
    "Zahlungsbestätigung",
    "Buchungsbestätigung",
  ],
  english: [
    "Invoice",
    "Receipt",
    "Bill",
    "Payment confirmation",
    "Order confirmation",
    "Payment receipt",
  ],
} as const;

/**
 * All invoice keywords combined
 */
export const ALL_INVOICE_KEYWORDS = [
  ...INVOICE_KEYWORDS.german,
  ...INVOICE_KEYWORDS.english,
];

/**
 * MIME types that are likely invoices
 */
export const INVOICE_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/**
 * Options for building an invoice search query
 */
export interface InvoiceSearchOptions {
  /** Start date for search (inclusive) */
  dateFrom?: Date;

  /** End date for search (inclusive) */
  dateTo?: Date;

  /** Additional search terms to include */
  additionalTerms?: string[];

  /** Specific sender to search for */
  from?: string;

  /** Whether to require PDF attachments only (default: true) */
  pdfOnly?: boolean;
}

/**
 * Format a date for Gmail search query (YYYY/MM/DD format)
 */
function formatGmailDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

/**
 * Build a Gmail search query for finding invoices.
 *
 * The query uses:
 * - Subject OR body search for invoice keywords
 * - has:attachment to filter emails with attachments
 * - filename:pdf to filter for PDF attachments (optional)
 * - after:/before: for date range
 *
 * @example
 * buildInvoiceSearchQuery({ dateFrom: new Date('2024-01-01'), dateTo: new Date('2024-12-31') })
 * // Returns: "(Rechnung OR Beleg OR Invoice ...) has:attachment filename:pdf after:2024/01/01 before:2024/12/31"
 */
export function buildInvoiceSearchQuery(options: InvoiceSearchOptions = {}): string {
  const { dateFrom, dateTo, additionalTerms = [], from, pdfOnly = true } = options;

  const parts: string[] = [];

  // Build keyword search (subject OR body)
  const allKeywords = [...ALL_INVOICE_KEYWORDS, ...additionalTerms];
  const keywordQuery = `(${allKeywords.map((k) => `"${k}"`).join(" OR ")})`;
  parts.push(keywordQuery);

  // Require attachments
  parts.push("has:attachment");

  // Optionally filter for PDFs only
  if (pdfOnly) {
    parts.push("filename:pdf");
  }

  // Date range
  if (dateFrom) {
    parts.push(`after:${formatGmailDate(dateFrom)}`);
  }
  if (dateTo) {
    // Gmail's before: is exclusive, so add a day
    const nextDay = new Date(dateTo);
    nextDay.setDate(nextDay.getDate() + 1);
    parts.push(`before:${formatGmailDate(nextDay)}`);
  }

  // Sender filter
  if (from) {
    parts.push(`from:${from}`);
  }

  return parts.join(" ");
}

/**
 * Get MIME types that are considered invoice attachments
 */
export function getInvoiceMimeTypes(): string[] {
  return [...INVOICE_MIME_TYPES];
}

/**
 * Check if a MIME type is likely an invoice attachment
 */
export function isInvoiceMimeType(mimeType: string): boolean {
  return INVOICE_MIME_TYPES.includes(mimeType as typeof INVOICE_MIME_TYPES[number]);
}

/**
 * Check if a filename suggests it's an invoice
 */
export function isLikelyInvoiceFilename(filename: string): boolean {
  const lower = filename.toLowerCase();

  // Check for invoice keywords in filename
  const keywordPatterns = ALL_INVOICE_KEYWORDS.map((k) => k.toLowerCase());
  if (keywordPatterns.some((pattern) => lower.includes(pattern))) {
    return true;
  }

  // Check for common invoice filename patterns
  const invoicePatterns = [
    /invoice/i,
    /rechnung/i,
    /beleg/i,
    /quittung/i,
    /receipt/i,
    /bill/i,
    /faktura/i,
    /\d{4,}/, // Long numbers often indicate invoice numbers
  ];

  return invoicePatterns.some((pattern) => pattern.test(lower));
}

/**
 * Extract the domain from an email address
 * @example extractEmailDomain("support@amazon.de") -> "amazon.de"
 */
export function extractEmailDomain(email: string): string {
  const atIndex = email.lastIndexOf("@");
  if (atIndex === -1) {
    return email.toLowerCase();
  }
  return email.substring(atIndex + 1).toLowerCase();
}

/**
 * Normalize an email domain for comparison
 * Removes common prefixes and normalizes TLDs
 */
export function normalizeEmailDomain(domain: string): string {
  let normalized = domain.toLowerCase().trim();

  // Remove common prefixes
  const prefixes = ["mail.", "email.", "noreply.", "no-reply.", "notifications."];
  for (const prefix of prefixes) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.substring(prefix.length);
      break;
    }
  }

  return normalized;
}
