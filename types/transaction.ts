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

  /** Reference to category document */
  categoryId: string | null;

  /** Array of receipt document IDs */
  receiptIds: string[];

  /** Whether transaction has receipt + description */
  isComplete: boolean;

  // === Metadata ===

  /** ID of the import job that created this transaction */
  importJobId: string | null;

  /** Owner of this transaction */
  userId: string;

  // === Partner Matching ===

  /** Linked partner ID (if matched) */
  partnerId?: string;

  /** Whether linked partner is global or user-specific */
  partnerType?: "global" | "user";

  /** Match confidence (0-100) */
  partnerMatchConfidence?: number;

  /** How the partner was matched: auto (≥95%), manual, or suggestion click */
  partnerMatchedBy?: "auto" | "manual" | "suggestion";

  /** Top 3 partner suggestions (stored for UI display) */
  partnerSuggestions?: Array<{
    partnerId: string;
    partnerType: "global" | "user";
    confidence: number;
    source: "iban" | "vatId" | "website" | "name";
  }>;

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

  /** Filter by category */
  categoryId?: string;

  /** Date range start */
  dateFrom?: Date;

  /** Date range end */
  dateTo?: Date;

  /** Filter by receipt attachment status */
  hasReceipt?: boolean;

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
