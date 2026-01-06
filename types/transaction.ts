import { Timestamp } from "firebase/firestore";

/**
 * A financial transaction imported from a bank account.
 * All transactions must be associated with a source (bank account).
 */
export interface Transaction {
  id: string;

  /** Required - links to the source/bank account */
  sourceId: string;

  // === Normalized/processed fields (primary) ===

  /** Transaction date as Firebase Timestamp */
  date: Timestamp;

  /** Amount in cents, with normalized sign (negative = expense) */
  amount: number;

  /** Currency code, e.g., "EUR" */
  currency: string;

  // === Original values (backup) ===

  /** Original values before parsing/normalization */
  _original: {
    /** Original date string, e.g., "15.03.2024" */
    date: string;
    /** Original amount string, e.g., "-1.234,56" */
    amount: string;
    /** All CSV columns preserved as key-value pairs */
    rawRow: Record<string, string>;
  };

  // === Core fields ===

  /** Transaction description/booking text */
  name: string;

  /** User-added description for tax purposes */
  description: string | null;

  /** Counterparty name (sender/receiver) */
  partner: string | null;

  /** Bank reference number or transaction ID */
  reference: string | null;

  /** Counterparty IBAN if available */
  partnerIban: string | null;

  // === Deduplication ===

  /** SHA256 hash for deduplication: hash(date + amount + iban + reference) */
  dedupeHash: string;

  // === Classification ===

  /** Array of connected file IDs (many-to-many relationship). Optional for backward compatibility. */
  fileIds?: string[];

  /** Whether transaction has file + description */
  isComplete: boolean;

  // === Metadata ===

  /** ID of the import job that created this transaction */
  importJobId: string | null;

  /** Owner of this transaction */
  userId: string;

  // === Partner Matching ===
  // Note: These use `| null` (not just `?`) so Firestore queries work.
  // Firestore `where("partnerId", "==", null)` only matches explicit null, not missing fields.

  /** Linked partner ID (if matched) */
  partnerId?: string | null;

  /** Whether linked partner is global or user-specific */
  partnerType?: "global" | "user" | null;

  /** Match confidence (0-100) */
  partnerMatchConfidence?: number | null;

  /** How the partner was matched: auto (≥95%), manual, or suggestion click */
  partnerMatchedBy?: "auto" | "manual" | "suggestion" | null;

  /** Top 3 partner suggestions (stored for UI display) */
  partnerSuggestions?: Array<{
    partnerId: string;
    partnerType: "global" | "user";
    confidence: number;
    source: "iban" | "vatId" | "website" | "name";
  }>;

  // === No-Receipt Category ===
  // Note: These use `| null` (not just `?`) so Firestore queries work.

  /** No-receipt category ID (if assigned instead of file) */
  noReceiptCategoryId?: string | null;

  /** Template ID for quick identification */
  noReceiptCategoryTemplateId?: import("./no-receipt-category").NoReceiptCategoryId | null;

  /** How the category was assigned */
  noReceiptCategoryMatchedBy?: "manual" | "suggestion" | "auto" | null;

  /** Category match confidence (0-100) */
  noReceiptCategoryConfidence?: number | null;

  /** Top category suggestions (stored for UI display) */
  categorySuggestions?: import("./no-receipt-category").CategorySuggestion[];

  /** Receipt lost entry (only for "receipt-lost" category) */
  receiptLostEntry?: import("./no-receipt-category").ReceiptLostEntry | null;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Filters for querying transactions
 */
export interface TransactionFilters {
  /** Text search in name, description, partner */
  search?: string;

  /** Filter by source/bank account */
  sourceId?: string;

  /** Date range start */
  dateFrom?: Date;

  /** Date range end */
  dateTo?: Date;

  /** Filter by file attachment status */
  hasFile?: boolean;

  /** Filter by completion status */
  isComplete?: boolean;

  /** Filter by import job ID */
  importId?: string;

  /** Amount type: positive (income), negative (expense), or all */
  amountType?: "income" | "expense" | "all";

  /** Filter by matched partner ID */
  partnerId?: string;

  /** Filter by partner match status */
  hasPartner?: boolean;
}

export type TransactionSortField = "date" | "name" | "amount" | "partner";
export type SortDirection = "asc" | "desc";
