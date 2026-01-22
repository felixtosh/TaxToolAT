/**
 * Connect a file to a transaction (many-to-many relationship)
 */

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { createCallable, HttpsError } from "../utils/createCallable";

interface FileConnectionSourceInfo {
  sourceType?: string;
  searchPattern?: string;
  gmailIntegrationId?: string;
  gmailIntegrationEmail?: string;
  gmailMessageId?: string;
  gmailMessageFrom?: string;
  gmailMessageFromName?: string;
  resultType?: string;
}

interface ConnectFileRequest {
  fileId: string;
  transactionId: string;
  connectionType?: "manual" | "auto_matched";
  matchConfidence?: number;
  sourceInfo?: FileConnectionSourceInfo;
}

interface ConnectFileResponse {
  success: boolean;
  connectionId: string;
  alreadyConnected: boolean;
}

export const connectFileToTransactionCallable = createCallable<
  ConnectFileRequest,
  ConnectFileResponse
>(
  { name: "connectFileToTransaction" },
  async (ctx, request) => {
    const {
      fileId,
      transactionId,
      connectionType = "manual",
      matchConfidence,
      sourceInfo,
    } = request;

    if (!fileId || !transactionId) {
      throw new HttpsError("invalid-argument", "fileId and transactionId are required");
    }

    // Verify file ownership
    const fileRef = ctx.db.collection("files").doc(fileId);
    const fileSnap = await fileRef.get();

    if (!fileSnap.exists) {
      throw new HttpsError("not-found", "File not found");
    }

    const fileData = fileSnap.data()!;
    if (fileData.userId !== ctx.userId) {
      throw new HttpsError("permission-denied", "File access denied");
    }

    // Verify transaction ownership
    const transactionRef = ctx.db.collection("transactions").doc(transactionId);
    const transactionSnap = await transactionRef.get();

    if (!transactionSnap.exists) {
      throw new HttpsError("not-found", "Transaction not found");
    }

    const transactionData = transactionSnap.data()!;
    if (transactionData.userId !== ctx.userId) {
      throw new HttpsError("permission-denied", "Transaction access denied");
    }

    // Check if connection already exists
    const existingQuery = await ctx.db
      .collection("fileConnections")
      .where("fileId", "==", fileId)
      .where("transactionId", "==", transactionId)
      .where("userId", "==", ctx.userId)
      .limit(1)
      .get();

    if (!existingQuery.empty) {
      return {
        success: true,
        connectionId: existingQuery.docs[0].id,
        alreadyConnected: true,
      };
    }

    const now = Timestamp.now();
    const batch = ctx.db.batch();

    // 1. Create junction document
    const connectionRef = ctx.db.collection("fileConnections").doc();
    const connectionData: Record<string, unknown> = {
      fileId,
      transactionId,
      userId: ctx.userId,
      connectionType,
      matchConfidence: matchConfidence ?? null,
      createdAt: now,
    };

    // Add source tracking fields if provided
    if (sourceInfo?.sourceType) {
      connectionData.sourceType = sourceInfo.sourceType;
    }
    if (sourceInfo?.searchPattern) {
      connectionData.searchPattern = sourceInfo.searchPattern;
    }
    if (sourceInfo?.gmailIntegrationId) {
      connectionData.gmailIntegrationId = sourceInfo.gmailIntegrationId;
    }
    if (sourceInfo?.gmailIntegrationEmail) {
      connectionData.gmailIntegrationEmail = sourceInfo.gmailIntegrationEmail;
    }
    if (sourceInfo?.gmailMessageId) {
      connectionData.gmailMessageId = sourceInfo.gmailMessageId;
    }
    if (sourceInfo?.gmailMessageFrom) {
      connectionData.gmailMessageFrom = sourceInfo.gmailMessageFrom;
    }
    if (sourceInfo?.gmailMessageFromName) {
      connectionData.gmailMessageFromName = sourceInfo.gmailMessageFromName;
    }
    if (sourceInfo?.resultType) {
      connectionData.resultType = sourceInfo.resultType;
    }

    batch.set(connectionRef, connectionData);

    // 2. Update file's transactionIds array
    const fileUpdate: Record<string, unknown> = {
      transactionIds: FieldValue.arrayUnion(transactionId),
      updatedAt: now,
    };

    // 3. Update transaction's fileIds array and mark as complete
    const transactionUpdate: Record<string, unknown> = {
      fileIds: FieldValue.arrayUnion(fileId),
      isComplete: true,
      updatedAt: now,
    };

    // 4. Partner sync logic - higher confidence wins
    // Files typically have better confidence since they extract partner names exactly from invoices
    const filePartnerId = fileData.partnerId;
    const filePartnerConfidence = fileData.partnerMatchConfidence ?? 0;
    const transactionPartnerId = transactionData.partnerId;
    const transactionPartnerConfidence = transactionData.partnerMatchConfidence ?? 0;

    if (filePartnerId && !transactionPartnerId) {
      // File has partner, transaction doesn't -> sync to transaction
      transactionUpdate.partnerId = filePartnerId;
      transactionUpdate.partnerType = fileData.partnerType ?? "user";
      transactionUpdate.partnerMatchConfidence = filePartnerConfidence;
      transactionUpdate.partnerMatchedBy = "auto"; // Synced from file
      console.log(`[connectFileToTransaction] Synced partner ${filePartnerId} from file to transaction`);
    } else if (transactionPartnerId && !filePartnerId) {
      // Transaction has partner, file doesn't -> sync to file
      fileUpdate.partnerId = transactionPartnerId;
      fileUpdate.partnerType = transactionData.partnerType ?? "user";
      fileUpdate.partnerMatchConfidence = transactionPartnerConfidence;
      console.log(`[connectFileToTransaction] Synced partner ${transactionPartnerId} from transaction to file`);
    } else if (filePartnerId && transactionPartnerId && filePartnerId !== transactionPartnerId) {
      // Both have different partners -> higher confidence wins
      // Files typically have exact extracted names, so they often win
      if (filePartnerConfidence > transactionPartnerConfidence) {
        transactionUpdate.partnerId = filePartnerId;
        transactionUpdate.partnerType = fileData.partnerType ?? "user";
        transactionUpdate.partnerMatchConfidence = filePartnerConfidence;
        transactionUpdate.partnerMatchedBy = "auto"; // Override with higher confidence
        console.log(`[connectFileToTransaction] File partner ${filePartnerId} (${filePartnerConfidence}%) wins over transaction partner ${transactionPartnerId} (${transactionPartnerConfidence}%)`);
      } else if (transactionPartnerConfidence > filePartnerConfidence) {
        fileUpdate.partnerId = transactionPartnerId;
        fileUpdate.partnerType = transactionData.partnerType ?? "user";
        fileUpdate.partnerMatchConfidence = transactionPartnerConfidence;
        console.log(`[connectFileToTransaction] Transaction partner ${transactionPartnerId} (${transactionPartnerConfidence}%) wins over file partner ${filePartnerId} (${filePartnerConfidence}%)`);
      }
      // If equal confidence, keep both unchanged
    }

    batch.update(fileRef, fileUpdate);
    batch.update(transactionRef, transactionUpdate);

    await batch.commit();

    console.log(`[connectFileToTransaction] Connected file ${fileId} to transaction ${transactionId}`);

    return {
      success: true,
      connectionId: connectionRef.id,
      alreadyConnected: false,
    };
  }
);
