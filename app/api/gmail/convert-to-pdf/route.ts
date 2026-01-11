import { NextRequest, NextResponse } from "next/server";
import { doc, getDoc, addDoc, collection, Timestamp, updateDoc, arrayUnion } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getServerDb, getServerStorage, MOCK_USER_ID } from "@/lib/firebase/config-server";
import { getEmailIntegration, markIntegrationNeedsReauth } from "@/lib/operations";
import { createHash } from "crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const db = getServerDb();
const storage = getServerStorage();

const TOKENS_COLLECTION = "emailTokens";
const FILES_COLLECTION = "files";
const TRANSACTIONS_COLLECTION = "transactions";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1";

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
    const body = await request.json();
    const { integrationId, messageId, transactionId } = body;

    if (!integrationId || !messageId) {
      return NextResponse.json(
        { error: "integrationId and messageId are required" },
        { status: 400 }
      );
    }

    const ctx = { db, userId: MOCK_USER_ID };

    // Verify integration
    const integration = await getEmailIntegration(ctx, integrationId);
    if (!integration) {
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
    const tokens = await getTokens(integrationId);
    if (!tokens) {
      return NextResponse.json(
        { error: "Tokens not found. Please reconnect Gmail.", code: "TOKENS_MISSING" },
        { status: 403 }
      );
    }

    // Check token expiry
    if (tokens.expiresAt.toDate() < new Date()) {
      await markIntegrationNeedsReauth(ctx, integrationId, "Access token expired");
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

    // Upload to Firebase Storage
    const storagePath = `files/${MOCK_USER_ID}/${filename}`;
    const storageRef = ref(storage, storagePath);

    await uploadBytes(storageRef, pdfResult.pdfBuffer, {
      contentType: "application/pdf",
      customMetadata: {
        originalName: filename,
        gmailMessageId: messageId,
        gmailIntegrationId: integrationId,
        convertedFromEmail: "true",
      },
    });

    const downloadUrl = await getDownloadURL(storageRef);

    // Create file document
    const now = Timestamp.now();
    const fileData = {
      userId: MOCK_USER_ID,
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
      gmailMessageId: messageId,
      gmailThreadId: message.threadId,
      gmailIntegrationId: integrationId,
      gmailSubject: subject || null,
      // Extraction will happen via Cloud Function trigger
      extractionComplete: false,
      transactionIds: transactionId ? [transactionId] : [],
    };

    const fileRef = await addDoc(collection(db, FILES_COLLECTION), fileData);
    const fileId = fileRef.id;

    // If transactionId provided, connect file to transaction
    if (transactionId) {
      const txRef = doc(db, TRANSACTIONS_COLLECTION, transactionId);
      await updateDoc(txRef, {
        fileIds: arrayUnion(fileId),
        isComplete: true,
        updatedAt: now,
      });

      // Also create file connection document
      await addDoc(collection(db, "fileConnections"), {
        fileId,
        transactionId,
        userId: MOCK_USER_ID,
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
 * Convert HTML to PDF
 */
async function convertHtmlToPdf(
  html: string,
  metadata?: {
    subject?: string;
    from?: string;
    date?: Date;
  }
): Promise<{ pdfBuffer: Buffer; pageCount: number }> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const fontSize = 10;
  const lineHeight = fontSize * 1.4;
  const margin = 50;
  const pageWidth = 595; // A4
  const pageHeight = 842; // A4
  const contentWidth = pageWidth - 2 * margin;
  const maxCharsPerLine = Math.floor(contentWidth / (fontSize * 0.5));

  // Convert HTML to text
  const textContent = htmlToText(html);
  const lines = wrapText(textContent, maxCharsPerLine);

  // Calculate content height per page
  const maxLinesPerPage = Math.floor((pageHeight - 2 * margin - 60) / lineHeight);

  let pageCount = 0;
  let currentLineIndex = 0;

  while (currentLineIndex < lines.length || pageCount === 0) {
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    pageCount++;

    let y = pageHeight - margin;

    // Add header on first page
    if (pageCount === 1 && metadata) {
      if (metadata.subject) {
        page.drawText(metadata.subject.substring(0, 80), {
          x: margin,
          y,
          size: 14,
          font: boldFont,
          color: rgb(0, 0, 0),
        });
        y -= 20;
      }

      if (metadata.from) {
        page.drawText(`From: ${metadata.from.substring(0, 60)}`, {
          x: margin,
          y,
          size: fontSize,
          font,
          color: rgb(0.3, 0.3, 0.3),
        });
        y -= lineHeight;
      }

      if (metadata.date && !isNaN(metadata.date.getTime())) {
        page.drawText(`Date: ${metadata.date.toLocaleDateString("de-DE")}`, {
          x: margin,
          y,
          size: fontSize,
          font,
          color: rgb(0.3, 0.3, 0.3),
        });
        y -= lineHeight;
      }

      // Add separator
      y -= 10;
      page.drawLine({
        start: { x: margin, y },
        end: { x: pageWidth - margin, y },
        thickness: 0.5,
        color: rgb(0.7, 0.7, 0.7),
      });
      y -= 20;
    }

    // Draw content lines
    let linesOnPage = 0;
    while (
      currentLineIndex < lines.length &&
      linesOnPage < maxLinesPerPage &&
      y > margin
    ) {
      const line = lines[currentLineIndex];

      if (line.trim()) {
        page.drawText(line.substring(0, 120), {
          x: margin,
          y,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        });
      }

      y -= lineHeight;
      currentLineIndex++;
      linesOnPage++;
    }

    // Add page number
    page.drawText(`Page ${pageCount}`, {
      x: pageWidth / 2 - 20,
      y: 30,
      size: 8,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });

    // Break if we've processed all lines
    if (currentLineIndex >= lines.length) break;
  }

  const pdfBytes = await pdfDoc.save();

  return {
    pdfBuffer: Buffer.from(pdfBytes),
    pageCount,
  };
}

/**
 * Extract clean text from HTML
 */
function htmlToText(html: string): string {
  let text = html;

  // Remove style and script tags completely
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");

  // Replace common elements with line breaks
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/p>/gi, "\n\n");
  text = text.replace(/<\/div>/gi, "\n");
  text = text.replace(/<\/tr>/gi, "\n");
  text = text.replace(/<\/li>/gi, "\n");
  text = text.replace(/<\/h[1-6]>/gi, "\n\n");

  // Replace horizontal rules
  text = text.replace(/<hr[^>]*>/gi, "\n---\n");

  // Remove remaining tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode common HTML entities
  text = text.replace(/&nbsp;/gi, " ");
  text = text.replace(/&amp;/gi, "&");
  text = text.replace(/&lt;/gi, "<");
  text = text.replace(/&gt;/gi, ">");
  text = text.replace(/&quot;/gi, '"');
  text = text.replace(/&#39;/gi, "'");
  text = text.replace(/&euro;/gi, "€");

  // Clean up whitespace
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n\s*\n\s*\n/g, "\n\n");
  text = text.trim();

  return text;
}

/**
 * Wrap text to fit within a given width
 */
function wrapText(text: string, maxCharsPerLine: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.split("\n");

  for (const paragraph of paragraphs) {
    if (paragraph.trim() === "") {
      lines.push("");
      continue;
    }

    const words = paragraph.split(" ");
    let currentLine = "";

    for (const word of words) {
      if (currentLine.length + word.length + 1 <= maxCharsPerLine) {
        currentLine += (currentLine ? " " : "") + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }

    if (currentLine) lines.push(currentLine);
  }

  return lines;
}

/**
 * Get tokens from secure storage
 */
async function getTokens(integrationId: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresAt: { toDate: () => Date };
} | null> {
  const tokenDoc = doc(db, TOKENS_COLLECTION, integrationId);
  const snapshot = await getDoc(tokenDoc);

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data();
  return {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt: data.expiresAt,
  };
}
