export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { getAdminDb, getAdminBucket, getFirebaseStorageDownloadUrl } from "@/lib/firebase/admin";
export const dynamic = "force-dynamic";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
export const dynamic = "force-dynamic";
import { getServerUserIdWithFallback } from "@/lib/auth/get-server-user";
export const dynamic = "force-dynamic";
import { createHash, randomUUID } from "crypto";
export const dynamic = "force-dynamic";
import puppeteer, { Browser } from "puppeteer";

// Singleton browser instance for performance - reused across requests
let browserInstance: Browser | null = null;
let browserLaunchPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }

  // Prevent multiple simultaneous launches
  if (browserLaunchPromise) {
    return browserLaunchPromise;
  }

  browserLaunchPromise = puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  browserInstance = await browserLaunchPromise;
  browserLaunchPromise = null;

  // Handle browser disconnect
  browserInstance.on('disconnected', () => {
    browserInstance = null;
  });

  return browserInstance;
}

const db = getAdminDb();

const INTEGRATIONS_COLLECTION = "emailIntegrations";
const TOKENS_COLLECTION = "emailTokens";
const FILES_COLLECTION = "files";
const TRANSACTIONS_COLLECTION = "transactions";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1";

function parseFromHeader(fromValue?: string | null): { email?: string; name?: string } {
  if (!fromValue) return {};
  const match = fromValue.match(/(?:"?([^"]*)"?\s)?<?([^<>@\s]+@[^<>]+\.[^<>]+)>?/);
  if (!match) return {};
  const name = match[1]?.trim();
  const email = match[2]?.trim();
  return { email, name };
}

function extractDomain(email?: string | null): string | null {
  if (!email) return null;
  const match = email.toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})/i);
  return match ? match[1] : null;
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

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate: string;
  payload?: GmailMessagePart;
}

