export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminBucket, getFirebaseStorageDownloadUrl } from "@/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getServerUserIdWithFallback } from "@/lib/auth/get-server-user";
import { GmailClient } from "@/lib/email-providers/gmail-client";
import { createHash, randomUUID } from "crypto";

const db = getAdminDb();

const INTEGRATIONS_COLLECTION = "emailIntegrations";
const TOKENS_COLLECTION = "emailTokens";
const FILES_COLLECTION = "files";
const TRANSACTIONS_COLLECTION = "transactions";

function normalizeMimeType(mimeType: string, filename: string): string {
  if (
    mimeType === "application/octet-stream" &&
    filename.toLowerCase().endsWith(".pdf")
  ) {
    return "application/pdf";
  }
  return mimeType;
}

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

/**
 * GET /api/gmail/attachment
 * Download attachment for preview
 *
 * Query: integrationId, messageId, attachmentId, mimeType (optional), filename (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getServerUserIdWithFallback(request);
    const { searchParams } = request.nextUrl;
    const integrationId = searchParams.get("integrationId");
    const messageId = searchParams.get("messageId");
    const attachmentId = searchParams.get("attachmentId");
    const mimeType = searchParams.get("mimeType");
    const filename = searchParams.get("filename");

    if (!integrationId || !messageId || !attachmentId) {
      return NextResponse.json(
        { error: "integrationId, messageId, and attachmentId are required" },
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

    // Get tokens
    const tokenSnap = await db.collection(TOKENS_COLLECTION).doc(integrationId).get();
    if (!tokenSnap.exists) {
      return NextResponse.json(
        { error: "Tokens not found" },
        { status: 403 }
      );
    }

    const tokens = tokenSnap.data()!;

    // Download attachment
    const gmailClient = new GmailClient(
      integrationId,
      tokens.accessToken,
      tokens.refreshToken || ""
    );

    const attachment = await gmailClient.getAttachmentData(messageId, attachmentId, {
      mimeType: mimeType || undefined,
      filename: filename || undefined,
    });
    const normalizedMimeType = normalizeMimeType(
      attachment.mimeType,
      attachment.filename
    );

    // Return the attachment data with appropriate headers
    // Use RFC 5987 encoding for non-ASCII filenames
    const safeFilename = attachment.filename.replace(/[^\x20-\x7E]/g, "_");
    const encodedFilename = encodeURIComponent(attachment.filename);

    return new NextResponse(new Uint8Array(attachment.data), {
      headers: {
        "Content-Type": normalizedMimeType,
        "Content-Disposition": `inline; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`,
        "Content-Length": String(attachment.size),
      },
    });
  } catch (error) {
    console.error("Error downloading attachment:", error);

    if (error instanceof Error && error.message === "AUTH_EXPIRED") {
      return NextResponse.json(
        { error: "Authentication expired", code: "AUTH_EXPIRED" },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to download attachment" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/gmail/attachment
 * Download attachment and save to Files, optionally connect to transaction
 *
 * Body: {
 *   integrationId: string;
 *   messageId: string;
 *   attachmentId: string;
 *   mimeType?: string;
 *   filename?: string;
 *   transactionId?: string;
 *   gmailMessageSubject?: string;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserIdWithFallback(request);
    const body = await request.json();
    const {
      integrationId,
      messageId,
      attachmentId,
      mimeType,
      filename,
      transactionId,
      gmailMessageSubject,
      gmailMessageFrom,
      gmailMessageFromName,
      searchPattern,
      resultType,
    } = body;

    if (!integrationId || !messageId || !attachmentId) {
      return NextResponse.json(
        { error: "integrationId, messageId, and attachmentId are required" },
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

    // Get tokens
    const tokenSnap = await db.collection(TOKENS_COLLECTION).doc(integrationId).get();
    if (!tokenSnap.exists) {
      return NextResponse.json(
        { error: "Tokens not found" },
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

    // Download attachment from Gmail
    const gmailClient = new GmailClient(
      integrationId,
      tokens.accessToken,
      tokens.refreshToken || ""
    );

    const attachment = await gmailClient.getAttachmentData(messageId, attachmentId, {
      mimeType: mimeType || undefined,
      filename: filename || undefined,
    });
    const normalizedMimeType = normalizeMimeType(
      attachment.mimeType,
      attachment.filename
    );

    // Calculate file hash for deduplication
    const fileHash = createHash("sha256").update(attachment.data).digest("hex");

    // Check for existing file with same Gmail message + attachment ID
    // Query without deletedAt filter to catch soft-deleted files too
    const existingByGmail = await db
      .collection(FILES_COLLECTION)
      .where("userId", "==", userId)
      .where("gmailMessageId", "==", messageId)
      .where("gmailAttachmentId", "==", attachmentId)
      .limit(1)
      .get();

    // Fallback: check by file hash (catches duplicates from older uploads or different sources)
    let existingByHash: FirebaseFirestore.QuerySnapshot | null = null;
    if (existingByGmail.empty) {
      existingByHash = await db
        .collection(FILES_COLLECTION)
        .where("userId", "==", userId)
        .where("fileHash", "==", fileHash)
        .limit(1)
        .get();
    }

    const existingDoc = !existingByGmail.empty ? existingByGmail.docs[0] : existingByHash?.docs[0];
    if (existingDoc) {
      const existingFile = existingDoc;
      const existingData = existingFile.data();
      const now = Timestamp.now();

      // Check if file was soft-deleted
      const wasSoftDeleted = !!existingData.deletedAt;

      const foundBy = !existingByGmail.empty ? "gmailId" : "fileHash";
      console.log(`[Gmail Attachment] Found duplicate by ${foundBy}: ${existingFile.id}`);

      if (wasSoftDeleted) {
        // Restore the soft-deleted file
        await existingFile.ref.update({
          deletedAt: FieldValue.delete(),
          restoredAt: now,
          restoredReason: "re-downloaded_from_gmail",
          updatedAt: now,
        });
        console.log(`[Gmail Attachment] Restored soft-deleted file ${existingFile.id}`);
      }

      // If transactionId provided, connect existing file to transaction
      if (transactionId) {
        await db.collection(TRANSACTIONS_COLLECTION).doc(transactionId).update({
          fileIds: FieldValue.arrayUnion(existingFile.id),
          isComplete: true,
          updatedAt: now,
        });

        // Update file's transactionIds
        await existingFile.ref.update({
          transactionIds: FieldValue.arrayUnion(transactionId),
          updatedAt: now,
        });

        // Create file connection document
        await db.collection("fileConnections").add({
          fileId: existingFile.id,
          transactionId,
          userId,
          connectionType: "gmail_import",
          createdAt: now,
        });
      }

      return NextResponse.json({
        success: true,
        fileId: existingFile.id,
        fileName: existingData.fileName,
        downloadUrl: existingData.downloadUrl,
        connectedToTransaction: !!transactionId,
        alreadyExists: true,
        wasRestored: wasSoftDeleted,
      });
    }

    // Upload to Firebase Storage using Admin SDK
    const timestamp = Date.now();
    const sanitizedFilename = attachment.filename.replace(/[^a-zA-Z0-9.-]/g, "_");
    const storagePath = `files/${userId}/${timestamp}_${sanitizedFilename}`;

    const bucket = getAdminBucket();
    const file = bucket.file(storagePath);

    // Generate a download token (same as client SDK's getDownloadURL)
    const downloadToken = randomUUID();

    await file.save(Buffer.from(attachment.data), {
      metadata: {
        contentType: normalizedMimeType,
        contentDisposition: "inline",
        metadata: {
          originalName: attachment.filename,
          gmailMessageId: messageId,
          gmailIntegrationId: integrationId,
          firebaseStorageDownloadTokens: downloadToken,
        },
      },
    });

    // Construct Firebase Storage download URL (permanent, like client SDK's getDownloadURL)
    const downloadUrl = getFirebaseStorageDownloadUrl(bucket.name, storagePath, downloadToken);

    const parsedFrom = parseFromHeader(gmailMessageFrom);
    const senderEmail = parsedFrom.email;
    const senderName = gmailMessageFromName || parsedFrom.name;
    const senderDomain = extractDomain(senderEmail);

    // Create file document
    const now = Timestamp.now();
    const fileData = {
      userId,
      fileName: attachment.filename,
      fileType: normalizedMimeType,
      fileSize: attachment.size,
      storagePath,
      downloadUrl,
      fileHash,
      uploadedAt: now,
      createdAt: now,
      updatedAt: now,
      // Gmail-specific fields
      sourceType: "gmail" as const,
      sourceSearchPattern: searchPattern || null,
      sourceResultType: resultType || "gmail_attachment",
      gmailMessageId: messageId,
      gmailAttachmentId: attachmentId,
      gmailThreadId: messageId,
      gmailIntegrationId: integrationId,
      gmailIntegrationEmail: integration.email || null,
      gmailSubject: gmailMessageSubject || null,
      gmailSenderEmail: senderEmail || null,
      gmailSenderName: senderName || null,
      gmailSenderDomain: senderDomain || null,
      // These will be populated by AI extraction
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
        connectionType: "gmail_import",
        createdAt: now,
      });
    }

    return NextResponse.json({
      success: true,
      fileId,
      fileName: attachment.filename,
      downloadUrl,
      connectedToTransaction: !!transactionId,
    });
  } catch (error) {
    console.error("Error saving attachment:", error);

    if (error instanceof Error && error.message === "AUTH_EXPIRED") {
      return NextResponse.json(
        { error: "Authentication expired", code: "AUTH_EXPIRED" },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save attachment" },
      { status: 500 }
    );
  }
}
