import { Timestamp } from "firebase/firestore";

/**
 * Represents an import job - tracks the state of a CSV or API import operation.
 */
export interface ImportJob {
  id: string;

  /** The source (bank account) this import is for */
  sourceId: string;

  /** Type of import */
  type: "csv" | "api";

  /** Current status of the import job */
  status: ImportJobStatus;

  // === CSV-specific fields ===

  /** Original filename */
  fileName?: string;

  /** File size in bytes */
  fileSize?: number;

  /** Detected character encoding, e.g., "UTF-8", "ISO-8859-1" */
  encoding?: string;

  /** Detected delimiter, e.g., ",", ";", "\t" */
  delimiter?: string;

  // === Mapping state ===

  /** Column headers from the CSV */
  detectedHeaders: string[];

  /** First 10 rows for AI auto-matching */
  sampleRows: Record<string, string>[];

  /** Current field mappings */
  fieldMappings: FieldMapping[];

  /** Selected date parser format */
  dateFormat: string;

  /** Selected amount parser configuration */
  amountFormat: AmountFormatConfig;

  // === Results ===

  /** Total number of data rows in the file */
  totalRows: number;

  /** Successfully imported transactions */
  importedCount: number;

  /** Skipped due to deduplication */
  skippedCount: number;

  /** Rows that failed to import */
  errorCount: number;

  /** Detailed error information */
  errors: ImportError[];

  // === Metadata ===

  userId: string;
  createdAt: Timestamp;
  completedAt?: Timestamp;
}

export type ImportJobStatus =
  | "pending"     // Job created, file uploaded
  | "mapping"     // AI matching in progress
  | "preview"     // User reviewing mappings
  | "importing"   // Import execution in progress
  | "completed"   // Successfully finished
  | "failed";     // Failed with errors

/**
 * Mapping between a CSV column and our transaction field
 */
export interface FieldMapping {
  /** Original CSV column header */
  csvColumn: string;

  /** Our target field key, or null if unmapped */
  targetField: string | null;

  /** AI confidence score (0-1) */
  confidence: number;

  /** Whether user has confirmed/modified this mapping */
  userConfirmed: boolean;

  /** Whether to store in _original.rawRow even if unmapped */
  keepAsMetadata: boolean;

  /** Parser ID for date/amount fields (auto-detected or user-selected) */
  format?: string;
}

/**
 * Error that occurred during import of a specific row
 */
export interface ImportError {
  /** Row number (1-indexed) */
  row: number;

  /** Field that caused the error */
  field: string;

  /** Original value that failed */
  value: string;

  /** Human-readable error message */
  message: string;
}

/**
 * Configuration for parsing amounts from various formats
 */
export interface AmountFormatConfig {
  /** Character used for decimal point: "." or "," */
  decimalSeparator: "." | ",";

  /** Character used for thousands grouping */
  thousandsSeparator: "." | "," | " " | "";

  /** How negative numbers are represented */
  negativeFormat: "minus" | "parentheses" | "cr-dr";

  /** Where currency symbol appears, if any */
  currencyPosition?: "prefix" | "suffix" | "none";
}

/**
 * Pre-configured amount format presets
 */
export interface AmountParser {
  id: string;
  name: string;
  config: AmountFormatConfig;
}

/**
 * Configuration for parsing dates from various formats
 */
export interface DateParser {
  /** Unique identifier */
  id: string;

  /** Human-readable name, e.g., "German (DD.MM.YYYY)" */
  name: string;

  /** Regex pattern to validate format */
  pattern: RegExp;

  /** date-fns format string */
  format: string;
}

/**
 * Definition of a transaction field for AI matching
 */
export interface FieldDefinition {
  /** Internal field key, e.g., "date", "amount" */
  key: string;

  /** Human-readable label */
  label: string;

  /**
   * Detailed description for AI matching.
   * Should explain what this field represents and common variations.
   */
  description: string;

  /**
   * Common column header names in various languages.
   * Used for fast alias matching before AI inference.
   */
  aliases: string[];

  /** Whether this field must be mapped for a valid import */
  required: boolean;

  /** Data type for validation and parsing */
  type: "date" | "amount" | "text" | "iban";

  /** Example values to help AI understand the format */
  examples: string[];
}

/**
 * Result of AI column matching
 */
export interface ColumnMatchResult {
  /** CSV column header */
  csvColumn: string;

  /** Matched field key, or null if no match */
  matchedField: string | null;

  /** Confidence score (0-1) */
  confidence: number;

  /** Suggested parser ID for date/amount fields */
  suggestedParser?: string;
}

/**
 * Options for CSV parsing
 */
export interface CSVParseOptions {
  /** Character encoding */
  encoding: string;

  /** Field delimiter */
  delimiter: string;

  /** Whether first row contains headers */
  hasHeader: boolean;

  /** Number of rows to skip at the beginning */
  skipRows: number;
}

/**
 * Result of CSV file analysis
 */
export interface CSVAnalysis {
  /** Detected parse options */
  options: CSVParseOptions;

  /** Parsed header row */
  headers: string[];

  /** Sample data rows (first 50) */
  sampleRows: Record<string, string>[];

  /** Total row count (excluding header) */
  totalRows: number;
}

/**
 * Persisted import record - lightweight summary of a completed import.
 * Stored in Firestore 'imports' collection.
 */
export interface ImportRecord {
  /** Document ID (same as importJobId stored on transactions) */
  id: string;

  /** The source (bank account) this import belongs to */
  sourceId: string;

  /** Original filename */
  fileName: string;

  /** When the import was executed */
  createdAt: Timestamp;

  /** Number of transactions successfully imported */
  importedCount: number;

  /** Number of rows skipped (duplicates) */
  skippedCount: number;

  /** Number of rows that had errors */
  errorCount: number;

  /** Total rows in the original file */
  totalRows: number;

  /** Owner of this import */
  userId: string;
}
