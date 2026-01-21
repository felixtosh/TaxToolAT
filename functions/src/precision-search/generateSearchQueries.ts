/**
 * Shared Gmail search query generation logic
 * This is a copy of lib/matching/generate-search-queries.ts for cloud functions
 * Keep in sync with the UI version!
 */

export interface QueryGenerationTransaction {
  name: string;
  partner?: string | null;
  description?: string;
  reference?: string;
}

export interface QueryGenerationPartner {
  name?: string;
  emailDomains?: string[];
  website?: string;
  ibans?: string[];
  vatId?: string;
  aliases?: string[];
  fileSourcePatterns?: Array<{
    pattern: string;
    sourceType: string;
    confidence: number;
    usageCount: number;
  }>;
}

/** Types of search suggestions - used for UI pill labels */
export type SuggestionType =
  | "invoice_number"  // Invoice/reference numbers (highest priority)
  | "company_name"    // Partner/company names
  | "email_domain"    // Email domains (from:domain)
  | "vat_id"          // VAT IDs
  | "iban"            // Bank account numbers
  | "pattern"         // File source patterns
  | "fallback";       // Generic search terms

export interface TypedSuggestion {
  query: string;
  type: SuggestionType;
  score: number;
}

/**
 * Clean bank transaction text to extract company name
 */
