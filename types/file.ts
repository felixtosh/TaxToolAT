import { Timestamp } from "firebase/firestore";

/**
 * Match sources for transaction matching - indicates which criteria contributed to a match
 */
export type TransactionMatchSource =
  | "amount_exact"
  | "amount_close"
  | "date_exact"
  | "date_close"
  | "partner"
  | "iban"
  | "reference";

/**
 * A suggested transaction match for a file
 */
export interface TransactionSuggestion {
  transactionId: string;
  confidence: number; // 0-100
  matchSources: TransactionMatchSource[];

  /** Cached transaction info for display (avoids extra lookup) */
  preview: {
    date: Timestamp;
    amount: number;
    currency: string;
    name: string;
    partner: string | null;
  };
}

/**
 * A file (PDF/image) uploaded to TaxStudio.
 * Files are standalone entities that can be connected to multiple transactions.
 * Collection: /files/{id}
 */
export interface TaxFile {
  id: string;

  /** Owner of this file */
  userId: string;

  // === Storage ===

  /** Original filename */
  fileName: string;

  /** MIME type (image/jpeg, image/png, application/pdf) */
  fileType: string;

  /** File size in bytes */
  fileSize: number;

  /** Firebase Storage path */
  storagePath: string;

  /** Public download URL */
  downloadUrl: string;

  /** Thumbnail URL for images/PDFs (optional) */
  thumbnailUrl?: string;

  /** SHA-256 hash of file content for duplicate detection */
  contentHash?: string;

  // === AI Extracted Data ===

  /** AI-extracted document date (when the document was issued) */
  extractedDate?: Timestamp | null;

  /** AI-extracted amount in cents */
  extractedAmount?: number | null;

  /** AI-extracted currency code */
  extractedCurrency?: string | null;

  /** AI-extracted VAT percentage (0-100) */
  extractedVatPercent?: number | null;

  /** AI-extracted partner/company name */
  extractedPartner?: string | null;

  /** AI-extracted VAT ID */
  extractedVatId?: string | null;

  /** AI-extracted IBAN */
  extractedIban?: string | null;

  /** AI-extracted address */
  extractedAddress?: string | null;

  /** AI-extracted text (OCR result) */
  extractedText?: string | null;

  /** AI confidence score (0-100) */
  extractionConfidence?: number | null;

  /** Whether AI extraction has been completed */
  extractionComplete: boolean;

  /** Error message if extraction failed */
  extractionError?: string | null;

  /** Extracted field locations for overlay rendering */
  extractedFields?: ExtractedFieldLocation[];

  // === Relationships ===

  /** Transaction IDs this file is connected to (denormalized for queries) */
  transactionIds: string[];

  // === Transaction Matching ===

  /** Auto-matched transaction suggestions (stored after extraction) */
  transactionSuggestions?: TransactionSuggestion[];

  /** Whether transaction matching has been completed */
  transactionMatchComplete?: boolean;

  /** When transaction matching was last run */
  transactionMatchedAt?: Timestamp | null;

  // === Partner Assignment ===

  /** Assigned partner ID (user or global) */
  partnerId?: string | null;

  /** Partner type (user = custom, global = shared) */
  partnerType?: "user" | "global" | null;

  /** How the partner was matched */
  partnerMatchedBy?: "manual" | "suggestion" | "auto" | null;

  /** Confidence score for partner match (0-100) */
  partnerMatchConfidence?: number | null;

  // === Metadata ===

  uploadedAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Junction collection for File <-> Transaction relationship
 * Collection: /fileConnections/{id}
 *
 * This exists for:
 * 1. Querying "all files for a transaction" efficiently
 * 2. Querying "all transactions for a file" efficiently
 * 3. Storing connection metadata (when connected, how matched)
 */
export interface FileConnection {
  id: string;

  fileId: string;
  transactionId: string;
  userId: string;

  /** How this connection was made */
  connectionType: "manual" | "auto_matched" | "suggestion_accepted";

  /** Which matching criteria led to the match (for auto/suggestion) */
  matchSources?: TransactionMatchSource[];

  /** AI confidence if auto-matched (0-100) */
  matchConfidence?: number | null;

  createdAt: Timestamp;
}

/**
 * Filters for file queries
 */
export interface FileFilters {
  /** Text search in filename, extracted partner */
  search?: string;

  /** Filter by connection status */
  hasConnections?: boolean;

  /** Filter by extraction status */
  extractionComplete?: boolean;

  /** Date range for upload date */
  uploadedFrom?: Date;
  uploadedTo?: Date;

  /** Date range for extracted document date */
  extractedDateFrom?: Date;
  extractedDateTo?: Date;
}

/**
 * Form data for creating a file record (after upload to storage)
 */
export interface FileCreateData {
  fileName: string;
  fileType: string;
  fileSize: number;
  storagePath: string;
  downloadUrl: string;
  thumbnailUrl?: string;
  contentHash?: string;
}

/**
 * Data for updating AI extraction results
 */
export interface FileExtractionData {
  extractedDate?: Timestamp | null;
  extractedAmount?: number | null;
  extractedCurrency?: string | null;
  extractedVatPercent?: number | null;
  extractedPartner?: string | null;
  extractedText?: string | null;
  extractionConfidence?: number | null;
  extractionComplete: boolean;
  extractionError?: string | null;
  extractedFields?: ExtractedFieldLocation[];
}

/**
 * Location of an extracted field on the document for overlay rendering
 */
export interface ExtractedFieldLocation {
  /** Which field this location refers to */
  field: "date" | "amount" | "currency" | "vatPercent" | "partner" | "vatId" | "iban" | "address";

  /** The extracted value as text */
  value: string;

  /** Confidence score (0-1) */
  confidence: number;

  /** Bounding box for overlay rendering */
  boundingBox?: {
    /** Normalized coordinates (0-1) */
    vertices: Array<{ x: number; y: number }>;
    /** Page index for multi-page PDFs */
    pageIndex: number;
  };
}
