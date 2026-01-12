/**
 * Precision Search Queue Processor
 *
 * Processes precision receipt search requests, running multiple strategies
 * to find and connect receipts to incomplete transactions.
 *
 * Follows the same pattern as gmailSyncQueue.ts:
 * - Queue-based processing with pagination
 * - Timeout handling with continuation
 * - Both scheduled (cron) and immediate (onCreate) processing
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import * as crypto from "crypto";
import {
  generateSearchQueries,
  analyzeEmailForInvoice,
} from "./geminiSearchHelper";
import { convertHtmlToPdf } from "./htmlToPdf";

const db = getFirestore();
const storage = getStorage();

// ============================================================================
// Constants
// ============================================================================

const PROCESSING_TIMEOUT_MS = 240000; // 4 minutes (leave buffer for 5 min timeout)
const TRANSACTIONS_PER_BATCH = 20; // Process 20 transactions per invocation
const REQUEST_DELAY_MS = 200; // Rate limiting for Gmail API

// MIME types for invoices
const INVOICE_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

function buildFilenameQueries(transactionName: string): string[] {
  const tokens = new Set<string>();

  const addMatches = (regex: RegExp) => {
    const matches = transactionName.match(regex);
    if (!matches) return;
    for (const match of matches) {
      const cleaned = match.replace(/[^A-Za-z0-9._-]/g, "");
      if (cleaned.length > 0) {
        tokens.add(cleaned);
      }
    }
  };

  // Invoice-like tokens (e.g., R-2024.014) and long numeric IDs.
  addMatches(/\b[A-Za-z]{0,5}-?\d{3,}(?:[./]\d+)?\b/g);
  addMatches(/\b\d{8,}\b/g);

  return Array.from(tokens).map((token) => `filename:${token}`);
}

function mergeQueries(base: string[], extras: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const query of [...base, ...extras]) {
    const normalized = query.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    merged.push(normalized);
  }
  return merged;
}

// Strategy execution order (used when creating queue items)
export const DEFAULT_STRATEGIES: SearchStrategy[] = [
  "partner_files",
  "amount_files",
  "email_attachment",
  "email_invoice",
];

// ============================================================================
// Types (simplified versions for Cloud Function use)
// ============================================================================

type SearchStrategy =
  | "partner_files"
  | "amount_files"
  | "email_attachment"
  | "email_invoice";

type PrecisionSearchStatus = "pending" | "processing" | "completed" | "failed";

interface PrecisionSearchQueueItem {
  id: string;
  userId: string;
  scope: "all_incomplete" | "single_transaction";
  transactionId?: string;
  triggeredBy: "gmail_sync" | "manual" | "scheduled";
  triggeredByAuthor?: {
    type: string;
    userId: string;
    sessionId?: string;
    toolCallId?: string;
  };
  gmailSyncQueueId?: string;
  status: PrecisionSearchStatus;
  transactionsToProcess: number;
  transactionsProcessed: number;
  transactionsWithMatches: number;
  totalFilesConnected: number;
  lastProcessedTransactionId?: string;
  strategies: SearchStrategy[];
  currentStrategyIndex: number;
  errors: string[];
  retryCount: number;
  maxRetries: number;
  lastError?: string;
  createdAt: Timestamp;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
}

interface Transaction {
  id: string;
  userId: string;
  date: Timestamp;
  amount: number;
  currency: string;
  name: string;
  partner: string | null;
  partnerId: string | null;
  partnerType: "global" | "user" | null;
  isComplete: boolean;
  fileIds?: string[];
}

interface TaxFile {
  id: string;
  userId: string;
  extractedDate?: Timestamp;
  extractedAmount?: number;
  extractedPartner?: string;
  partnerId?: string;
  transactionIds?: string[];
}

interface Partner {
  id: string;
  name: string;
  emailDomains?: string[];
  website?: string;
}

interface EmailIntegration {
  id: string;
  userId: string;
  email: string;
  isActive: boolean;
  needsReauth: boolean;
}

interface EmailTokenDocument {
  accessToken: string;
  refreshToken: string;
  expiresAt: Timestamp;
}

interface GmailMessage {
  id: string;
  threadId: string;
  internalDate: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
    parts?: GmailPart[];
    body?: { attachmentId?: string; size?: number; data?: string };
    mimeType: string;
  };
}

interface GmailPart {
  partId: string;
  mimeType: string;
  filename: string;
  body: { attachmentId?: string; size?: number; data?: string };
  parts?: GmailPart[];
}

interface GmailAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

interface SearchAttempt {
  strategy: SearchStrategy;
  startedAt: Timestamp;
  completedAt?: Timestamp;
  searchParams: Record<string, unknown>;
  candidatesFound: number;
  candidatesEvaluated: number;
  matchesFound: number;
  fileIdsConnected: string[];
  invoiceLinksFound?: string[];
  geminiCalls?: number;
  geminiTokensUsed?: number;
  error?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sha256(data: Buffer): Promise<string> {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function extractHeader(message: GmailMessage, headerName: string): string | null {
  const header = message.payload.headers.find(
    (h) => h.name.toLowerCase() === headerName.toLowerCase()
  );
  return header?.value || null;
}

function extractEmailDomain(email: string): string {
  const atIndex = email.lastIndexOf("@");
  if (atIndex === -1) return email.toLowerCase();
  return email.substring(atIndex + 1).toLowerCase();
}

function extractAttachments(message: GmailMessage): GmailAttachment[] {
  const attachments: GmailAttachment[] = [];

  function processPartsRecursively(parts: GmailPart[] | undefined): void {
    if (!parts) return;

    for (const part of parts) {
      if (
        part.body?.attachmentId &&
        part.filename &&
        INVOICE_MIME_TYPES.includes(part.mimeType)
      ) {
        attachments.push({
          attachmentId: part.body.attachmentId,
          filename: part.filename,
          mimeType: part.mimeType,
          size: part.body.size || 0,
        });
      }
      if (part.parts) {
        processPartsRecursively(part.parts);
      }
    }
  }

  processPartsRecursively(message.payload.parts);
  return attachments;
}

function extractEmailBody(message: GmailMessage): { html?: string; text?: string } {
  let html: string | undefined;
  let text: string | undefined;

  function processPartsRecursively(parts: GmailPart[] | undefined): void {
    if (!parts) return;

    for (const part of parts) {
      if (part.body?.data) {
        const decoded = Buffer.from(
          part.body.data.replace(/-/g, "+").replace(/_/g, "/"),
          "base64"
        ).toString("utf-8");

        if (part.mimeType === "text/html") {
          html = decoded;
        } else if (part.mimeType === "text/plain") {
          text = decoded;
        }
      }
      if (part.parts) {
        processPartsRecursively(part.parts);
      }
    }
  }

  // Check main body first
  if (message.payload.body?.data) {
    const decoded = Buffer.from(
      message.payload.body.data.replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    ).toString("utf-8");

    if (message.payload.mimeType === "text/html") {
      html = decoded;
    } else if (message.payload.mimeType === "text/plain") {
      text = decoded;
    }
  }

  processPartsRecursively(message.payload.parts);

  return { html, text };
}

// ============================================================================
// Gmail API Client
// ============================================================================

class GmailApiClient {
  private accessToken: string;
  private lastRequestTime = 0;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < REQUEST_DELAY_MS) {
      await sleep(REQUEST_DELAY_MS - elapsed + Math.random() * 50);
    }
    this.lastRequestTime = Date.now();
  }

  async searchMessages(
    query: string,
    maxResults = 20
  ): Promise<{ messages: Array<{ id: string }>; nextPageToken?: string }> {
    await this.waitForRateLimit();

    const params = new URLSearchParams({
      q: query,
      maxResults: String(maxResults),
    });

    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
      {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gmail search failed: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return {
      messages: data.messages || [],
      nextPageToken: data.nextPageToken,
    };
  }

  async getMessage(messageId: string): Promise<GmailMessage> {
    await this.waitForRateLimit();

    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
      {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      }
    );

    if (!response.ok) {
      throw new Error(`Gmail get message failed: ${response.status}`);
    }

    return response.json();
  }

  async getAttachment(messageId: string, attachmentId: string): Promise<Buffer> {
    await this.waitForRateLimit();

    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
      {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      }
    );

    if (!response.ok) {
      throw new Error(`Gmail get attachment failed: ${response.status}`);
    }

    const data = await response.json();
    const base64 = data.data.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(base64, "base64");
  }
}

/**
 * Get active Gmail clients for a user
 */
