import { Timestamp } from "firebase/firestore";

/**
 * Supported email providers
 */
export type EmailProvider = "gmail" | "outlook" | "icloud";

/**
 * Email integration document stored in Firestore
 * Collection: /emailIntegrations/{id}
 */
export interface EmailIntegration {
  id: string;
  userId: string;

  /** Email provider type */
  provider: EmailProvider;

  /** User's email address for this connection */
  email: string;

  /** Display name for the account */
  displayName?: string;

  /** Provider-specific account ID (e.g., Google user ID) */
  accountId: string;

  /** When the OAuth access token expires */
  tokenExpiresAt: Timestamp;

  /** Last time this integration was used for search/download */
  lastAccessedAt?: Timestamp;

  /** Whether integration is active and usable */
  isActive: boolean;

  /** Requires re-authentication (token refresh failed) */
  needsReauth: boolean;

  /** Whether sync is paused by user */
  isPaused?: boolean;

  /** When sync was paused */
  pausedAt?: Timestamp;

  /** Last error message if any */
  lastError?: string;

  createdAt: Timestamp;
  updatedAt: Timestamp;

  // === Sync Status ===

  /** Last time invoices were synced from this account */
  lastSyncAt?: Timestamp;

  /** Status of the last sync attempt */
  lastSyncStatus?: "success" | "partial" | "failed";

  /** Error message from last sync */
  lastSyncError?: string;

  /** Number of files pulled in last sync */
  lastSyncFileCount?: number;

  /** Whether initial sync has completed (after first connection) */
  initialSyncComplete?: boolean;

  /** When initial sync started (for tracking progress) */
  initialSyncStartedAt?: Timestamp;

  // === Soft Disconnect State ===

  /** When the integration was soft-disconnected (OAuth revoked but files preserved) */
  disconnectedAt?: Timestamp;

  /**
   * Gmail message IDs that have been processed.
   * Stored on disconnect to enable resumption on reconnect.
   */
  processedMessageIds?: string[];

  /**
   * Date range of the last sync (for resumption reference).
   */
  lastSyncDateRange?: {
    from: Timestamp;
    to: Timestamp;
  };

  /**
   * Total date range that has been synced across all syncs.
   * Used to detect gaps when transaction range expands.
   * Expands over time as new syncs cover additional periods.
   */
  syncedDateRange?: {
    from: Timestamp;
    to: Timestamp;
  };
}

/**
 * Server-side token storage (not accessible from client)
 * Collection: /emailTokens/{integrationId}
 */
export interface EmailTokenDocument {
  integrationId: string;
  userId: string;
  provider: EmailProvider;

  /** Encrypted access token */
  accessToken: string;

  /** Encrypted refresh token */
  refreshToken: string;

  /** Token expiry timestamp */
  expiresAt: Timestamp;

  updatedAt: Timestamp;
}

/**
 * Email attachment metadata
 */
export interface EmailAttachment {
  /** Attachment ID from provider */
  attachmentId: string;

  /** Message ID containing this attachment */
  messageId: string;

  /** Original filename */
  filename: string;

  /** MIME type (e.g., "application/pdf", "image/jpeg") */
  mimeType: string;

  /** Size in bytes */
  size: number;

  /** Whether this is likely a receipt/invoice based on filename/type */
  isLikelyReceipt: boolean;
}

/**
 * Email message with attachments (search result)
 */
export interface EmailMessage {
  /** Message ID from provider */
  messageId: string;

  /** Thread ID from provider */
  threadId: string;

  /** Integration ID this message came from */
  integrationId: string;

  /** Email subject */
  subject: string;

  /** Sender email address */
  from: string;

  /** Sender display name if available */
  fromName?: string;

  /** Message date */
  date: Date;

  /** Snippet/preview text */
  snippet: string;

  /** Attachments in this email */
  attachments: EmailAttachment[];

  /** Labels/folders (Gmail labels, Outlook folders) */
  labels?: string[];
}

/**
 * Search parameters for email queries
 */
export interface EmailSearchParams {
  /** Integration ID to search within */
  integrationId: string;

  /** Free-text search query (provider-specific syntax) */
  query?: string;

  /** Search within specific time range */
  dateFrom?: Date;
  dateTo?: Date;

  /** Only return messages with attachments */
  hasAttachments?: boolean;

  /** Filter by sender email/name */
  from?: string;

  /** Filter by attachment MIME types */
  attachmentTypes?: string[];

  /** Maximum results to return (default: 20) */
  limit?: number;

  /** Page token for pagination */
  pageToken?: string;
}

/**
 * Search results with pagination
 */
export interface EmailSearchResult {
  messages: EmailMessage[];
  nextPageToken?: string;
  totalEstimate?: number;
}

/**
 * Learned email search pattern stored on UserPartner
 */
export interface EmailSearchPattern {
  /** The search query pattern (e.g., "from:amazon.de invoice") */
  pattern: string;

  /** Which integration IDs this pattern works with */
  integrationIds: string[];

  /** Confidence score (0-100) based on successful uses */
  confidence: number;

  /** Number of times this pattern successfully found matches */
  usageCount: number;

  /** Transaction IDs where this pattern was used */
  sourceTransactionIds: string[];

  /** When pattern was created */
  createdAt: Timestamp;

  /** Last time pattern was used successfully */
  lastUsedAt: Timestamp;
}

/**
 * Data for creating a new email integration
 */
export interface CreateEmailIntegrationData {
  provider: EmailProvider;
  email: string;
  displayName?: string;
  accountId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

/**
 * Attachment download result
 */
export interface AttachmentDownloadResult {
  data: Buffer;
  mimeType: string;
  filename: string;
  size: number;
}

/**
 * Result of saving an attachment to Files
 */
export interface SaveAttachmentResult {
  fileId: string;
  fileName: string;
  downloadUrl: string;
  connectedToTransaction: boolean;
}
