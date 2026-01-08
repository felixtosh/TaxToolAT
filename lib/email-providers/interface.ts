import {
  EmailSearchParams,
  EmailSearchResult,
  AttachmentDownloadResult,
  EmailProvider,
} from "@/types/email-integration";

/**
 * Abstract interface for email providers.
 * All providers (Gmail, Outlook, iCloud) must implement this interface.
 *
 * This allows the application to work with any email provider
 * through a unified API.
 */
export interface EmailProviderClient {
  /** The provider type this client handles */
  readonly provider: EmailProvider;

  /** The integration ID this client is configured for */
  readonly integrationId: string;

  /**
   * Search for emails matching the given criteria.
   * Returns messages with attachment metadata (not the actual attachment data).
   *
   * @param params - Search parameters
   * @returns Search results with messages and pagination token
   */
  searchMessages(params: Omit<EmailSearchParams, "integrationId">): Promise<EmailSearchResult>;

  /**
   * Download attachment data.
   *
   * @param messageId - The message containing the attachment
   * @param attachmentId - The attachment to download
   * @returns The attachment data, MIME type, and filename
   */
  getAttachmentData(
    messageId: string,
    attachmentId: string
  ): Promise<AttachmentDownloadResult>;

  /**
   * Get a temporary preview URL for an attachment.
   * Not all providers support this - returns null if unavailable.
   *
   * @param messageId - The message containing the attachment
   * @param attachmentId - The attachment to preview
   * @returns Preview URL or null if not supported
   */
  getAttachmentPreviewUrl?(
    messageId: string,
    attachmentId: string
  ): Promise<string | null>;

  /**
   * Check if the current authentication is still valid.
   *
   * @returns true if auth is valid, false if re-auth needed
   */
  validateAuth(): Promise<boolean>;

  /**
   * Attempt to refresh the authentication tokens.
   *
   * @returns true if refresh succeeded, false if re-auth needed
   */
  refreshAuth(): Promise<boolean>;

  /**
   * Revoke the OAuth tokens and clean up.
   * Called when user disconnects the integration.
   */
  revokeAuth(): Promise<void>;
}

/**
 * Factory function type for creating provider clients.
 * Each provider implements this to create configured client instances.
 */
export type EmailProviderClientFactory = (
  integrationId: string,
  accessToken: string,
  refreshToken: string
) => EmailProviderClient;

/**
 * Registry of provider client factories.
 * Used to instantiate the correct client based on provider type.
 */
export const providerFactories: Partial<Record<EmailProvider, EmailProviderClientFactory>> = {};

/**
 * Register a provider client factory.
 *
 * @param provider - The provider type
 * @param factory - Factory function to create client instances
 */
export function registerProviderFactory(
  provider: EmailProvider,
  factory: EmailProviderClientFactory
): void {
  providerFactories[provider] = factory;
}

/**
 * Create a provider client for the given provider type.
 *
 * @param provider - The provider type
 * @param integrationId - The integration ID
 * @param accessToken - OAuth access token
 * @param refreshToken - OAuth refresh token
 * @returns Configured provider client
 * @throws Error if provider is not registered
 */
export function createProviderClient(
  provider: EmailProvider,
  integrationId: string,
  accessToken: string,
  refreshToken: string
): EmailProviderClient {
  const factory = providerFactories[provider];
  if (!factory) {
    throw new Error(`No client factory registered for provider: ${provider}`);
  }
  return factory(integrationId, accessToken, refreshToken);
}

/**
 * Helper to determine if an attachment is likely a receipt/invoice
 * based on filename and MIME type.
 */
export function isLikelyReceiptAttachment(
  filename: string,
  mimeType: string
): boolean {
  // Check MIME type - PDFs and images are most common for receipts
  const receiptMimeTypes = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
  ];

  if (!receiptMimeTypes.includes(mimeType.toLowerCase())) {
    return false;
  }

  // Check filename for receipt/invoice indicators
  const lowerFilename = filename.toLowerCase();
  const receiptKeywords = [
    "invoice",
    "receipt",
    "rechnung",
    "quittung",
    "beleg",
    "faktura",
    "bon",
    "bill",
    "order",
    "bestellung",
    "confirmation",
    "bestätigung",
    "payment",
    "zahlung",
  ];

  // If filename contains receipt keywords, definitely likely
  if (receiptKeywords.some((kw) => lowerFilename.includes(kw))) {
    return true;
  }

  // PDFs are commonly receipts even without keywords
  if (mimeType === "application/pdf") {
    return true;
  }

  // Images with generic names might be receipts
  // but we'll be conservative
  return false;
}

/**
 * Build a Gmail-style search query from structured parameters.
 * Other providers may need different query builders.
 */
export function buildGmailSearchQuery(params: {
  query?: string;
  from?: string;
  dateFrom?: Date;
  dateTo?: Date;
  hasAttachments?: boolean;
}): string {
  const parts: string[] = [];

  if (params.query) {
    parts.push(params.query);
  }

  if (params.from) {
    parts.push(`from:${params.from}`);
  }

  if (params.dateFrom) {
    const dateStr = formatGmailDate(params.dateFrom);
    parts.push(`after:${dateStr}`);
  }

  if (params.dateTo) {
    const dateStr = formatGmailDate(params.dateTo);
    parts.push(`before:${dateStr}`);
  }

  if (params.hasAttachments) {
    parts.push("has:attachment");
  }

  return parts.join(" ");
}

/**
 * Format a date for Gmail search query (YYYY/MM/DD)
 */
function formatGmailDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}