async function getGmailClientsForUser(
  userId: string
): Promise<Array<{ client: GmailApiClient; integration: EmailIntegration }>> {
  const integrationsSnapshot = await db
    .collection("emailIntegrations")
    .where("userId", "==", userId)
    .where("isActive", "==", true)
    .where("needsReauth", "==", false)
    .limit(5)
    .get();

  if (integrationsSnapshot.empty) {
    return [];
  }

  const clients: Array<{ client: GmailApiClient; integration: EmailIntegration }> = [];

  for (const doc of integrationsSnapshot.docs) {
    const integration = { id: doc.id, ...doc.data() } as EmailIntegration;

    // Get token
    const tokenDoc = await db.collection("emailTokens").doc(integration.id).get();
    if (!tokenDoc.exists) continue;

    const tokenData = tokenDoc.data() as EmailTokenDocument;

    // Check if token is expired
    if (tokenData.expiresAt.toDate() < new Date()) {
      // Mark as needing reauth
      await db.collection("emailIntegrations").doc(integration.id).update({
        needsReauth: true,
        lastError: "Access token expired",
        updatedAt: Timestamp.now(),
      });
      continue;
    }

    clients.push({
      client: new GmailApiClient(tokenData.accessToken),
      integration,
    });
  }

  return clients;
}

/**
 * Create a file from email attachment data
 */
