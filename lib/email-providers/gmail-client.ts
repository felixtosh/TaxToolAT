import {
  EmailSearchResult,
  EmailMessage,
  EmailAttachment,
  AttachmentDownloadResult,
} from "@/types/email-integration";
import {
  EmailProviderClient,
  registerProviderFactory,
  isLikelyReceiptAttachment,
  buildGmailSearchQuery,
} from "./interface";

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1";

/**
 * Gmail API client implementing the EmailProviderClient interface
 */
export class GmailClient implements EmailProviderClient {
  readonly provider = "gmail" as const;
  readonly integrationId: string;
  private accessToken: string;
  private refreshToken: string;
  private onTokenRefresh?: (newAccessToken: string, expiresAt: Date) => void;

  constructor(
    integrationId: string,
    accessToken: string,
    refreshToken: string,
    onTokenRefresh?: (newAccessToken: string, expiresAt: Date) => void
  ) {
    this.integrationId = integrationId;
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.onTokenRefresh = onTokenRefresh;
  }

  /**
   * Make an authenticated request to the Gmail API
   */
  private async gmailFetch<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${GMAIL_API_BASE}/users/me${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("AUTH_EXPIRED");
      }
      const errorText = await response.text();
      throw new Error(`Gmail API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  /**
   * Search for emails matching the given criteria
   */
  async searchMessages(params: {
    query?: string;
    dateFrom?: Date;
    dateTo?: Date;
    hasAttachments?: boolean;
    from?: string;
    limit?: number;
    pageToken?: string;
  }): Promise<EmailSearchResult> {
    // Build Gmail search query
    const searchQuery = buildGmailSearchQuery({
      query: params.query,
      from: params.from,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      hasAttachments: params.hasAttachments ?? true, // Default to only emails with attachments
    });

    // Search for message IDs
    const searchParams = new URLSearchParams({
      q: searchQuery,
      maxResults: String(params.limit || 20),
    });
    if (params.pageToken) {
      searchParams.set("pageToken", params.pageToken);
    }

    const searchResult = await this.gmailFetch<{
      messages?: Array<{ id: string; threadId: string }>;
      nextPageToken?: string;
      resultSizeEstimate?: number;
    }>(`/messages?${searchParams.toString()}`);

    if (!searchResult.messages || searchResult.messages.length === 0) {
      return {
        messages: [],
        nextPageToken: undefined,
        totalEstimate: 0,
      };
    }

    // Fetch full message details for each result
    const messages = await Promise.all(
      searchResult.messages.map((msg) => this.getMessage(msg.id))
    );

    // Filter out null results (messages that couldn't be fetched)
    const validMessages = messages.filter(
      (msg): msg is EmailMessage => msg !== null
    );

    return {
      messages: validMessages,
      nextPageToken: searchResult.nextPageToken,
      totalEstimate: searchResult.resultSizeEstimate,
    };
  }

  /**
   * Get a single message by ID
   */
  private async getMessage(messageId: string): Promise<EmailMessage | null> {
    try {
      const message = await this.gmailFetch<GmailMessage>(
        `/messages/${messageId}?format=full`
      );

      return this.parseMessage(message);
    } catch (error) {
      console.error(`Failed to fetch message ${messageId}:`, error);
      return null;
    }
  }

  /**
   * Parse Gmail API message response into our EmailMessage format
   */
  private parseMessage(message: GmailMessage): EmailMessage {
    const headers = message.payload?.headers || [];

    // Extract headers
    const getHeader = (name: string): string => {
      const header = headers.find(
        (h) => h.name.toLowerCase() === name.toLowerCase()
      );
      return header?.value || "";
    };

    const subject = getHeader("Subject");
    const from = getHeader("From");
    const dateStr = getHeader("Date");

    // Parse sender
    const fromMatch = from.match(/(?:"?([^"]*)"?\s)?(?:<?(.+@[^>]+)>?)/);
    const fromName = fromMatch?.[1] || fromMatch?.[2]?.split("@")[0] || from;
    const fromEmail = fromMatch?.[2] || from;

    // Parse date
    let date: Date;
    try {
      date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        date = new Date(parseInt(message.internalDate));
      }
    } catch {
      date = new Date(parseInt(message.internalDate));
    }

    // Extract attachments
    const attachments = this.extractAttachments(message.payload, message.id);

    return {
      messageId: message.id,
      threadId: message.threadId,
      integrationId: this.integrationId,
      subject,
      from: fromEmail,
      fromName,
      date,
      snippet: message.snippet || "",
      attachments,
      labels: message.labelIds,
    };
  }

  /**
   * Recursively extract attachments from message payload
   */
  private extractAttachments(
    payload: GmailMessagePart | undefined,
    messageId: string
  ): EmailAttachment[] {
    const attachments: EmailAttachment[] = [];

    if (!payload) return attachments;

    // Check if this part is an attachment
    if (payload.filename && payload.body?.attachmentId) {
      const mimeType = payload.mimeType || "application/octet-stream";
      attachments.push({
        attachmentId: payload.body.attachmentId,
        messageId,
        filename: payload.filename,
        mimeType,
        size: payload.body.size || 0,
        isLikelyReceipt: isLikelyReceiptAttachment(payload.filename, mimeType),
      });
    }

    // Recursively check child parts
    if (payload.parts) {
      for (const part of payload.parts) {
        attachments.push(...this.extractAttachments(part, messageId));
      }
    }

    return attachments;
  }

  /**
   * Download attachment data
   * @param messageId - Gmail message ID
   * @param attachmentId - Gmail attachment ID
   * @param metadata - Optional metadata (mimeType, filename) if already known
   */
  async getAttachmentData(
    messageId: string,
    attachmentId: string,
    metadata?: { mimeType?: string; filename?: string }
  ): Promise<AttachmentDownloadResult> {
    // Fetch the attachment data directly from Gmail API
    const attachmentData = await this.gmailFetch<{ data: string; size: number }>(
      `/messages/${messageId}/attachments/${attachmentId}`
    );

    // Decode base64url data
    const data = Buffer.from(
      attachmentData.data.replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    );

    // Use provided metadata or defaults
    return {
      data,
      mimeType: metadata?.mimeType || "application/octet-stream",
      filename: metadata?.filename || "attachment",
      size: data.length,
    };
  }

  /**
   * Find an attachment part by ID in the message payload
   */
  private findAttachmentPart(
    payload: GmailMessagePart | undefined,
    attachmentId: string
  ): GmailMessagePart | null {
    if (!payload) return null;

    if (payload.body?.attachmentId === attachmentId) {
      return payload;
    }

    if (payload.parts) {
      for (const part of payload.parts) {
        const found = this.findAttachmentPart(part, attachmentId);
        if (found) return found;
      }
    }

    return null;
  }

  /**
   * Gmail doesn't provide direct preview URLs for attachments
   */
  async getAttachmentPreviewUrl(): Promise<string | null> {
    // Gmail requires downloading the full attachment
    // Preview is handled by downloading and displaying locally
    return null;
  }

  /**
   * Validate that the current access token is still valid
   */
  async validateAuth(): Promise<boolean> {
    try {
      // Try to get profile info - simple API call to test auth
      await this.gmailFetch<{ emailAddress: string }>("/profile");
      return true;
    } catch (error) {
      if (error instanceof Error && error.message === "AUTH_EXPIRED") {
        return false;
      }
      throw error;
    }
  }

  /**
   * Attempt to refresh the access token
   * Note: This requires server-side implementation with client secret
   */
  async refreshAuth(): Promise<boolean> {
    // Token refresh must be done server-side where the client secret is available
    // This method is called by API routes, not directly from client
    if (!this.refreshToken) {
      return false;
    }

    try {
      // This would be implemented in an API route
      // The API route would call Google's token endpoint with:
      // - client_id
      // - client_secret
      // - refresh_token
      // - grant_type: "refresh_token"

      // For now, return false to trigger re-authentication
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Revoke OAuth access
   */
  async revokeAuth(): Promise<void> {
    try {
      await fetch(
        `https://oauth2.googleapis.com/revoke?token=${this.accessToken}`,
        { method: "POST" }
      );
    } catch {
      // Ignore revocation errors
    }
  }
}

/**
 * Gmail message types (from Gmail API)
 */
interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate: string;
  payload?: GmailMessagePart;
}

interface GmailMessagePart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: {
    attachmentId?: string;
    size?: number;
    data?: string;
  };
  parts?: GmailMessagePart[];
}

// Register the Gmail client factory
registerProviderFactory(
  "gmail",
  (integrationId, accessToken, refreshToken) =>
    new GmailClient(integrationId, accessToken, refreshToken)
);

export default GmailClient;
