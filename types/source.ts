import { Timestamp } from "firebase/firestore";
import { AmountFormatConfig } from "./import";

/**
 * A transaction source represents a bank account or financial data source.
 * All transactions must be associated with a source for proper organization
 * and deduplication.
 */
export interface TransactionSource {
  id: string;

  /** Display name for the account, e.g., "Erste Bank Business" */
  name: string;

  /** International Bank Account Number for deduplication */
  iban: string;

  /** Bank Identifier Code (SWIFT) - optional */
  bic?: string;

  /** Name of the bank institution */
  bankName?: string;

  /** How transactions are imported */
  type: "csv" | "api";

  /** Configuration for API-based connectors (future use) */
  apiConfig?: ApiConnectorConfig;

  /** Saved column mappings from previous imports */
  fieldMappings?: SavedFieldMapping;

  /** Default currency for transactions, e.g., "EUR" */
  currency: string;

  /** Whether this source is active and visible */
  isActive: boolean;

  /** Owner of this source */
  userId: string;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Configuration for API-based transaction connectors
 */
export type ApiConnectorConfig = GoCardlessConnectorConfig | GenericConnectorConfig;

/**
 * GoCardless-specific connector configuration
 */
export interface GoCardlessConnectorConfig {
  provider: "gocardless";
  /** GoCardless requisition ID */
  requisitionId: string;
  /** GoCardless account ID */
  accountId: string;
  /** Institution identifier */
  institutionId: string;
  institutionName: string;
  institutionLogo?: string;
  /** When the agreement expires (90 days PSD2 limit) */
  agreementExpiresAt: Timestamp;
  /** Last successful sync */
  lastSyncAt?: Timestamp;
  /** Last sync error if any */
  lastSyncError?: string;
  /** Sync schedule (cron expression) */
  syncSchedule?: string;
}

/**
 * Generic connector configuration for future providers
 */
export interface GenericConnectorConfig {
  /** Provider identifier: "plaid" | "nordigen" | "custom" */
  provider: string;

  /** Encrypted credentials or tokens */
  credentials: Record<string, string>;

  /** Last successful sync timestamp */
  lastSyncAt?: Timestamp;

  /** Cron expression for scheduled syncs, e.g., "0 6 * * *" */
  syncSchedule?: string;

  /** Provider-specific settings */
  settings?: Record<string, unknown>;
}

/**
 * Persisted column mappings for a source, saved after successful imports.
 * Allows users to skip manual mapping on subsequent imports.
 */
export interface SavedFieldMapping {
  /**
   * CSV column header -> our field key mapping
   * e.g., { "Buchungsdatum": "date", "Betrag": "amount" }
   */
  mappings: Record<string, string>;

  /**
   * CSV column header -> format parser ID
   * e.g., { "Buchungsdatum": "de", "Betrag": "de" }
   */
  formats?: Record<string, string>;

  /** @deprecated Use formats instead - kept for backwards compatibility */
  dateFormat?: string;

  /** @deprecated Use formats instead - kept for backwards compatibility */
  amountFormat?: AmountFormatConfig;

  /** When these mappings were last used */
  lastUsedAt: Timestamp;
}

/**
 * Form data for creating a new source
 */
export interface SourceFormData {
  name: string;
  iban: string;
  bic?: string;
  bankName?: string;
  currency: string;
  type: "csv" | "api";
}