function cleanText(text: string): string {
  return text
    .replace(/^(pp\*|sq\*|paypal\s*\*|ec\s+|sepa\s+|lastschrift\s+)/i, "")
    .replace(/\.(com|de|at|ch|eu|net|org|io)(\/.*)?$/i, "")
    .replace(/\s+(gmbh|ag|inc|llc|ltd|sagt danke|marketplace|lastschrift|gutschrift|ab|bv|nv|ug).*$/i, "")
    .replace(/\s+\d{4,}.*$/, "")
    .replace(/\d{6,}\*+\d+/g, "")
    .replace(/[*]{3,}/g, "")
    // Split "Austrian2572165066551" into "Austrian" (strip trailing 6+ digits from words)
    .replace(/([a-zA-Z]{3,})\d{6,}/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract first meaningful word from text
 */
function extractFirstWord(text: string): string {
  const cleaned = cleanText(text);
  const words = cleaned.split(/\s+/).filter((w) => w.length >= 2);
  return words[0] || "";
}

/**
 * Extract ALL invoice/reference numbers from text
 */
function extractInvoiceNumbers(text: string): string[] {
  if (!text) return [];

  const results: string[] = [];
  const seen = new Set<string>();

  const addResult = (s: string) => {
    const cleaned = s.replace(/^[-_#\s]+|[-_#\s]+$/g, "").trim();
    const lower = cleaned.toLowerCase();
    if (cleaned.length >= 4 && !seen.has(lower)) {
      seen.add(lower);
      results.push(cleaned);
    }
  };

  // Pattern 1: R- 2024.014, R-2024.001, RE-2024-001
  const letterYearPattern = /\b([A-Z]{1,3})[-\s]*(\d{4})[.\-/](\d{1,})\b/gi;
  let match;
  while ((match = letterYearPattern.exec(text)) !== null) {
    addResult(`${match[1]}- ${match[2]}.${match[3]}`);
    addResult(`${match[1]}${match[2]}${match[3]}`);
  }

  // Pattern 2: INV-123, RE-2024-001, Invoice #12345
  const prefixedPattern = /\b(inv|re|rg|rech|invoice|rechnung|bill|order|bestellung)[-_]?\s*#?\s*(\d{3,}[-_.\d]*)/gi;
  while ((match = prefixedPattern.exec(text)) !== null) {
    addResult(match[0].replace(/\s+/g, ""));
  }

  // Pattern 3: 2024-12345, 2024/001234
  const yearPrefixPattern = /\b(20\d{2})[-/_](\d{4,})\b/g;
  while ((match = yearPrefixPattern.exec(text)) !== null) {
    addResult(`${match[1]}-${match[2]}`);
  }

  // Pattern 4: ROC/2024122400589
  const alphaNumPattern = /\b([A-Z]{2,})\/?(\d{10,})\b/gi;
  while ((match = alphaNumPattern.exec(text)) !== null) {
    addResult(match[2]);
  }

  // Pattern 5: Standalone long numbers (7+ digits, not UUIDs)
  const longNumberPattern = /\b(\d{7,})\b/g;
  while ((match = longNumberPattern.exec(text)) !== null) {
    const surrounding = text.slice(Math.max(0, match.index - 5), match.index + match[0].length + 5);
    if (!/[a-f]/i.test(surrounding)) {
      addResult(match[1]);
    }
  }

  return results;
}

/**
 * Generate search queries for Gmail based on transaction and partner data.
 * Returns up to maxQueries typed suggestions, sorted by relevance score.
 * Prioritizes: invoice numbers > company names > email domains > fallbacks
 */
export function generateTypedSearchQueries(
  transaction: QueryGenerationTransaction,
  partner?: QueryGenerationPartner | null,
  maxQueries: number = 8
): TypedSuggestion[] {
  const suggestions = new Map<
    string,
    { query: string; type: SuggestionType; score: number; order: number }
  >();
  let order = 0;

  const normalizeQuery = (s: string) =>
    s.trim().replace(/\s+/g, " ").toLowerCase();

  const addSuggestion = (s: string, type: SuggestionType, score: number) => {
    const cleaned = normalizeQuery(s);
    if (!cleaned || cleaned.length < 2) return;

    const existing = suggestions.get(cleaned);
    if (!existing || score > existing.score) {
      suggestions.set(cleaned, {
        query: cleaned,
        type,
        score,
        order: existing?.order ?? order++,
      });
    }
  };

  // 1. Extract invoice numbers FIRST (highest priority for matching)
  const allInvoiceNumbers = [
    ...extractInvoiceNumbers(transaction.description || ""),
    ...extractInvoiceNumbers(transaction.name || ""),
    ...extractInvoiceNumbers(transaction.reference || ""),
  ];

  for (const invoiceNum of allInvoiceNumbers) {
    addSuggestion(invoiceNum, "invoice_number", 100); // Highest priority
  }

  // 2. Company/Partner names (second priority)
  if (partner?.name) {
    const cleaned = cleanText(partner.name);
    addSuggestion(cleaned, "company_name", 90);
    const firstWord = extractFirstWord(partner.name);
    if (firstWord && firstWord !== cleaned.toLowerCase()) {
      addSuggestion(firstWord, "company_name", 88);
    }
  }

  if (transaction.partner) {
    const cleaned = cleanText(transaction.partner);
    addSuggestion(cleaned, "company_name", 85);
    const firstWord = extractFirstWord(transaction.partner);
    if (firstWord && firstWord.length >= 3) {
      addSuggestion(firstWord, "company_name", 83);
    }
  }

  if (partner?.aliases?.length) {
    for (const alias of partner.aliases.filter((a) => !a.includes("*"))) {
      const cleaned = cleanText(alias);
      if (cleaned) {
        addSuggestion(cleaned, "company_name", 80);
      }
    }
  }

  // 3. Email domains
  if (partner?.emailDomains?.length) {
    for (const domain of partner.emailDomains) {
      addSuggestion(`from:${domain}`, "email_domain", 78);
    }
  }

  if (partner?.website) {
    const website = partner.website.replace(/^www\./i, "");
    addSuggestion(`from:${website}`, "email_domain", 75);
  }

  // 4. IBANs and VAT IDs
  if (partner?.ibans?.length) {
    for (const iban of partner.ibans) {
      addSuggestion(iban.replace(/\s+/g, ""), "iban", 70);
    }
  }

  if (partner?.vatId) {
    addSuggestion(partner.vatId, "vat_id", 68);
  }

  // 5. File source patterns
  if (partner?.fileSourcePatterns?.length) {
    const sortedPatterns = [...partner.fileSourcePatterns].sort((a, b) => {
      if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
      return b.confidence - a.confidence;
    });

    for (const pattern of sortedPatterns.slice(0, 3)) {
      const normalized =
        pattern.sourceType === "local"
          ? pattern.pattern.replace(/\*/g, " ").replace(/\s+/g, " ").trim()
          : pattern.pattern;
      if (normalized) {
        addSuggestion(normalized, "pattern", 65);
      }
    }
  }

  // 6. Fallback search variants
  const baseName = partner?.name ? cleanText(partner.name) :
                   transaction.partner ? cleanText(transaction.partner) : null;

  if (baseName) {
    addSuggestion(`${baseName} rechnung`, "fallback", 55);
    addSuggestion(`${baseName} invoice`, "fallback", 52);
  }

  if (transaction.name && transaction.name !== transaction.partner) {
    const firstWord = extractFirstWord(transaction.name);
    if (firstWord && firstWord.length >= 3) {
      addSuggestion(firstWord, "fallback", 50);
    }
    addSuggestion(cleanText(transaction.name), "fallback", 45);
  }

  const sorted = Array.from(suggestions.values()).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.order - b.order;
  });

  return sorted.slice(0, maxQueries).map((entry) => ({
    query: entry.query,
    type: entry.type,
    score: entry.score,
  }));
}

/**
 * Legacy function for backward compatibility
 * Returns just the query strings without types
 */
export function generateSearchQueries(
  transaction: QueryGenerationTransaction,
  partner?: QueryGenerationPartner | null,
  maxQueries: number = 8
): string[] {
  return generateTypedSearchQueries(transaction, partner, maxQueries)
    .map((s) => s.query);
}
