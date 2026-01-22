/**
 * Search Tools
 *
 * Tools for searching files and receipts across local files and Gmail.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getAdminDb } from "@/lib/firebase/admin";
import { classifyEmail } from "@/lib/email-providers/interface";
import { callFirebaseFunction } from "@/lib/api/firebase-callable";

// Server-side attachment scoring types (matches scoreAttachmentMatchCallable)
interface ScoreAttachmentRequest {
  attachments: Array<{
    key: string;
    filename: string;
    mimeType: string;
    // Email context (for Gmail attachments)
    emailSubject?: string | null;
    emailFrom?: string | null;
    emailSnippet?: string | null;
    emailBodyText?: string | null;
    emailDate?: string | null;
    integrationId?: string | null;
    // File extracted data (for local files)
    fileExtractedAmount?: number | null;
    fileExtractedDate?: string | null;
    fileExtractedPartner?: string | null;
  }>;
  transaction: {
    amount?: number | null;
    date?: string | null;
    name?: string | null;
    reference?: string | null;
    partner?: string | null;
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

const db = getAdminDb();

// Types for search query generation
interface TypedSuggestion {
  query: string;
  type: "invoice_number" | "company_name" | "email_domain" | "vat_id" | "iban" | "pattern" | "fallback";
  score: number;
}

interface GenerateSearchQueriesResponse {
  queries: string[];
  suggestions: TypedSuggestion[];
}

// Types for Gmail search callable (matching the Cloud Function)
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

interface GmailAttachmentResult {
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
  attachments: GmailAttachmentResult[];
}

interface SearchGmailResponse {
  messages: GmailMessageResult[];
  nextPageToken?: string;
  totalEstimate?: number;
}

// ============================================================================
// Generate Search Suggestions (AI-powered query generation)
// ============================================================================

export const generateSearchSuggestionsTool = tool(
  async ({ transactionId }, config) => {
    const userId = config?.configurable?.userId;
    const authHeader = config?.configurable?.authHeader;

    if (!userId) {
      return { error: "User ID not provided" };
    }

    // Get transaction
    const txDoc = await db.collection("transactions").doc(transactionId).get();
    if (!txDoc.exists || txDoc.data()?.userId !== userId) {
      return { error: "Transaction not found" };
    }

    const tx = txDoc.data()!;
    const txDate = tx.date?.toDate?.() || new Date(tx.date);

    // Get partner info if available
    let partner = null;
    if (tx.partnerId) {
      const partnerDoc = await db.collection("partners").doc(tx.partnerId).get();
      if (partnerDoc.exists) {
        partner = partnerDoc.data();
      }
    }

    // Format transaction info for display
    const formattedAmount = new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: tx.currency || "EUR",
    }).format(Math.abs(tx.amount || 0) / 100);

    const formattedDate = txDate.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    const transactionInfo = {
      id: transactionId,
      name: tx.name,
      partner: tx.partner || partner?.name,
      amount: tx.amount,
      amountFormatted: formattedAmount,
      date: txDate.toISOString(),
      dateFormatted: formattedDate,
    };

    // Call AI to generate search suggestions
    try {
      const queryResponse = await callFirebaseFunction<
        {
          transaction: {
            name: string;
            partner?: string | null;
            description?: string;
            reference?: string;
            partnerId?: string | null;
            partnerType?: "global" | "user" | null;
            amount?: number;
          };
          maxQueries?: number;
        },
        GenerateSearchQueriesResponse
      >(
        "generateSearchQueriesCallable",
        {
          transaction: {
            name: tx.name || "",
            partner: tx.partner,
            description: tx.description,
            reference: tx.reference,
            partnerId: tx.partnerId,
            partnerType: tx.partnerType,
            amount: tx.amount,
          },
          maxQueries: 6,
        },
        authHeader
      );

      const suggestions = queryResponse?.suggestions || [];
      const queries = queryResponse?.queries || [];

      return {
        transaction: transactionInfo,
        suggestions: suggestions.map((s) => ({
          query: s.query,
          type: s.type,
          typeLabel: s.type === "invoice_number" ? "Invoice #"
            : s.type === "company_name" ? "Company"
            : s.type === "email_domain" ? "Email"
            : s.type === "vat_id" ? "VAT ID"
            : s.type === "iban" ? "IBAN"
            : s.type === "pattern" ? "Pattern"
            : s.type,
          score: s.score,
        })),
        queries,
        summary: queries.length > 0
          ? `Generated ${queries.length} search queries: ${queries.slice(0, 3).join(", ")}${queries.length > 3 ? "..." : ""}`
          : "No search queries generated",
        nextSteps: "Use searchLocalFiles to check uploaded files, then searchGmailAttachments with each query to search Gmail.",
      };
    } catch (err) {
      console.error("[generateSearchSuggestions] AI query generation failed:", err);

      // Fallback to basic queries
      const partnerName = tx.partner || partner?.name || tx.name;
      const fallbackQueries = partnerName
        ? [partnerName, `${partnerName} invoice`, `${partnerName} rechnung`]
        : [];

      return {
        transaction: transactionInfo,
        suggestions: [],
        queries: fallbackQueries,
        summary: fallbackQueries.length > 0
          ? `AI generation failed. Fallback queries: ${fallbackQueries.join(", ")}`
          : "Could not generate search queries",
        error: "AI query generation failed, using fallback queries",
        nextSteps: "Use searchLocalFiles to check uploaded files, then searchGmailAttachments with each query.",
      };
    }
  },
  {
    name: "generateSearchSuggestions",
    description: `Generate AI-powered search suggestions for finding a receipt/invoice for a transaction.

Call this FIRST when searching for a receipt. Returns optimized search queries based on:
- Transaction name and partner
- Invoice numbers found in description
- Email domains associated with partner

After getting suggestions, use:
1. searchLocalFiles to check uploaded files
2. searchGmailAttachments with each suggested query`,
    schema: z.object({
      transactionId: z.string().describe("The transaction ID to generate search suggestions for"),
    }),
  }
);

// ============================================================================
// Search Local Files
// ============================================================================

export const searchLocalFilesTool = tool(
  async ({ transactionId, strategy }, config) => {
    const userId = config?.configurable?.userId;
    const authHeader = config?.configurable?.authHeader;
    if (!userId) {
      return { error: "User ID not provided" };
    }

    // Get transaction
    const txDoc = await db.collection("transactions").doc(transactionId).get();
    if (!txDoc.exists || txDoc.data()?.userId !== userId) {
      return { error: "Transaction not found" };
    }

    const tx = txDoc.data()!;
    const txDate = tx.date?.toDate?.() || new Date(tx.date);

    // Get partner info if available
    let partner = null;
    if (tx.partnerId) {
      const partnerDoc = await db.collection("partners").doc(tx.partnerId).get();
      if (partnerDoc.exists) {
        partner = partnerDoc.data();
      }
    }

    // Get all unconnected files
    const filesSnapshot = await db
      .collection("files")
      .where("userId", "==", userId)
      .where("transactionIds", "==", [])
      .where("isNotInvoice", "!=", true)
      .get();

    // Define file type for eligible files
    interface EligibleFile {
      id: string;
      fileName: string;
      fileType: string;
      deletedAt?: unknown;
      extractedAmount?: number;
      extractedDate?: { toDate?: () => Date };
      extractedPartner?: string;
    }

    // Filter to eligible files (PDFs and images, not soft-deleted)
    const eligibleFiles: EligibleFile[] = filesSnapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() } as EligibleFile))
      .filter((file) => {
        if (file.deletedAt) return false;
        return file.fileType === "application/pdf" || file.fileType?.startsWith("image/");
      });

    if (eligibleFiles.length === 0) {
      return {
        searchType: "local_files",
        strategy: strategy || "all",
        searchedTransaction: {
          id: transactionId,
          name: tx.name,
          partner: tx.partner,
          amount: tx.amount,
          date: txDate.toISOString(),
        },
        summary: "No uploaded files available to search",
        candidates: [],
        totalFound: 0,
      };
    }

    // Build attachments list for scoring API
    const attachmentsToScore = eligibleFiles.map((file) => ({
      key: `local_${file.id}`,
      filename: file.fileName,
      mimeType: file.fileType,
      // Pass file extracted data for accurate scoring
      fileExtractedAmount: file.extractedAmount ?? null,
      fileExtractedDate: file.extractedDate?.toDate?.()?.toISOString() ?? null,
      fileExtractedPartner: file.extractedPartner ?? null,
    }));

    // Score all files using real-time scoring (same as UI does)
    let candidates: Array<{
      id: string;
      sourceType: "local_file";
      score: number;
      scoreLabel: string | null;
      scoreReasons: string[];
      fileId: string;
      fileName: string;
      extractedAmount?: number;
      extractedDate?: string;
      extractedPartner?: string;
    }> = [];

    try {
      const scoreResponse = await callFirebaseFunction<ScoreAttachmentRequest, ScoreAttachmentResponse>(
        "scoreAttachmentMatchCallable",
        {
          attachments: attachmentsToScore,
          transaction: {
            amount: tx.amount,
            date: txDate.toISOString(),
            name: tx.name,
            partner: tx.partner,
          },
          partner: partner ? {
            name: partner.name,
            emailDomains: partner.emailDomains,
            fileSourcePatterns: partner.fileSourcePatterns,
          } : null,
        },
        authHeader
      );

      // Map scores back to candidates
      const scoreMap = new Map(scoreResponse.scores.map((s) => [s.key, s]));

      for (const file of eligibleFiles) {
        const key = `local_${file.id}`;
        const scoreResult = scoreMap.get(key);

        if (scoreResult && scoreResult.score > 0) {
          // Apply strategy filter based on score reasons
          if (strategy === "partner_files") {
            const hasPartnerSignal = scoreResult.reasons.some(
              (r) => r.toLowerCase().includes("partner") || r.toLowerCase().includes("vendor")
            );
            if (!hasPartnerSignal) continue;
          }

          if (strategy === "amount_files") {
            const hasAmountSignal = scoreResult.reasons.some(
              (r) => r.toLowerCase().includes("amount")
            );
            if (!hasAmountSignal) continue;
          }

          candidates.push({
            id: key,
            sourceType: "local_file",
            score: scoreResult.score,
            scoreLabel: scoreResult.label,
            scoreReasons: scoreResult.reasons,
            fileId: file.id,
            fileName: file.fileName,
            extractedAmount: file.extractedAmount ?? undefined,
            extractedDate: file.extractedDate?.toDate?.()?.toISOString() ?? undefined,
            extractedPartner: file.extractedPartner ?? undefined,
          });
        }
      }
    } catch (err) {
      console.error("[searchLocalFiles] Error scoring files:", err);
      return {
        searchType: "local_files",
        strategy: strategy || "all",
        searchedTransaction: {
          id: transactionId,
          name: tx.name,
          partner: tx.partner,
          amount: tx.amount,
          date: txDate.toISOString(),
        },
        summary: "Error scoring files - please try again",
        candidates: [],
        totalFound: 0,
      };
    }

    // Sort by score
    candidates.sort((a, b) => b.score - a.score);

    const topCandidates = candidates.slice(0, 10);

    return {
      searchType: "local_files",
      strategy: strategy || "all",
      searchedTransaction: {
        id: transactionId,
        name: tx.name,
        partner: tx.partner,
        amount: tx.amount,
        date: txDate.toISOString(),
      },
      summary:
        candidates.length > 0
          ? `Found ${candidates.length} files. Top match: "${topCandidates[0]?.fileName}" (${topCandidates[0]?.score}%)`
          : "No matching files found",
      candidates: topCandidates.map((c) => ({
        ...c,
        scoreDetails: `${c.score}% - ${c.scoreReasons?.join(", ") || "no reasons"}`,
      })),
      totalFound: candidates.length,
    };
  },
  {
    name: "searchLocalFiles",
    description:
      "Search uploaded files that might match a transaction. Scores files by amount, date, and partner match. Returns candidates with scores.",
    schema: z.object({
      transactionId: z.string().describe("The transaction ID to find files for"),
      strategy: z
        .enum(["all", "partner_files", "amount_files"])
        .optional()
        .describe("Search strategy"),
    }),
  }
);

// ============================================================================
// Search Gmail Attachments
// ============================================================================

export const searchGmailAttachmentsTool = tool(
  async ({ transactionId, query }, config) => {
    const userId = config?.configurable?.userId;
    const authHeader = config?.configurable?.authHeader;

    if (!userId) {
      return { error: "User ID not provided" };
    }

    // Get transaction
    const txDoc = await db.collection("transactions").doc(transactionId).get();
    if (!txDoc.exists || txDoc.data()?.userId !== userId) {
      return { error: "Transaction not found" };
    }

    const tx = txDoc.data()!;
    const txDate = tx.date?.toDate?.() || new Date(tx.date);

    // Get partner info if available
    let partner = null;
    if (tx.partnerId) {
      const partnerDoc = await db.collection("partners").doc(tx.partnerId).get();
      if (partnerDoc.exists) {
        partner = partnerDoc.data();
      }
    }

    // Get Gmail integrations
    const integrationsSnapshot = await db
      .collection("emailIntegrations")
      .where("userId", "==", userId)
      .where("provider", "==", "gmail")
      .where("isActive", "==", true)
      .get();

    if (integrationsSnapshot.empty) {
      return {
        searchType: "gmail_attachments",
        gmailNotConnected: true,
        error: "Gmail is not connected. Connect Gmail to search email attachments.",
        candidates: [],
        queriesUsed: query ? [query] : [],
        totalFound: 0,
        integrationCount: 0,
      };
    }

    // Check for integrations needing reauth (isPaused is only for sync, not search)
    const integrationsNeedingReauth = integrationsSnapshot.docs
      .filter((doc) => {
        const data = doc.data();
        return data.needsReauth === true;
      })
      .map((doc) => {
        const data = doc.data();
        return {
          integrationId: doc.id,
          email: data.email,
          needsReauth: true,
        };
      });

    // Build search queries
    const searchQueries: string[] = [];
    if (query) {
      searchQueries.push(query);
    } else {
      // Auto-generate queries based on transaction
      const partnerName = tx.partner || tx.name;
      if (partnerName) {
        searchQueries.push(partnerName);
        searchQueries.push(`${partnerName} rechnung`);
        searchQueries.push(`${partnerName} invoice`);
      }
    }

    const allCandidates: Array<{
      id: string;
      sourceType: "gmail_attachment" | "gmail_email";
      score: number;
      scoreLabel: string | null;
      scoreReasons: string[];
      messageId: string;
      attachmentId?: string;
      attachmentFilename?: string;
      emailSubject?: string;
      emailFrom?: string;
      emailDate?: string;
      integrationId: string;
      classification?: {
        hasPdfAttachment: boolean;
        possibleMailInvoice: boolean;
        possibleInvoiceLink: boolean;
      };
    }> = [];

    for (const integrationDoc of integrationsSnapshot.docs) {
      const integration = integrationDoc.data();
      console.log("[searchGmailAttachments] Searching integration:", integration.email);

      for (const searchQuery of searchQueries) {
        try {
          // Call searchGmailCallable directly (same as UI does)
          // No date filtering - invoices may arrive weeks/months before or after transaction
          const searchResponse = await callFirebaseFunction<SearchGmailRequest, SearchGmailResponse>(
            "searchGmailCallable",
            {
              integrationId: integrationDoc.id,
              query: searchQuery,
              hasAttachments: false, // Get all emails, we'll classify them
              expandThreads: true, // Fetch all messages in matching threads
              limit: 50, // Match UI limit for better coverage
            },
            authHeader
          );

          const messages = searchResponse?.messages || [];
          console.log("[searchGmailAttachments] Found", messages.length, "messages for query:", searchQuery);

          // Collect attachments to score via server-side callable
          const attachmentsToScore: Array<{
            key: string;
            filename: string;
            mimeType: string;
            emailSubject?: string;
            emailFrom?: string;
            emailSnippet?: string;
            emailBodyText?: string;
            emailDate?: string;
            integrationId: string;
            // Metadata for building candidates after scoring
            _messageId: string;
            _attachmentId?: string;
            _classification: ReturnType<typeof classifyEmail>;
            _sourceType: "gmail_attachment" | "gmail_email";
          }> = [];

          for (const message of messages) {
            // Map attachments for classification (include required fields)
            const attachments = message.attachments?.map((a) => ({
              mimeType: a.mimeType,
              filename: a.filename,
              attachmentId: a.attachmentId,
              messageId: message.messageId,
              size: a.size || 0,
              isLikelyReceipt: a.isLikelyReceipt,
            })) || [];
            const classification = classifyEmail(
              message.subject || "",
              message.snippet || "",
              attachments
            );

            // Collect PDF attachments for scoring
            for (const attachment of message.attachments || []) {
              // Skip already imported attachments
              if (attachment.existingFileId) {
                continue;
              }

              // Only include PDFs - images are usually logos/signatures, not receipts
              const isPdf = attachment.mimeType === "application/pdf" ||
                (attachment.mimeType === "application/octet-stream" &&
                  attachment.filename?.toLowerCase().endsWith(".pdf"));
              if (!isPdf) {
                continue;
              }

              attachmentsToScore.push({
                key: `gmail_${message.messageId}_${attachment.attachmentId}`,
                filename: attachment.filename,
                mimeType: attachment.mimeType,
                emailSubject: message.subject,
                emailFrom: message.from,
                emailSnippet: message.snippet,
                emailBodyText: message.bodyText ?? undefined,
                emailDate: message.date,
                integrationId: integrationDoc.id,
                _messageId: message.messageId,
                _attachmentId: attachment.attachmentId,
                _classification: classification,
                _sourceType: "gmail_attachment",
              });
            }

            // If it's a mail invoice (no attachment), add the email itself
            if (classification.possibleMailInvoice && !classification.hasPdfAttachment) {
              attachmentsToScore.push({
                key: `gmail_email_${message.messageId}`,
                filename: `${message.subject || "email"}.pdf`,
                mimeType: "text/html",
                emailSubject: message.subject,
                emailFrom: message.from,
                emailSnippet: message.snippet,
                emailBodyText: message.bodyText ?? undefined,
                emailDate: message.date,
                integrationId: integrationDoc.id,
                _messageId: message.messageId,
                _classification: classification,
                _sourceType: "gmail_email",
              });
            }
          }

          // Score all attachments via server-side callable (batched for efficiency)
          if (attachmentsToScore.length > 0) {
            try {
              const scoreResponse = await callFirebaseFunction<ScoreAttachmentRequest, ScoreAttachmentResponse>(
                "scoreAttachmentMatchCallable",
                {
                  attachments: attachmentsToScore.map((a) => ({
                    key: a.key,
                    filename: a.filename,
                    mimeType: a.mimeType,
                    emailSubject: a.emailSubject,
                    emailFrom: a.emailFrom,
                    emailSnippet: a.emailSnippet,
                    emailBodyText: a.emailBodyText,
                    emailDate: a.emailDate,
                    integrationId: a.integrationId,
                  })),
                  transaction: {
                    amount: tx.amount,
                    date: txDate.toISOString(),
                    name: tx.name,
                    partner: tx.partner,
                  },
                  partner: partner ? {
                    name: partner.name,
                    emailDomains: partner.emailDomains,
                    fileSourcePatterns: partner.fileSourcePatterns,
                  } : null,
                },
                authHeader
              );

              // Map scores back to candidates
              const scoreMap = new Map(scoreResponse.scores.map((s) => [s.key, s]));
              for (const att of attachmentsToScore) {
                const scoreResult = scoreMap.get(att.key);
                if (scoreResult) {
                  allCandidates.push({
                    id: att.key,
                    sourceType: att._sourceType,
                    score: scoreResult.score,
                    scoreLabel: scoreResult.label,
                    scoreReasons: att._sourceType === "gmail_email"
                      ? [...scoreResult.reasons, "Possible mail invoice"]
                      : scoreResult.reasons,
                    messageId: att._messageId,
                    attachmentId: att._attachmentId,
                    attachmentFilename: att.filename,
                    emailSubject: att.emailSubject,
                    emailFrom: att.emailFrom,
                    emailDate: att.emailDate,
                    integrationId: att.integrationId,
                    classification: att._classification,
                  });
                }
              }
            } catch (scoreErr) {
              console.error("[searchGmailAttachments] Error scoring attachments:", scoreErr);
            }
          }
        } catch (err) {
          console.error(
            `[searchGmailAttachments] Error searching Gmail integration ${integrationDoc.id}:`,
            err
          );
        }
      }
    }

    // Sort by score
    allCandidates.sort((a, b) => b.score - a.score);

    // Deduplicate by messageId + attachmentId
    const seen = new Set<string>();
    const dedupedCandidates = allCandidates.filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });

    const topCandidates = dedupedCandidates.slice(0, 15);

    return {
      searchType: "gmail_attachments",
      searchedTransaction: {
        id: transactionId,
        name: tx.name,
        partner: tx.partner,
        amount: tx.amount,
        date: txDate.toISOString(),
      },
      queriesUsed: searchQueries,
      summary:
        dedupedCandidates.length > 0
          ? `Searched "${searchQueries.join('", "')}" - Found ${dedupedCandidates.length} attachments. Top: "${topCandidates[0]?.attachmentFilename || topCandidates[0]?.emailSubject}" (${topCandidates[0]?.score}%)`
          : `Searched "${searchQueries.join('", "')}" - No attachments found`,
      candidates: topCandidates.map((c) => ({
        ...c,
        scoreDetails: `${c.score}% - ${c.scoreReasons?.join(", ") || "no reasons"}`,
      })),
      totalFound: dedupedCandidates.length,
      integrationCount: integrationsSnapshot.size,
      integrationsNeedingReauth: integrationsNeedingReauth.length > 0 ? integrationsNeedingReauth : undefined,
    };
  },
  {
    name: "searchGmailAttachments",
    description:
      "Search Gmail for email attachments that might be receipts for a transaction. Returns emails with attachments and classification. Does NOT download.",
    schema: z.object({
      transactionId: z.string().describe("The transaction ID to find attachments for"),
      query: z
        .string()
        .optional()
        .describe("Custom Gmail search query. If not provided, auto-generates based on transaction."),
    }),
  }
);

// ============================================================================
// Connect File to Transaction
// ============================================================================

export const connectFileToTransactionTool = tool(
  async ({ fileId, transactionId, confidence }, config) => {
    const userId = config?.configurable?.userId;

    if (!userId) {
      return { error: "User ID not provided" };
    }

    // Verify file exists and belongs to user
    const fileDoc = await db.collection("files").doc(fileId).get();
    if (!fileDoc.exists || fileDoc.data()?.userId !== userId) {
      return { error: "File not found" };
    }

    // Verify transaction exists and belongs to user
    const txDoc = await db.collection("transactions").doc(transactionId).get();
    if (!txDoc.exists || txDoc.data()?.userId !== userId) {
      return { error: "Transaction not found" };
    }

    const file = fileDoc.data()!;
    const tx = txDoc.data()!;

    // Check if already connected
    const existingConnection = await db
      .collection("fileConnections")
      .where("fileId", "==", fileId)
      .where("transactionId", "==", transactionId)
      .where("userId", "==", userId)
      .get();

    if (!existingConnection.empty) {
      return {
        success: true,
        alreadyConnected: true,
        message: `File "${file.fileName}" was already connected to this transaction.`,
      };
    }

    // Create connection
    const now = new Date();
    const batch = db.batch();

    // 1. Create fileConnection document
    const connectionRef = db.collection("fileConnections").doc();
    batch.set(connectionRef, {
      fileId,
      transactionId,
      userId,
      connectionType: "manual",
      matchConfidence: confidence || null,
      sourceType: "agent_search",
      createdAt: now,
    });

    // 2. Update file's transactionIds array
    batch.update(fileDoc.ref, {
      transactionIds: [...(file.transactionIds || []), transactionId],
      updatedAt: now,
    });

    // 3. Update transaction's fileIds array
    batch.update(txDoc.ref, {
      fileIds: [...(tx.fileIds || []), fileId],
      updatedAt: now,
    });

    await batch.commit();

    return {
      success: true,
      connectionId: connectionRef.id,
      fileName: file.fileName,
      message: `Connected "${file.fileName}" to transaction.`,
    };
  },
  {
    name: "connectFileToTransaction",
    description:
      "Connect an existing local file to a transaction. Use when searchLocalFiles finds a good match.",
    schema: z.object({
      fileId: z.string().describe("The file ID from searchLocalFiles results"),
      transactionId: z.string().describe("The transaction ID to connect to"),
      confidence: z.number().optional().describe("Match confidence score (0-100)"),
    }),
  }
);

// ============================================================================
// Export all search tools
// ============================================================================

export const SEARCH_TOOLS = [
  generateSearchSuggestionsTool,
  searchLocalFilesTool,
  connectFileToTransactionTool,
  searchGmailAttachmentsTool,
];
