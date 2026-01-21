/**
 * Callable Cloud Function for Gmail search
 * Used by both UI (via callable) and can be imported by automation
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const db = getFirestore();

// ============================================================================
// Types
// ============================================================================

interface SearchGmailRequest {
  integrationId: string;
  query?: string;
  dateFrom?: string; // ISO date
  dateTo?: string; // ISO date
  from?: string;
  hasAttachments?: boolean;
  limit?: number;
  pageToken?: string;
  expandThreads?: boolean;
}

interface GmailAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
  isLikelyReceipt: boolean;
  existingFileId?: string | null;
}

interface GmailMessageResult {
  messageId: string;
  threadId: string;
  subject: string;
  from: string;
  fromName: string | null;
  date: string; // ISO string
  snippet: string;
  bodyText: string | null;
  attachments: GmailAttachment[];
}

interface SearchGmailResponse {
  messages: GmailMessageResult[];
  nextPageToken?: string;
  totalEstimate?: number;
}

interface EmailTokenDocument {
  accessToken: string;
  refreshToken: string;
  expiresAt: Timestamp;
}

interface GmailApiMessage {
  id: string;
  threadId: string;
  internalDate: string;
  snippet?: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
    parts?: GmailApiPart[];
    body?: { attachmentId?: string; size?: number; data?: string };
    mimeType: string;
  };
}

interface GmailApiPart {
  partId: string;
  mimeType: string;
  filename: string;
  body: { attachmentId?: string; size?: number; data?: string };
  parts?: GmailApiPart[];
}

// ============================================================================
// Helper Functions
// ============================================================================

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1";

// Receipt/invoice keywords (multilingual)
const RECEIPT_KEYWORDS = [
  "invoice", "rechnung", "receipt", "beleg", "quittung",
  "faktura", "bon", "bill", "order", "confirmation",
  "payment", "bestellung", "bestätigung", "zahlung",
];

function isLikelyReceiptAttachment(filename: string, mimeType: string): boolean {
  const receiptMimeTypes = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
  ];

  // Check MIME type first
  const normalizedMime = mimeType.toLowerCase();
  const isReceiptType = receiptMimeTypes.includes(normalizedMime) ||
    (normalizedMime === "application/octet-stream" && filename.toLowerCase().endsWith(".pdf"));

  if (!isReceiptType) return false;

  // For PDFs, almost always likely receipts
  if (normalizedMime === "application/pdf" ||
      (normalizedMime === "application/octet-stream" && filename.toLowerCase().endsWith(".pdf"))) {
    return true;
  }

  // For images, check filename for keywords
  const filenameLower = filename.toLowerCase();
  return RECEIPT_KEYWORDS.some((kw) => filenameLower.includes(kw));
}

function buildGmailSearchQuery(params: {
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
    const d = params.dateFrom;
    parts.push(`after:${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`);
  }

  if (params.dateTo) {
    const d = params.dateTo;
    parts.push(`before:${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`);
  }

  if (params.hasAttachments) {
    parts.push("has:attachment");
  }

  return parts.join(" ");
}

function extractHeader(message: GmailApiMessage, name: string): string | null {
  const header = message.payload.headers.find(
    (h) => h.name.toLowerCase() === name.toLowerCase()
  );
  return header?.value || null;
}

function parseFromHeader(from: string | null): { email: string; name: string | null } {
  if (!from) return { email: "", name: null };

  // Parse "Name <email@example.com>" format
  const match = from.match(/^(?:"?([^"<]*)"?\s*)?<?([^>]+)>?$/);
  if (match) {
    return {
      name: match[1]?.trim() || null,
      email: match[2]?.trim() || from,
    };
  }
  return { email: from, name: null };
}

function extractAttachments(message: GmailApiMessage): GmailAttachment[] {
  const attachments: GmailAttachment[] = [];

  function processPart(part: GmailApiPart) {
    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        attachmentId: part.body.attachmentId,
        filename: part.filename,
        mimeType: part.mimeType,
        size: part.body.size || 0,
        isLikelyReceipt: isLikelyReceiptAttachment(part.filename, part.mimeType),
      });
    }
    if (part.parts) {
      part.parts.forEach(processPart);
    }
  }

  if (message.payload.parts) {
    message.payload.parts.forEach(processPart);
  }

  return attachments;
}

function extractBodyText(message: GmailApiMessage): string | null {
  let textContent: string | null = null;

  function processPart(part: GmailApiPart) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      const decoded = Buffer.from(part.body.data, "base64").toString("utf-8");
      if (!textContent || decoded.length > textContent.length) {
        textContent = decoded;
      }
    }
    if (part.parts) {
      part.parts.forEach(processPart);
    }
  }

  if (message.payload.parts) {
    message.payload.parts.forEach(processPart);
  } else if (message.payload.body?.data) {
    textContent = Buffer.from(message.payload.body.data, "base64").toString("utf-8");
  }

  return textContent;
}

async function gmailFetch<T>(
  accessToken: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${GMAIL_API_BASE}/users/me${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new HttpsError("unauthenticated", "Gmail authentication expired");
    }
    const errorText = await response.text();
    throw new HttpsError("internal", `Gmail API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

// ============================================================================
// Main Callable Function
// ============================================================================

/**
 * Search Gmail for messages with attachments
 * Returns enriched results with existing file IDs
 */
