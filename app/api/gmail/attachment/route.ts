import { NextRequest, NextResponse } from "next/server";
import { doc, getDoc, addDoc, collection, Timestamp, updateDoc, arrayUnion } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getServerDb, getServerStorage, MOCK_USER_ID } from "@/lib/firebase/config-server";
import { getEmailIntegration, markIntegrationNeedsReauth } from "@/lib/operations";
import { GmailClient } from "@/lib/email-providers/gmail-client";
import { createHash } from "crypto";

const db = getServerDb();
const storage = getServerStorage();

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

/**
 * GET /api/gmail/attachment
 * Download attachment for preview
 *
 * Query: integrationId, messageId, attachmentId, mimeType (optional), filename (optional)
 */
export async function GET(request: NextRequest) {
  try {
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

    const ctx = { db, userId: MOCK_USER_ID };

    // Verify integration
    const integration = await getEmailIntegration(ctx, integrationId);
    if (!integration) {
      return NextResponse.json(
        { error: "Integration not found" },
        { status: 404 }
      );
    }

    // Get tokens
    const tokens = await getTokens(integrationId);
    if (!tokens) {
      return NextResponse.json(
        { error: "Tokens not found" },
        { status: 403 }
      );
    }

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
    // Convert Buffer to Uint8Array for NextResponse compatibility
    return new NextResponse(new Uint8Array(attachment.data), {
      headers: {
        "Content-Type": normalizedMimeType,
        "Content-Disposition": `inline; filename="${attachment.filename}"`,
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
    const body = await request.json();
    const { integrationId, messageId, attachmentId, mimeType, filename, transactionId, gmailMessageSubject } = body;

    if (!integrationId || !messageId || !attachmentId) {
      return NextResponse.json(
        { error: "integrationId, messageId, and attachmentId are required" },
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

    // Get tokens
    const tokens = await getTokens(integrationId);
    if (!tokens) {
      return NextResponse.json(
        { error: "Tokens not found" },
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

    // Upload to Firebase Storage
    const timestamp = Date.now();
    const sanitizedFilename = attachment.filename.replace(/[^a-zA-Z0-9.-]/g, "_");
    const storagePath = `files/${MOCK_USER_ID}/${timestamp}_${sanitizedFilename}`;
    const storageRef = ref(storage, storagePath);

    await uploadBytes(storageRef, attachment.data, {
      contentType: normalizedMimeType,
      customMetadata: {
        originalName: attachment.filename,
        gmailMessageId: messageId,
        gmailIntegrationId: integrationId,
      },
    });

    const downloadUrl = await getDownloadURL(storageRef);

    // Create file document
    const now = Timestamp.now();
    const fileData = {
      userId: MOCK_USER_ID,
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
      gmailMessageId: messageId,
      gmailThreadId: messageId, // We don't have thread ID here
      gmailIntegrationId: integrationId,
      gmailSubject: gmailMessageSubject || null,
      // These will be populated by AI extraction
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