/**
 * POST /api/gmail/convert-to-pdf
 * Convert email HTML to PDF and save as a file
 *
 * Body: {
 *   integrationId: string;
 *   messageId: string;
 *   transactionId?: string;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserIdWithFallback(request);
    const body = await request.json();
    const {
      integrationId,
      messageId,
      transactionId,
      searchPattern,
      gmailMessageFrom,
      gmailMessageFromName,
    } = body;

    if (!integrationId || !messageId) {
      return NextResponse.json(
        { error: "integrationId and messageId are required" },
        { status: 400 }
      );
    }

    // Verify integration
    const integrationRef = db.collection(INTEGRATIONS_COLLECTION).doc(integrationId);
    const integrationSnap = await integrationRef.get();

    if (!integrationSnap.exists) {
      return NextResponse.json(
        { error: "Integration not found" },
        { status: 404 }
      );
    }

    const integration = integrationSnap.data()!;
    if (integration.userId !== userId) {
      return NextResponse.json(
        { error: "Integration not found" },
        { status: 404 }
      );
    }

    if (integration.needsReauth) {
      return NextResponse.json(
        { error: "Re-authentication required", code: "REAUTH_REQUIRED" },
        { status: 403 }
      );
    }

    // Get tokens
    const tokenSnap = await db.collection(TOKENS_COLLECTION).doc(integrationId).get();
    if (!tokenSnap.exists) {
      return NextResponse.json(
        { error: "Tokens not found. Please reconnect Gmail.", code: "TOKENS_MISSING" },
        { status: 403 }
      );
    }

    const tokens = tokenSnap.data()!;

    // Check token expiry
    if (tokens.expiresAt.toDate() < new Date()) {
      await integrationRef.update({
        needsReauth: true,
        lastError: "Access token expired",
        updatedAt: Timestamp.now(),
      });
      return NextResponse.json(
        { error: "Token expired", code: "TOKEN_EXPIRED" },
        { status: 403 }
      );
    }

    // Fetch the message
    const messageResponse = await fetch(
      `${GMAIL_API_BASE}/users/me/messages/${messageId}?format=full`,
      {
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!messageResponse.ok) {
      if (messageResponse.status === 401) {
        return NextResponse.json(
          { error: "Authentication expired", code: "AUTH_EXPIRED" },
          { status: 403 }
        );
      }
      throw new Error(`Gmail API error: ${messageResponse.status}`);
    }

    const message: GmailMessage = await messageResponse.json();

    // Extract email content
    const headers = message.payload?.headers || [];
    const getHeader = (name: string): string => {
      const header = headers.find(
        (h) => h.name.toLowerCase() === name.toLowerCase()
      );
      return header?.value || "";
    };

    const subject = getHeader("Subject");
    const from = getHeader("From");
    const dateStr = getHeader("Date");
    const emailDate = new Date(dateStr);
    const parsedFrom = parseFromHeader(gmailMessageFrom || from);
    const senderEmail = parsedFrom.email;
    const senderName = gmailMessageFromName || parsedFrom.name;
    const senderDomain = extractDomain(senderEmail);

    // Extract body content
    const { htmlBody, textBody } = extractBodyContent(message.payload);

    // Convert to PDF
    const html = htmlBody || textBody || message.snippet || "";
    const pdfResult = await convertHtmlToPdf(html, {
      subject,
      from,
      date: emailDate,
    });

    // Calculate file hash for deduplication
    const fileHash = createHash("sha256").update(pdfResult.pdfBuffer).digest("hex");

    // Generate filename from subject
    const sanitizedSubject = (subject || "email")
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .replace(/\s+/g, "_")
      .substring(0, 50);
    const timestamp = Date.now();
    const filename = `${sanitizedSubject}_${timestamp}.pdf`;

    // Upload to Firebase Storage using Admin SDK
    const storagePath = `files/${userId}/${filename}`;
    const bucket = getAdminBucket();
    const file = bucket.file(storagePath);

    // Generate a download token (same as client SDK's getDownloadURL)
    const downloadToken = randomUUID();

    await file.save(pdfResult.pdfBuffer, {
      metadata: {
        contentType: "application/pdf",
        contentDisposition: "inline",
        metadata: {
          originalName: filename,
          gmailMessageId: messageId,
          gmailIntegrationId: integrationId,
          convertedFromEmail: "true",
          firebaseStorageDownloadTokens: downloadToken,
        },
      },
    });

    // Construct Firebase Storage download URL (permanent, like client SDK's getDownloadURL)
    const downloadUrl = getFirebaseStorageDownloadUrl(bucket.name, storagePath, downloadToken);

    // Create file document
    const now = Timestamp.now();
    const fileData = {
      userId,
      fileName: filename,
      fileType: "application/pdf",
      fileSize: pdfResult.pdfBuffer.length,
      storagePath,
      downloadUrl,
      fileHash,
      uploadedAt: now,
      createdAt: now,
      updatedAt: now,
      // Gmail-specific fields
      sourceType: "gmail_html_invoice" as const,
      sourceSearchPattern: searchPattern || null,
      sourceResultType: "gmail_html_invoice",
      gmailMessageId: messageId,
      gmailThreadId: message.threadId,
      gmailIntegrationId: integrationId,
      gmailIntegrationEmail: integration.email || null,
      gmailSubject: subject || null,
      gmailSenderEmail: senderEmail || null,
      gmailSenderName: senderName || null,
      gmailSenderDomain: senderDomain || null,
      // Extraction will happen via Cloud Function trigger
      extractionComplete: false,
      transactionIds: transactionId ? [transactionId] : [],
    };

    const fileRef = await db.collection(FILES_COLLECTION).add(fileData);
    const fileId = fileRef.id;

    // If transactionId provided, connect file to transaction
    if (transactionId) {
      await db.collection(TRANSACTIONS_COLLECTION).doc(transactionId).update({
        fileIds: FieldValue.arrayUnion(fileId),
        isComplete: true,
        updatedAt: now,
      });

      // Also create file connection document
      await db.collection("fileConnections").add({
        fileId,
        transactionId,
        userId,
        connectionType: "gmail_html_conversion",
        createdAt: now,
      });
    }

    return NextResponse.json({
      success: true,
      fileId,
      fileName: filename,
      downloadUrl,
      pageCount: pdfResult.pageCount,
      connectedToTransaction: !!transactionId,
    });
  } catch (error) {
    console.error("[convert-to-pdf] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to convert email to PDF" },
      { status: 500 }
    );
  }
}

/**
 * Extract HTML and text body from Gmail message payload
 */