export const searchGmailCallable = onCall<
  SearchGmailRequest,
  Promise<SearchGmailResponse>
>(
  {
    region: "europe-west1",
    memory: "512MiB",
    timeoutSeconds: 60,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const userId = request.auth.uid;
    const {
      integrationId,
      query,
      dateFrom,
      dateTo,
      from,
      hasAttachments = true,
      limit = 20,
      pageToken,
      expandThreads = false,
    } = request.data;

    if (!integrationId) {
      throw new HttpsError("invalid-argument", "integrationId is required");
    }

    console.log("[searchGmailCallable] Request", {
      userId,
      integrationId,
      query,
      dateFrom,
      dateTo,
      from,
      hasAttachments,
      limit,
      pageToken,
      expandThreads,
    });

    // Verify integration exists and belongs to user
    const integrationRef = db.collection("emailIntegrations").doc(integrationId);
    const integrationSnap = await integrationRef.get();

    if (!integrationSnap.exists) {
      throw new HttpsError("not-found", "Integration not found");
    }

    const integration = integrationSnap.data()!;
    if (integration.userId !== userId) {
      throw new HttpsError("permission-denied", "Integration not found");
    }

    if (integration.needsReauth) {
      throw new HttpsError("failed-precondition", "Re-authentication required");
    }

    // Get tokens
    const tokenRef = db.collection("emailTokens").doc(integrationId);
    const tokenSnap = await tokenRef.get();

    if (!tokenSnap.exists) {
      throw new HttpsError("failed-precondition", "Tokens not found. Please reconnect Gmail.");
    }

    const tokens = tokenSnap.data() as EmailTokenDocument;

    // Check if token is expired
    if (tokens.expiresAt.toDate() < new Date()) {
      await integrationRef.update({
        needsReauth: true,
        lastError: "Access token expired",
        updatedAt: Timestamp.now(),
      });
      throw new HttpsError("failed-precondition", "Access token expired. Please reconnect Gmail.");
    }

    // Build search query
    const searchQuery = buildGmailSearchQuery({
      query,
      from,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      hasAttachments,
    });

    // Search for message IDs
    const searchParams = new URLSearchParams({
      q: searchQuery,
      maxResults: String(limit),
    });
    if (pageToken) {
      searchParams.set("pageToken", pageToken);
    }

    const searchResult = await gmailFetch<{
      messages?: Array<{ id: string; threadId: string }>;
      nextPageToken?: string;
      resultSizeEstimate?: number;
    }>(tokens.accessToken, `/messages?${searchParams.toString()}`);

    if (!searchResult.messages || searchResult.messages.length === 0) {
      return {
        messages: [],
        nextPageToken: undefined,
        totalEstimate: 0,
      };
    }

    // Fetch full message details
    let messages: GmailApiMessage[];

    if (expandThreads) {
      // Get unique thread IDs and fetch full threads
      const threadIds = [...new Set(searchResult.messages.map((m) => m.threadId))];
      const threadResults = await Promise.all(
        threadIds.map(async (threadId) => {
          const thread = await gmailFetch<{ messages: GmailApiMessage[] }>(
            tokens.accessToken,
            `/threads/${threadId}?format=full`
          );
          return thread.messages;
        })
      );
      messages = threadResults.flat();
    } else {
      messages = await Promise.all(
        searchResult.messages.map((msg) =>
          gmailFetch<GmailApiMessage>(tokens.accessToken, `/messages/${msg.id}?format=full`)
        )
      );
    }

    // Collect all attachment IDs to check for existing imports
    const attachmentKeys: { messageId: string; attachmentId: string }[] = [];
    for (const msg of messages) {
      const attachments = extractAttachments(msg);
      for (const att of attachments) {
        attachmentKeys.push({ messageId: msg.id, attachmentId: att.attachmentId });
      }
    }

    // Query for existing files with these Gmail references
    const existingFilesMap = new Map<string, string>();
    if (attachmentKeys.length > 0) {
      const messageIds = [...new Set(attachmentKeys.map((k) => k.messageId))];
      for (let i = 0; i < messageIds.length; i += 30) {
        const batch = messageIds.slice(i, i + 30);
        const existingQuery = await db
          .collection("files")
          .where("userId", "==", userId)
          .where("gmailMessageId", "in", batch)
          .get();

        for (const doc of existingQuery.docs) {
          const data = doc.data();
          if (data.gmailAttachmentId) {
            const key = `${data.gmailMessageId}:${data.gmailAttachmentId}`;
            existingFilesMap.set(key, doc.id);
          }
        }
      }
    }

    // Transform messages to response format
    const responseMessages: GmailMessageResult[] = messages.map((msg) => {
      const fromHeader = extractHeader(msg, "From");
      const { email: fromEmail, name: fromName } = parseFromHeader(fromHeader);
      const attachments = extractAttachments(msg);

      return {
        messageId: msg.id,
        threadId: msg.threadId,
        subject: extractHeader(msg, "Subject") || "(No Subject)",
        from: fromEmail,
        fromName,
        date: new Date(parseInt(msg.internalDate, 10)).toISOString(),
        snippet: msg.snippet || "",
        bodyText: extractBodyText(msg),
        attachments: attachments.map((att) => {
          const key = `${msg.id}:${att.attachmentId}`;
          return {
            ...att,
            existingFileId: existingFilesMap.get(key) || null,
          };
        }),
      };
    });

    // Update last accessed time
    await integrationRef.update({
      lastAccessedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    console.log("[searchGmailCallable] Response", {
      integrationId,
      messageCount: responseMessages.length,
      totalEstimate: searchResult.resultSizeEstimate,
      existingFilesFound: existingFilesMap.size,
    });

    return {
      messages: responseMessages,
      nextPageToken: searchResult.nextPageToken,
      totalEstimate: searchResult.resultSizeEstimate,
    };
  }
);

// ============================================================================
// Direct Search Function (for automation - same logic, no auth check)
// ============================================================================

export interface SearchGmailDirectParams {
  accessToken: string;
  query?: string;
  hasAttachments?: boolean;
  limit?: number;
}

/**
 * Direct Gmail search for use within Cloud Functions (automation).
 * Uses the EXACT same logic as the callable - single source of truth.
 */
export async function searchGmailDirect(
  params: SearchGmailDirectParams
): Promise<GmailMessageResult[]> {
  const {
    accessToken,
    query,
    hasAttachments = false,
    limit = 20,
  } = params;

  // Build search query - same function as callable
  const searchQuery = buildGmailSearchQuery({
    query,
    hasAttachments,
  });

  // Search for message IDs
  const searchParams = new URLSearchParams({
    q: searchQuery,
    maxResults: String(limit),
  });

  const searchResult = await gmailFetch<{
    messages?: Array<{ id: string; threadId: string }>;
    nextPageToken?: string;
    resultSizeEstimate?: number;
  }>(accessToken, `/messages?${searchParams.toString()}`);

  if (!searchResult.messages || searchResult.messages.length === 0) {
    return [];
  }

  // Fetch full message details - same as callable
  const messages = await Promise.all(
    searchResult.messages.map((msg) =>
      gmailFetch<GmailApiMessage>(accessToken, `/messages/${msg.id}?format=full`)
    )
  );

  // Transform messages - same as callable
  return messages.map((msg) => {
    const fromHeader = extractHeader(msg, "From");
    const { email: fromEmail, name: fromName } = parseFromHeader(fromHeader);

    return {
      messageId: msg.id,
      threadId: msg.threadId,
      subject: extractHeader(msg, "Subject") || "(No Subject)",
      from: fromEmail,
      fromName,
      date: new Date(parseInt(msg.internalDate, 10)).toISOString(),
      snippet: msg.snippet || "",
      bodyText: extractBodyText(msg),
      attachments: extractAttachments(msg),
    };
  });
}

// Re-export types and utilities for consumers
export type { GmailMessageResult, GmailAttachment };
export { buildGmailSearchQuery, isLikelyReceiptAttachment };