async function createFileFromAttachment(
  userId: string,
  attachmentData: Buffer,
  attachment: GmailAttachment,
  message: GmailMessage,
  integrationId: string,
  integrationEmail?: string
): Promise<string | null> {
  const contentHash = await sha256(attachmentData);
  const messageId = message.id;

  // Check for duplicate
  const existingFile = await db
    .collection("files")
    .where("userId", "==", userId)
    .where("contentHash", "==", contentHash)
    .limit(1)
    .get();

  if (!existingFile.empty) {
    console.log(`[PrecisionSearch] Duplicate file skipped: ${attachment.filename}`);
    return null;
  }

  // Extract email metadata
  const from = extractHeader(message, "From") || "";
  const subject = extractHeader(message, "Subject") || "";
  const emailDate = new Date(parseInt(message.internalDate, 10));
  const emailMatch = from.match(/<([^>]+)>/) || [null, from];
  const senderEmail = emailMatch[1] || from;
  const senderDomain = extractEmailDomain(senderEmail);
  const senderName = from.replace(/<[^>]+>/, "").trim().replace(/"/g, "");

  // Upload to Storage
  const timestamp = Date.now();
  const sanitizedFilename = attachment.filename.replace(/[^a-zA-Z0-9.-]/g, "_");
  const storagePath = `files/${userId}/${timestamp}_${sanitizedFilename}`;
  const bucket = storage.bucket();
  const file = bucket.file(storagePath);

  await file.save(attachmentData, {
    metadata: {
      contentType: attachment.mimeType,
      contentDisposition: "inline",
      metadata: {
        originalFilename: attachment.filename,
        gmailMessageId: messageId,
        gmailIntegrationId: integrationId,
      },
    },
  });

  // Get or create download token
  const [fileMetadata] = await file.getMetadata();
  const downloadToken =
    (fileMetadata.metadata as Record<string, string>)?.firebaseStorageDownloadTokens ||
    crypto.randomUUID();

  if (!(fileMetadata.metadata as Record<string, string>)?.firebaseStorageDownloadTokens) {
    await file.setMetadata({
      metadata: { firebaseStorageDownloadTokens: downloadToken },
    });
  }

  // Generate download URL
  let downloadUrl: string;
  const storageEmulatorHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  const encodedPath = encodeURIComponent(storagePath);

  if (storageEmulatorHost) {
    downloadUrl = `http://${storageEmulatorHost}/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${downloadToken}`;
  } else {
    downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${downloadToken}`;
  }

  // Create file document
  const now = Timestamp.now();
  const fileRef = await db.collection("files").add({
    userId,
    fileName: attachment.filename,
    fileType: attachment.mimeType,
    fileSize: attachment.size,
    storagePath,
    downloadUrl,
    contentHash,
    sourceType: "gmail",
    gmailMessageId: messageId,
    gmailIntegrationId: integrationId,
    gmailIntegrationEmail: integrationEmail,
    gmailSubject: subject,
    gmailAttachmentId: attachment.attachmentId,
    gmailSenderEmail: senderEmail,
    gmailSenderDomain: senderDomain,
    gmailSenderName: senderName,
    gmailEmailDate: Timestamp.fromDate(emailDate),
    extractionComplete: false,
    transactionIds: [],
    uploadedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  console.log(`[PrecisionSearch] Created file: ${attachment.filename} (${fileRef.id})`);
  return fileRef.id;
}

/**
 * Create a file from HTML-converted PDF
 */
async function createFileFromHtmlPdf(
  userId: string,
  pdfBuffer: Buffer,
  filename: string,
  message: GmailMessage,
  integrationId: string,
  integrationEmail?: string
): Promise<string | null> {
  const contentHash = await sha256(pdfBuffer);

  // Check for duplicate
  const existingFile = await db
    .collection("files")
    .where("userId", "==", userId)
    .where("contentHash", "==", contentHash)
    .limit(1)
    .get();

  if (!existingFile.empty) {
    console.log(`[PrecisionSearch] Duplicate PDF skipped: ${filename}`);
    return null;
  }

  // Extract email metadata
  const from = extractHeader(message, "From") || "";
  const subject = extractHeader(message, "Subject") || "";
  const emailDate = new Date(parseInt(message.internalDate, 10));
  const emailMatch = from.match(/<([^>]+)>/) || [null, from];
  const senderEmail = emailMatch[1] || from;
  const senderDomain = extractEmailDomain(senderEmail);
  const senderName = from.replace(/<[^>]+>/, "").trim().replace(/"/g, "");

  // Upload to Storage
  const timestamp = Date.now();
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
  const storagePath = `files/${userId}/${timestamp}_${sanitizedFilename}`;
  const bucket = storage.bucket();
  const file = bucket.file(storagePath);

  await file.save(pdfBuffer, {
    metadata: {
      contentType: "application/pdf",
      contentDisposition: "inline",
      metadata: {
        originalFilename: filename,
        gmailMessageId: message.id,
        gmailIntegrationId: integrationId,
        convertedFromHtml: "true",
      },
    },
  });

  // Get or create download token
  const [fileMetadata] = await file.getMetadata();
  const downloadToken =
    (fileMetadata.metadata as Record<string, string>)?.firebaseStorageDownloadTokens ||
    crypto.randomUUID();

  if (!(fileMetadata.metadata as Record<string, string>)?.firebaseStorageDownloadTokens) {
    await file.setMetadata({
      metadata: { firebaseStorageDownloadTokens: downloadToken },
    });
  }

  // Generate download URL
  let downloadUrl: string;
  const storageEmulatorHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  const encodedPath = encodeURIComponent(storagePath);

  if (storageEmulatorHost) {
    downloadUrl = `http://${storageEmulatorHost}/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${downloadToken}`;
  } else {
    downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${downloadToken}`;
  }

  // Create file document
  const now = Timestamp.now();
  const fileRef = await db.collection("files").add({
    userId,
    fileName: filename,
    fileType: "application/pdf",
    fileSize: pdfBuffer.length,
    storagePath,
    downloadUrl,
    contentHash,
    sourceType: "gmail_html_invoice",
    gmailMessageId: message.id,
    gmailIntegrationId: integrationId,
    gmailIntegrationEmail: integrationEmail,
    gmailSubject: subject,
    gmailSenderEmail: senderEmail,
    gmailSenderDomain: senderDomain,
    gmailSenderName: senderName,
    gmailEmailDate: Timestamp.fromDate(emailDate),
    extractionComplete: false,
    transactionIds: [],
    uploadedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  console.log(`[PrecisionSearch] Created HTML-converted PDF: ${filename} (${fileRef.id})`);
  return fileRef.id;
}

// ============================================================================
// Strategy Execution
// ============================================================================

/**
 * Execute Strategy 1: Partner Files Matching
 * Find unassociated files from the same partner and match by amount/date
 */
async function executePartnerFilesStrategy(
  transaction: Transaction,
  userId: string
): Promise<SearchAttempt> {
  const startedAt = Timestamp.now();
  const attempt: SearchAttempt = {
    strategy: "partner_files",
    startedAt,
    searchParams: { partnerId: transaction.partnerId },
    candidatesFound: 0,
    candidatesEvaluated: 0,
    matchesFound: 0,
    fileIdsConnected: [],
  };

  try {
    // Skip if transaction has no partner
    if (!transaction.partnerId) {
      attempt.completedAt = Timestamp.now();
      return attempt;
    }

    // Find unassociated files for this partner
    const filesSnapshot = await db
      .collection("files")
      .where("userId", "==", userId)
      .where("partnerId", "==", transaction.partnerId)
      .where("extractionComplete", "==", true)
      .limit(50)
      .get();

    const unassociatedFiles = filesSnapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }) as TaxFile)
      .filter((f) => !f.transactionIds || f.transactionIds.length === 0);

    attempt.candidatesFound = unassociatedFiles.length;

    if (unassociatedFiles.length === 0) {
      attempt.completedAt = Timestamp.now();
      return attempt;
    }

    // Score files against transaction
    const txAmount = Math.abs(transaction.amount);
    const txDate = transaction.date.toDate();

    for (const file of unassociatedFiles) {
      attempt.candidatesEvaluated++;

      if (file.extractedAmount == null) continue;

      const fileAmount = Math.abs(file.extractedAmount);
      const amountDiff = Math.abs(txAmount - fileAmount) / txAmount;

      // Amount must be within 5%
      if (amountDiff > 0.05) continue;

      // Date must be within 30 days
      if (file.extractedDate) {
        const fileDate = file.extractedDate.toDate();
        const daysDiff = Math.abs(
          (txDate.getTime() - fileDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysDiff > 30) continue;
      }

      // Match found! Connect file to transaction
      await connectFileToTransaction(file.id, transaction.id, userId, "partner_files");
      attempt.fileIdsConnected.push(file.id);
      attempt.matchesFound++;

      // For partner files strategy, usually one match per transaction is enough
      break;
    }

    attempt.completedAt = Timestamp.now();
    return attempt;
  } catch (error) {
    attempt.error = error instanceof Error ? error.message : "Unknown error";
    attempt.completedAt = Timestamp.now();
    return attempt;
  }
}

/**
 * Execute Strategy 2: Amount Files Matching
 * Search all unassociated files by amount/date range
 */
async function executeAmountFilesStrategy(
  transaction: Transaction,
  userId: string
): Promise<SearchAttempt> {
  const startedAt = Timestamp.now();
  const attempt: SearchAttempt = {
    strategy: "amount_files",
    startedAt,
    searchParams: {
      amount: transaction.amount,
      dateRange: {
        from: transaction.date.toDate().toISOString(),
        to: transaction.date.toDate().toISOString(),
      },
    },
    candidatesFound: 0,
    candidatesEvaluated: 0,
    matchesFound: 0,
    fileIdsConnected: [],
  };

  try {
    const txAmount = Math.abs(transaction.amount);
    const tolerance = txAmount * 0.05; // 5% tolerance

    // Calculate date range (±30 days)
    const txDate = transaction.date.toDate();
    const dateFrom = new Date(txDate);
    dateFrom.setDate(dateFrom.getDate() - 30);
    const dateTo = new Date(txDate);
    dateTo.setDate(dateTo.getDate() + 30);

    // Query files in date range
    const filesSnapshot = await db
      .collection("files")
      .where("userId", "==", userId)
      .where("extractionComplete", "==", true)
      .where("extractedDate", ">=", Timestamp.fromDate(dateFrom))
      .where("extractedDate", "<=", Timestamp.fromDate(dateTo))
      .limit(100)
      .get();

    // Filter to unassociated files with matching amount
    const candidates = filesSnapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }) as TaxFile)
      .filter((f) => {
        if (f.transactionIds && f.transactionIds.length > 0) return false;
        if (f.extractedAmount == null) return false;
        const fileAmount = Math.abs(f.extractedAmount);
        return Math.abs(fileAmount - txAmount) <= tolerance;
      });

    attempt.candidatesFound = candidates.length;

    if (candidates.length === 0) {
      attempt.completedAt = Timestamp.now();
      return attempt;
    }

    // Score and match (for now, simple closest amount match)
    candidates.sort((a, b) => {
      const aDiff = Math.abs(Math.abs(a.extractedAmount!) - txAmount);
      const bDiff = Math.abs(Math.abs(b.extractedAmount!) - txAmount);
      return aDiff - bDiff;
    });

    attempt.candidatesEvaluated = Math.min(5, candidates.length);

    // Take the best match
    const bestMatch = candidates[0];
    await connectFileToTransaction(bestMatch.id, transaction.id, userId, "amount_files");
    attempt.fileIdsConnected.push(bestMatch.id);
    attempt.matchesFound++;

    attempt.completedAt = Timestamp.now();
    return attempt;
  } catch (error) {
    attempt.error = error instanceof Error ? error.message : "Unknown error";
    attempt.completedAt = Timestamp.now();
    return attempt;
  }
}

/**
 * Execute Strategy 3: Email Attachment Search
 * Search Gmail for attachments that could match using Gemini-generated queries
 */
async function executeEmailAttachmentStrategy(
  transaction: Transaction,
  userId: string
): Promise<SearchAttempt> {
  const startedAt = Timestamp.now();
  const attempt: SearchAttempt = {
    strategy: "email_attachment",
    startedAt,
    searchParams: { transactionName: transaction.name },
    candidatesFound: 0,
    candidatesEvaluated: 0,
    matchesFound: 0,
    fileIdsConnected: [],
    geminiCalls: 0,
    geminiTokensUsed: 0,
  };

  try {
    // Get Gmail clients
    const clients = await getGmailClientsForUser(userId);
    if (clients.length === 0) {
      attempt.completedAt = Timestamp.now();
      return attempt;
    }

    // Get partner info if available
    let partnerInfo: { name: string; emailDomains?: string[]; website?: string } | undefined;
    if (transaction.partnerId) {
      const partnerDoc = await db
        .collection(transaction.partnerType === "global" ? "globalPartners" : "partners")
        .doc(transaction.partnerId)
        .get();
      if (partnerDoc.exists) {
        const data = partnerDoc.data() as Partner;
        partnerInfo = {
          name: data.name,
          emailDomains: data.emailDomains,
          website: data.website,
        };
      }
    }

    // Generate search queries using Gemini
    const queryResult = await generateSearchQueries(
      {
        name: transaction.name,
        partner: transaction.partner,
        amount: transaction.amount,
        date: transaction.date.toDate(),
      },
      partnerInfo
    );

    attempt.geminiCalls = (attempt.geminiCalls || 0) + 1;
    attempt.geminiTokensUsed =
      (attempt.geminiTokensUsed || 0) + queryResult.usage.inputTokens + queryResult.usage.outputTokens;

    const filenameQueries = buildFilenameQueries(transaction.name);
    const queries = mergeQueries(queryResult.queries, filenameQueries);

    if (queries.length === 0) {
      attempt.completedAt = Timestamp.now();
      return attempt;
    }

    attempt.searchParams = {
      ...attempt.searchParams,
      queries,
      queryReasoning: queryResult.reasoning,
    };

    // Search each Gmail account with each query
    const processedMessageIds = new Set<string>();

    for (const { client, integration } of clients) {
      for (const query of queries) {
        try {
          // Add has:attachment to the query if not present
          const fullQuery = query.includes("has:attachment")
            ? query
            : `${query} has:attachment`;

          const searchResult = await client.searchMessages(fullQuery, 10);
          attempt.candidatesFound += searchResult.messages.length;

          for (const { id: messageId } of searchResult.messages) {
            // Skip already processed messages
            if (processedMessageIds.has(messageId)) continue;
            processedMessageIds.add(messageId);

            attempt.candidatesEvaluated++;

            try {
              const message = await client.getMessage(messageId);
              const attachments = extractAttachments(message);

              if (attachments.length === 0) continue;

              // Process each attachment
              for (const attachment of attachments) {
                // Check if we already have this attachment
                const existingFile = await db
                  .collection("files")
                  .where("userId", "==", userId)
                  .where("gmailMessageId", "==", messageId)
                  .where("gmailAttachmentId", "==", attachment.attachmentId)
                  .limit(1)
                  .get();

                if (!existingFile.empty) continue;

                // Download and create file
                const attachmentData = await client.getAttachment(messageId, attachment.attachmentId);
                const fileId = await createFileFromAttachment(
                  userId,
                  attachmentData,
                  attachment,
                  message,
                  integration.id,
                  integration.email
                );

                if (fileId) {
                  // Connect to transaction
                  await connectFileToTransaction(fileId, transaction.id, userId, "email_attachment");
                  attempt.fileIdsConnected.push(fileId);
                  attempt.matchesFound++;

                  // Usually one match per transaction is enough
                  attempt.completedAt = Timestamp.now();
                  return attempt;
                }
              }
            } catch (msgError) {
              console.error(`[PrecisionSearch] Error processing message ${messageId}:`, msgError);
            }
          }
        } catch (searchError) {
          console.error(`[PrecisionSearch] Error searching with query "${query}":`, searchError);
        }
      }
    }

    attempt.completedAt = Timestamp.now();
    return attempt;
  } catch (error) {
    attempt.error = error instanceof Error ? error.message : "Unknown error";
    attempt.completedAt = Timestamp.now();
    return attempt;
  }
}

/**
 * Execute Strategy 4: Email Invoice Parsing
 * Parse email content for invoice links or HTML invoices
 */
async function executeEmailInvoiceStrategy(
  transaction: Transaction,
  userId: string
): Promise<SearchAttempt> {
  const startedAt = Timestamp.now();
  const attempt: SearchAttempt = {
    strategy: "email_invoice",
    startedAt,
    searchParams: { transactionName: transaction.name, partnerId: transaction.partnerId },
    candidatesFound: 0,
    candidatesEvaluated: 0,
    matchesFound: 0,
    fileIdsConnected: [],
    invoiceLinksFound: [],
    geminiCalls: 0,
    geminiTokensUsed: 0,
  };

  try {
    // Get Gmail clients
    const clients = await getGmailClientsForUser(userId);
    if (clients.length === 0) {
      attempt.completedAt = Timestamp.now();
      return attempt;
    }

    // Get partner info if available
    let partnerInfo: { name: string; emailDomains?: string[]; website?: string } | undefined;
    let partnerId = transaction.partnerId;
    let partnerType = transaction.partnerType;

    if (partnerId) {
      const partnerDoc = await db
        .collection(partnerType === "global" ? "globalPartners" : "partners")
        .doc(partnerId)
        .get();
      if (partnerDoc.exists) {
        const data = partnerDoc.data() as Partner;
        partnerInfo = {
          name: data.name,
          emailDomains: data.emailDomains,
          website: data.website,
        };
      }
    }

    // Generate search queries using Gemini
    const queryResult = await generateSearchQueries(
      {
        name: transaction.name,
        partner: transaction.partner,
        amount: transaction.amount,
        date: transaction.date.toDate(),
      },
      partnerInfo
    );

    attempt.geminiCalls = (attempt.geminiCalls || 0) + 1;
    attempt.geminiTokensUsed =
      (attempt.geminiTokensUsed || 0) + queryResult.usage.inputTokens + queryResult.usage.outputTokens;

    const filenameQueries = buildFilenameQueries(transaction.name);
    const queries = mergeQueries(queryResult.queries, filenameQueries);

    if (queries.length === 0) {
      attempt.completedAt = Timestamp.now();
      return attempt;
    }

    attempt.searchParams = {
      ...attempt.searchParams,
      queries,
      queryReasoning: queryResult.reasoning,
    };

    // Search each Gmail account with each query (exclude attachment requirement)
    const processedMessageIds = new Set<string>();

    for (const { client, integration } of clients) {
      for (const query of queries) {
        try {
          // Remove has:attachment if present, we want emails without attachments too
          const cleanQuery = query.replace(/has:attachment/gi, "").trim();

          const searchResult = await client.searchMessages(cleanQuery, 10);
          attempt.candidatesFound += searchResult.messages.length;

          for (const { id: messageId } of searchResult.messages) {
            if (processedMessageIds.has(messageId)) continue;
            processedMessageIds.add(messageId);

            attempt.candidatesEvaluated++;

            try {
              const message = await client.getMessage(messageId);
              const from = extractHeader(message, "From") || "";
              const subject = extractHeader(message, "Subject") || "";
              const { html, text } = extractEmailBody(message);

              // Analyze email content with Gemini
              const analysis = await analyzeEmailForInvoice(
                { subject, from, htmlBody: html, textBody: text },
                {
                  name: transaction.name,
                  partner: transaction.partner,
                  amount: transaction.amount,
                }
              );

              attempt.geminiCalls = (attempt.geminiCalls || 0) + 1;
              attempt.geminiTokensUsed =
                (attempt.geminiTokensUsed || 0) + analysis.usage.inputTokens + analysis.usage.outputTokens;

              // Handle invoice links - store on partner
              if (analysis.hasInvoiceLink && analysis.invoiceLinks.length > 0 && partnerId) {
                const now = Timestamp.now();
                for (const link of analysis.invoiceLinks) {
                  attempt.invoiceLinksFound?.push(link.url);

                  // Add invoice link to partner
                  await db
                    .collection(partnerType === "global" ? "globalPartners" : "partners")
                    .doc(partnerId)
                    .update({
                      invoiceLinks: FieldValue.arrayUnion({
                        url: link.url,
                        anchorText: link.anchorText,
                        emailMessageId: messageId,
                        emailSubject: subject,
                        discoveredAt: now,
                      }),
                      invoiceLinksUpdatedAt: now,
                      updatedAt: now,
                    });
                }

                console.log(
                  `[PrecisionSearch] Found ${analysis.invoiceLinks.length} invoice links for partner ${partnerId}`
                );
              }

              // Handle mail invoice (email itself is the invoice)
              if (analysis.isMailInvoice && analysis.mailInvoiceConfidence >= 0.7 && html) {
                // Check if we already converted this email
                const existingFile = await db
                  .collection("files")
                  .where("userId", "==", userId)
                  .where("gmailMessageId", "==", messageId)
                  .where("sourceType", "==", "gmail_html_invoice")
                  .limit(1)
                  .get();

                if (existingFile.empty) {
                  // Convert HTML to PDF
                  const emailDate = new Date(parseInt(message.internalDate, 10));
                  const pdfResult = await convertHtmlToPdf(html, {
                    subject,
                    from,
                    date: emailDate,
                  });

                  // Create filename from subject
                  const sanitizedSubject = subject
                    .replace(/[^a-zA-Z0-9\s]/g, "")
                    .trim()
                    .substring(0, 50);
                  const filename = `${sanitizedSubject || "invoice"}_${emailDate.toISOString().split("T")[0]}.pdf`;

                  const fileId = await createFileFromHtmlPdf(
                    userId,
                    pdfResult.pdfBuffer,
                    filename,
                    message,
                    integration.id,
                    integration.email
                  );

                  if (fileId) {
                    // Connect to transaction
                    await connectFileToTransaction(fileId, transaction.id, userId, "email_invoice");
                    attempt.fileIdsConnected.push(fileId);
                    attempt.matchesFound++;

                    console.log(`[PrecisionSearch] Created PDF from mail invoice: ${filename}`);

                    // Found a match, return
                    attempt.completedAt = Timestamp.now();
                    return attempt;
                  }
                }
              }
            } catch (msgError) {
              console.error(`[PrecisionSearch] Error processing message ${messageId}:`, msgError);
            }
          }
        } catch (searchError) {
          console.error(`[PrecisionSearch] Error searching with query "${query}":`, searchError);
        }
      }
    }

    attempt.completedAt = Timestamp.now();
    return attempt;
  } catch (error) {
    attempt.error = error instanceof Error ? error.message : "Unknown error";
    attempt.completedAt = Timestamp.now();
    return attempt;
  }
}

/**
 * Execute a single strategy for a transaction
 */
async function executeStrategy(
  strategy: SearchStrategy,
  transaction: Transaction,
  userId: string
): Promise<SearchAttempt> {
  switch (strategy) {
    case "partner_files":
      return executePartnerFilesStrategy(transaction, userId);
    case "amount_files":
      return executeAmountFilesStrategy(transaction, userId);
    case "email_attachment":
      return executeEmailAttachmentStrategy(transaction, userId);
    case "email_invoice":
      return executeEmailInvoiceStrategy(transaction, userId);
    default:
      throw new Error(`Unknown strategy: ${strategy}`);
  }
}

/**
 * Connect a file to a transaction
 */
async function connectFileToTransaction(
  fileId: string,
  transactionId: string,
  userId: string,
  automationSource: SearchStrategy
): Promise<void> {
  const now = Timestamp.now();
  const batch = db.batch();

  // Update file
  const fileRef = db.collection("files").doc(fileId);
  batch.update(fileRef, {
    transactionIds: FieldValue.arrayUnion(transactionId),
    updatedAt: now,
  });

  // Update transaction
  const txRef = db.collection("transactions").doc(transactionId);
  batch.update(txRef, {
    fileIds: FieldValue.arrayUnion(fileId),
    fileAutomationSource: automationSource,
    isComplete: true,
    updatedAt: now,
  });

  await batch.commit();

  console.log(
    `[PrecisionSearch] Connected file ${fileId} to tx ${transactionId} via ${automationSource}`
  );
}

/**
 * Create or update transaction search entry
 */
async function logSearchAttempt(
  transactionId: string,
  queueId: string,
  triggeredBy: string,
  attempt: SearchAttempt
): Promise<void> {
  const searchesRef = db
    .collection("transactions")
    .doc(transactionId)
    .collection("searches");

  // Check if there's an existing search entry for this queue
  const existingSearch = await searchesRef
    .where("precisionSearchQueueId", "==", queueId)
    .limit(1)
    .get();

  if (existingSearch.empty) {
    // Create new search entry
    await searchesRef.add({
      triggeredBy,
      precisionSearchQueueId: queueId,
      status: "processing",
      strategiesAttempted: [attempt.strategy],
      attempts: [attempt],
      totalFilesConnected: attempt.fileIdsConnected.length,
      automationSource: attempt.fileIdsConnected.length > 0 ? attempt.strategy : null,
      totalGeminiCalls: attempt.geminiCalls || 0,
      totalGeminiTokens: attempt.geminiTokensUsed || 0,
      createdAt: Timestamp.now(),
      startedAt: attempt.startedAt,
    });
  } else {
    // Update existing search entry
    const searchDoc = existingSearch.docs[0];
    const data = searchDoc.data();
    const existingAttempts = data.attempts || [];
    const existingStrategies = data.strategiesAttempted || [];

    await searchDoc.ref.update({
      strategiesAttempted: existingStrategies.includes(attempt.strategy)
        ? existingStrategies
        : [...existingStrategies, attempt.strategy],
      attempts: [...existingAttempts, attempt],
      totalFilesConnected: (data.totalFilesConnected || 0) + attempt.fileIdsConnected.length,
      automationSource:
        attempt.fileIdsConnected.length > 0
          ? attempt.strategy
          : data.automationSource,
      totalGeminiCalls: (data.totalGeminiCalls || 0) + (attempt.geminiCalls || 0),
      totalGeminiTokens: (data.totalGeminiTokens || 0) + (attempt.geminiTokensUsed || 0),
    });
  }
}

// ============================================================================
// Queue Processor
// ============================================================================

async function processQueueItem(queueItem: PrecisionSearchQueueItem): Promise<void> {
  const startTime = Date.now();
  console.log(
    `[PrecisionSearch] Processing queue ${queueItem.id} (${queueItem.scope}, ${queueItem.triggeredBy})`
  );

  let transactionsProcessed = queueItem.transactionsProcessed;
  let transactionsWithMatches = queueItem.transactionsWithMatches;
  let totalFilesConnected = queueItem.totalFilesConnected;
  const errors: string[] = [...queueItem.errors];
  let lastProcessedTransactionId = queueItem.lastProcessedTransactionId;
  let timedOut = false;

  try {
    // Get transactions to process
    let transactionsQuery;

    if (queueItem.scope === "single_transaction" && queueItem.transactionId) {
      // Single transaction
      const txDoc = await db
        .collection("transactions")
        .doc(queueItem.transactionId)
        .get();

      if (!txDoc.exists || txDoc.data()?.userId !== queueItem.userId) {
        throw new Error("Transaction not found or access denied");
      }

      const transactions = [{ id: txDoc.id, ...txDoc.data() } as Transaction];
      await processTransactionBatch(transactions);
    } else {
      // All incomplete transactions
      transactionsQuery = db
        .collection("transactions")
        .where("userId", "==", queueItem.userId)
        .where("isComplete", "==", false)
        .orderBy("date", "desc")
        .limit(TRANSACTIONS_PER_BATCH);

      if (lastProcessedTransactionId) {
        // Cursor-based pagination - get document and start after
        const lastDoc = await db
          .collection("transactions")
          .doc(lastProcessedTransactionId)
          .get();
        if (lastDoc.exists) {
          transactionsQuery = transactionsQuery.startAfter(lastDoc);
        }
      }

      const snapshot = await transactionsQuery.get();
      const transactions = snapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() }) as Transaction
      );

      if (transactions.length === 0) {
        // No more transactions to process
        await completeQueueItem();
        return;
      }

      await processTransactionBatch(transactions);
    }

    // Check if we need to continue or are done
    if (queueItem.scope === "single_transaction" || timedOut) {
      if (timedOut) {
        await createContinuation();
      } else {
        await completeQueueItem();
      }
    } else {
      // Check if there are more transactions
      const remainingCount = queueItem.transactionsToProcess - transactionsProcessed;
      if (remainingCount > 0 && lastProcessedTransactionId) {
        // More to process - create continuation
        await createContinuation();
      } else {
        await completeQueueItem();
      }
    }
  } catch (error) {
    console.error(`[PrecisionSearch] Error processing queue:`, error);
    await handleError(error);
  }

  // ========== Helper functions ==========

  async function processTransactionBatch(transactions: Transaction[]): Promise<void> {
    for (const tx of transactions) {
      // Check timeout
      if (Date.now() - startTime > PROCESSING_TIMEOUT_MS) {
        console.log("[PrecisionSearch] Approaching timeout, saving progress");
        timedOut = true;
        break;
      }

      try {
        let foundMatch = false;

        // Run strategies in order until one finds a match
        for (const strategy of queueItem.strategies) {
          // Skip if transaction already completed
          if (tx.isComplete) break;

          const attempt = await executeStrategy(strategy, tx, queueItem.userId);

          // Log the attempt
          await logSearchAttempt(tx.id, queueItem.id, queueItem.triggeredBy, attempt);

          if (attempt.fileIdsConnected.length > 0) {
            foundMatch = true;
            totalFilesConnected += attempt.fileIdsConnected.length;
            break; // Stop after first successful strategy
          }

          if (attempt.error) {
            errors.push(`${tx.id}/${strategy}: ${attempt.error}`);
          }
        }

        if (foundMatch) {
          transactionsWithMatches++;
        }

        transactionsProcessed++;
        lastProcessedTransactionId = tx.id;

        // Small delay between transactions to avoid overwhelming Firestore
        await sleep(50);
      } catch (txError) {
        const errorMsg = `Failed to process tx ${tx.id}: ${txError}`;
        console.error(`[PrecisionSearch] ${errorMsg}`);
        errors.push(errorMsg);
        transactionsProcessed++;
        lastProcessedTransactionId = tx.id;
      }
    }
  }

  async function createContinuation(): Promise<void> {
    // For manual/gmail_sync, create new queue item (triggers immediate processing)
    // For scheduled, just update and let cron handle it
    if (queueItem.triggeredBy === "scheduled") {
      await db.collection("precisionSearchQueue").doc(queueItem.id).update({
        status: "pending",
        startedAt: null,
        transactionsProcessed,
        transactionsWithMatches,
        totalFilesConnected,
        lastProcessedTransactionId,
        errors,
      });
      console.log(`[PrecisionSearch] Saved progress (${transactionsProcessed} processed), cron will continue`);
    } else {
      // Delete old and create new to trigger onDocumentCreated
      const continuationData = {
        userId: queueItem.userId,
        scope: queueItem.scope,
        transactionId: queueItem.transactionId,
        triggeredBy: queueItem.triggeredBy,
        triggeredByAuthor: queueItem.triggeredByAuthor,
        gmailSyncQueueId: queueItem.gmailSyncQueueId,
        status: "pending" as const,
        transactionsToProcess: queueItem.transactionsToProcess,
        transactionsProcessed,
        transactionsWithMatches,
        totalFilesConnected,
        lastProcessedTransactionId,
        strategies: queueItem.strategies,
        currentStrategyIndex: 0,
        errors,
        retryCount: 0,
        maxRetries: queueItem.maxRetries,
        createdAt: Timestamp.now(),
      };

      await db.collection("precisionSearchQueue").doc(queueItem.id).delete();
      await db.collection("precisionSearchQueue").add(continuationData);
      console.log(`[PrecisionSearch] Created continuation (${transactionsProcessed} processed)`);
    }
  }

  async function completeQueueItem(): Promise<void> {
    const completedAt = Timestamp.now();

    await db.collection("precisionSearchQueue").doc(queueItem.id).update({
      status: "completed",
      transactionsProcessed,
      transactionsWithMatches,
      totalFilesConnected,
      lastProcessedTransactionId,
      errors,
      completedAt,
    });

    console.log(
      `[PrecisionSearch] Completed: ${totalFilesConnected} files connected, ` +
        `${transactionsWithMatches}/${transactionsProcessed} transactions matched`
    );
  }

  async function handleError(error: unknown): Promise<void> {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";

    if (queueItem.retryCount < queueItem.maxRetries) {
      if (queueItem.triggeredBy === "scheduled") {
        await db.collection("precisionSearchQueue").doc(queueItem.id).update({
          status: "pending",
          retryCount: queueItem.retryCount + 1,
          lastError: errorMsg,
          transactionsProcessed,
          transactionsWithMatches,
          totalFilesConnected,
          lastProcessedTransactionId,
          errors,
        });
      } else {
        // Create retry queue item
        const retryData = {
          userId: queueItem.userId,
          scope: queueItem.scope,
          transactionId: queueItem.transactionId,
          triggeredBy: queueItem.triggeredBy,
          triggeredByAuthor: queueItem.triggeredByAuthor,
          gmailSyncQueueId: queueItem.gmailSyncQueueId,
          status: "pending" as const,
          transactionsToProcess: queueItem.transactionsToProcess,
          transactionsProcessed,
          transactionsWithMatches,
          totalFilesConnected,
          lastProcessedTransactionId,
          strategies: queueItem.strategies,
          currentStrategyIndex: queueItem.currentStrategyIndex,
          errors,
          retryCount: queueItem.retryCount + 1,
          maxRetries: queueItem.maxRetries,
          lastError: errorMsg,
          createdAt: Timestamp.now(),
        };
        await db.collection("precisionSearchQueue").doc(queueItem.id).delete();
        await db.collection("precisionSearchQueue").add(retryData);
        console.log(`[PrecisionSearch] Created retry (attempt ${queueItem.retryCount + 1})`);
      }
    } else {
      await db.collection("precisionSearchQueue").doc(queueItem.id).update({
        status: "failed",
        lastError: errorMsg,
        transactionsProcessed,
        transactionsWithMatches,
        totalFilesConnected,
        errors,
        completedAt: Timestamp.now(),
      });
    }
  }
}

// ============================================================================
// Cloud Functions
// ============================================================================

/**
 * Process precision search queue every 5 minutes.
 */
export const processPrecisionSearchQueue = onSchedule(
  {
    schedule: "*/5 * * * *",
    timeZone: "Europe/Vienna",
    region: "europe-west1",
    memory: "1GiB",
    timeoutSeconds: 300,
  },
  async () => {
    console.log("[PrecisionSearch] Starting queue processor...");

    // Get oldest pending queue item
    const pendingSnapshot = await db
      .collection("precisionSearchQueue")
      .where("status", "==", "pending")
      .orderBy("createdAt", "asc")
      .limit(1)
      .get();

    if (pendingSnapshot.empty) {
      console.log("[PrecisionSearch] No pending queue items");
      return;
    }

    const queueDoc = pendingSnapshot.docs[0];
    const queueItem = {
      id: queueDoc.id,
      ...queueDoc.data(),
    } as PrecisionSearchQueueItem;

    // Mark as processing
    await queueDoc.ref.update({
      status: "processing",
      startedAt: Timestamp.now(),
    });

    try {
      await processQueueItem(queueItem);
    } catch (error) {
      console.error("[PrecisionSearch] Queue processor error:", error);
    }
  }
);

/**
 * Immediately start processing when a queue item is created.
 * This provides faster feedback for manual triggers.
 */
export const onPrecisionSearchQueueCreated = onDocumentCreated(
  {
    document: "precisionSearchQueue/{queueId}",
    region: "europe-west1",
    memory: "1GiB",
    timeoutSeconds: 300,
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    // Process manual and gmail_sync triggers immediately (scheduled waits for cron)
    if (data.triggeredBy === "scheduled") {
      console.log("[PrecisionSearch] Scheduled search, will be processed by cron");
      return;
    }

    const queueItem = {
      id: event.params.queueId,
      ...data,
    } as PrecisionSearchQueueItem;

    // Mark as processing
    await event.data?.ref.update({
      status: "processing",
      startedAt: Timestamp.now(),
    });

    try {
      await processQueueItem(queueItem);
    } catch (error) {
      console.error("[PrecisionSearch] Immediate processing error:", error);

      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const retryCount = queueItem.retryCount || 0;
      const maxRetries = queueItem.maxRetries || 3;

      if (retryCount < maxRetries) {
        await event.data?.ref.update({
          status: "pending",
          retryCount: retryCount + 1,
          lastError: errorMessage,
        });
        console.log(`[PrecisionSearch] Marked for retry (${retryCount + 1}/${maxRetries})`);
      } else {
        await event.data?.ref.update({
          status: "failed",
          lastError: errorMessage,
          completedAt: Timestamp.now(),
        });
        console.log("[PrecisionSearch] Max retries exceeded, marked as failed");
      }
    }
  }
);