function extractBodyContent(payload: GmailMessagePart | undefined): {
  htmlBody: string;
  textBody: string;
} {
  let htmlBody = "";
  let textBody = "";

  if (!payload) return { htmlBody, textBody };

  // Check direct body
  if (payload.body?.data) {
    const decoded = Buffer.from(
      payload.body.data.replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    ).toString("utf-8");

    if (payload.mimeType === "text/html") {
      htmlBody = decoded;
    } else if (payload.mimeType === "text/plain") {
      textBody = decoded;
    }
  }

  // Check child parts recursively
  if (payload.parts) {
    for (const part of payload.parts) {
      const { htmlBody: partHtml, textBody: partText } = extractBodyContent(part);
      if (partHtml && !htmlBody) htmlBody = partHtml;
      if (partText && !textBody) textBody = partText;
    }
  }

  return { htmlBody, textBody };
}

/**
 * Convert HTML to PDF using Puppeteer (preserves full HTML layout, tables, images)
 */
async function convertHtmlToPdf(
  html: string,
  metadata?: {
    subject?: string;
    from?: string;
    date?: Date;
  }
): Promise<{ pdfBuffer: Buffer; pageCount: number }> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // Build a complete HTML document with email header
    const headerHtml = metadata ? `
      <div style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #ddd;">
        ${metadata.subject ? `<h2 style="margin: 0 0 8px 0; font-size: 18px; color: #333;">${escapeHtml(metadata.subject)}</h2>` : ''}
        ${metadata.from ? `<p style="margin: 0 0 4px 0; font-size: 12px; color: #666;">From: ${escapeHtml(metadata.from)}</p>` : ''}
        ${metadata.date && !isNaN(metadata.date.getTime()) ? `<p style="margin: 0; font-size: 12px; color: #666;">Date: ${metadata.date.toLocaleDateString("de-DE")}</p>` : ''}
      </div>
    ` : '';

    const fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              font-size: 14px;
              line-height: 1.5;
              color: #333;
              max-width: 100%;
              padding: 20px;
              box-sizing: border-box;
            }
            table {
              border-collapse: collapse;
              width: 100%;
            }
            td, th {
              padding: 8px;
              text-align: left;
            }
            img {
              max-width: 100%;
              height: auto;
            }
          </style>
        </head>
        <body>
          ${headerHtml}
          ${html}
        </body>
      </html>
    `;

    // Use 'domcontentloaded' instead of 'networkidle0' - don't wait for external images
    // Email HTML often has broken cid: references and tracking pixels that never load
    await page.setContent(fullHtml, {
      waitUntil: 'domcontentloaded',
      timeout: 10000
    });

    // Brief wait for any inline styles to apply
    await new Promise(resolve => setTimeout(resolve, 500));

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        right: '15mm',
        bottom: '20mm',
        left: '15mm',
      },
    });

    // Estimate page count (rough calculation based on buffer size)
    // A typical A4 PDF page is ~3-5KB for text, more with images
    const pageCount = Math.max(1, Math.ceil(pdfBuffer.length / 50000));

    return {
      pdfBuffer: Buffer.from(pdfBuffer),
      pageCount,
    };
  } finally {
    await page.close();
  }
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
