/**
 * Callable Cloud Function for scoring attachment matches
 * Used by both UI (via callable) and automation (direct import)
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  scoreAttachmentMatch,
  ScoreAttachmentInput,
} from "./scoreAttachmentMatch";

interface ScoreAttachmentRequest {
  attachments: Array<{
    key: string; // Unique identifier for this attachment
    filename: string;
    mimeType: string;
    // Email context
    emailSubject?: string | null;
    emailFrom?: string | null;
    emailSnippet?: string | null;
    emailBodyText?: string | null;
    emailDate?: string | null; // ISO string
    integrationId?: string | null;
    // File extracted data (for local files)
    fileExtractedAmount?: number | null;
    fileExtractedDate?: string | null; // ISO string
    fileExtractedPartner?: string | null;
    // Explicit partner ID assigned to the file
    filePartnerId?: string | null;
    // Email classification (for emails)
    classification?: {
      hasPdfAttachment?: boolean;
      possibleMailInvoice?: boolean;
      possibleInvoiceLink?: boolean;
      confidence?: number;
    } | null;
  }>;
  transaction: {
    amount?: number | null;
    date?: string | null; // ISO string
    name?: string | null;
    reference?: string | null;
    partner?: string | null;
    // Explicit partner ID assigned to the transaction
    partnerId?: string | null;
  };
  partner?: {
    name?: string | null;
    emailDomains?: string[] | null;
    fileSourcePatterns?: Array<{
      sourceType: string;
      integrationId?: string;
    }> | null;
  } | null;
}

interface ScoreAttachmentResponse {
  scores: Array<{
    key: string;
    score: number;
    label: "Strong" | "Likely" | null;
    reasons: string[];
  }>;
}

/**
 * Score multiple attachments against a transaction
 * Batched for efficiency - score all attachments in one call
 */
export const scoreAttachmentMatchCallable = onCall<
  ScoreAttachmentRequest,
  Promise<ScoreAttachmentResponse>
>(
  {
    region: "europe-west1",
    memory: "256MiB",
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const { attachments, transaction, partner } = request.data;

    if (!attachments || !Array.isArray(attachments)) {
      throw new HttpsError("invalid-argument", "Attachments array is required");
    }

    const transactionDate = transaction?.date ? new Date(transaction.date) : null;

    const scores = attachments.map((att) => {
      const input: ScoreAttachmentInput = {
        filename: att.filename,
        mimeType: att.mimeType,
        // Email context
        emailSubject: att.emailSubject,
        emailFrom: att.emailFrom,
        emailSnippet: att.emailSnippet,
        emailBodyText: att.emailBodyText,
        emailDate: att.emailDate ? new Date(att.emailDate) : null,
        integrationId: att.integrationId,
        // File extracted data
        fileExtractedAmount: att.fileExtractedAmount,
        fileExtractedDate: att.fileExtractedDate ? new Date(att.fileExtractedDate) : null,
        fileExtractedPartner: att.fileExtractedPartner,
        // Transaction data
        transactionAmount: transaction?.amount,
        transactionDate,
        transactionName: transaction?.name,
        transactionReference: transaction?.reference,
        // Use name as fallback for partner matching when no partner assigned
        transactionPartner: transaction?.partner || transaction?.name,
        // Partner data
        partnerName: partner?.name,
        partnerEmailDomains: partner?.emailDomains,
        partnerFileSourcePatterns: partner?.fileSourcePatterns,
        // Explicit partner IDs for connected partner matching
        filePartnerId: att.filePartnerId,
        transactionPartnerId: transaction?.partnerId,
        // Email classification
        classification: att.classification,
      };

      const result = scoreAttachmentMatch(input);

      return {
        key: att.key,
        score: result.score,
        label: result.label,
        reasons: result.reasons,
      };
    });

    return { scores };
  }
);
