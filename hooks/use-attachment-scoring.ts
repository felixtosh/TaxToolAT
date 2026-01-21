"use client";

import { useCallback } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/config";

// ============================================================================
// Types matching the cloud function
// ============================================================================

interface AttachmentScoreInput {
  key: string; // Unique identifier for this attachment
  filename: string;
  mimeType: string;
  emailSubject?: string | null;
  emailFrom?: string | null;
  emailSnippet?: string | null;
  emailBodyText?: string | null;
  emailDate?: string | null; // ISO string
  integrationId?: string | null;
  // For local files with extracted data
  fileExtractedAmount?: number | null;
  fileExtractedDate?: string | null;
  fileExtractedPartner?: string | null;
}

interface TransactionScoreInput {
  amount?: number | null;
  date?: string | null; // ISO string
  name?: string | null;
  reference?: string | null;
  partner?: string | null;
}

interface PartnerScoreInput {
  name?: string | null;
  emailDomains?: string[] | null;
  fileSourcePatterns?: Array<{
    sourceType: string;
    integrationId?: string;
  }> | null;
}

interface ScoreAttachmentRequest {
  attachments: AttachmentScoreInput[];
  transaction: TransactionScoreInput;
  partner?: PartnerScoreInput | null;
}

interface AttachmentScoreResult {
  key: string;
  score: number;
  label: "Strong" | "Likely" | null;
  reasons: string[];
}

interface ScoreAttachmentResponse {
  scores: AttachmentScoreResult[];
}

const scoreAttachmentMatchFn = httpsCallable<
  ScoreAttachmentRequest,
  ScoreAttachmentResponse
>(functions, "scoreAttachmentMatchCallable");

// ============================================================================
// Hook
// ============================================================================

export interface AttachmentToScore {
  key: string;
  filename: string;
  mimeType: string;
  // Email context (for Gmail attachments)
  emailSubject?: string | null;
  emailFrom?: string | null;
  emailSnippet?: string | null;
  emailBodyText?: string | null;
  emailDate?: Date | null;
  integrationId?: string | null;
  // File extracted data (for local files)
  fileExtractedAmount?: number | null;
  fileExtractedDate?: Date | null;
  fileExtractedPartner?: string | null;
}

export interface TransactionForScoring {
  amount?: number | null;
  date?: Date | null;
  name?: string | null;
  reference?: string | null;
  partner?: string | null;
}

export interface PartnerForScoring {
  name?: string | null;
  emailDomains?: string[] | null;
  fileSourcePatterns?: Array<{
    sourceType: string;
    integrationId?: string;
  }> | null;
}

export interface ScoredAttachment {
  key: string;
  score: number;
  label: "Strong" | "Likely" | null;
  reasons: string[];
}

/**
 * Hook for scoring attachments against a transaction
 * Uses the unified scoring cloud function
 */
export function useAttachmentScoring() {
  const scoreAttachments = useCallback(
    async (
      attachments: AttachmentToScore[],
      transaction: TransactionForScoring,
      partner?: PartnerForScoring | null
    ): Promise<ScoredAttachment[]> => {
      if (attachments.length === 0) {
        return [];
      }

      try {
        const result = await scoreAttachmentMatchFn({
          attachments: attachments.map((att) => ({
            key: att.key,
            filename: att.filename,
            mimeType: att.mimeType,
            emailSubject: att.emailSubject,
            emailFrom: att.emailFrom,
            emailSnippet: att.emailSnippet,
            emailBodyText: att.emailBodyText,
            emailDate: att.emailDate?.toISOString() || null,
            integrationId: att.integrationId,
            fileExtractedAmount: att.fileExtractedAmount,
            fileExtractedDate: att.fileExtractedDate?.toISOString() || null,
            fileExtractedPartner: att.fileExtractedPartner,
          })),
          transaction: {
            amount: transaction.amount,
            date: transaction.date?.toISOString() || null,
            name: transaction.name,
            reference: transaction.reference,
            partner: transaction.partner,
          },
          partner: partner
            ? {
                name: partner.name,
                emailDomains: partner.emailDomains,
                fileSourcePatterns: partner.fileSourcePatterns,
              }
            : null,
        });

        return result.data.scores;
      } catch (error) {
        console.error("[useAttachmentScoring] Error scoring attachments:", error);
        // Return empty scores on error (don't break the UI)
        return attachments.map((att) => ({
          key: att.key,
          score: 0,
          label: null,
          reasons: [],
        }));
      }
    },
    []
  );

  return { scoreAttachments };
}
