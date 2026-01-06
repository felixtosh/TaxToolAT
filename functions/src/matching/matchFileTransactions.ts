/**
 * Cloud Function: Match File to Transactions
 *
 * Triggered when a file's extraction completes.
 * Scores potential transaction matches and creates auto-connections.
 */

import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

const db = getFirestore();

// === Configuration ===

const CONFIG = {
  /** Minimum confidence for auto-matching (creates connection) */
  AUTO_MATCH_THRESHOLD: 85,
  /** Minimum confidence to show as suggestion */
  SUGGESTION_THRESHOLD: 50,
  /** Days to search before/after file date */
  DATE_RANGE_DAYS: 30,
  /** Max suggestions to store per file */
  MAX_SUGGESTIONS: 5,
};

// === Types ===

type TransactionMatchSource =
  | "amount_exact"
  | "amount_close"
  | "date_exact"
  | "date_close"
  | "partner"
  | "iban"
  | "reference";

interface TransactionSuggestion {
  transactionId: string;
  confidence: number;
  matchSources: TransactionMatchSource[];
  preview: {
    date: Timestamp;
    amount: number;
    currency: string;
    name: string;
    partner: string | null;
  };
}

interface TransactionMatchScore {
  transactionId: string;
  confidence: number;
  matchSources: TransactionMatchSource[];
  preview: {
    date: Timestamp;
    amount: number;
    currency: string;
    name: string;
    partner: string | null;
  };
}

// === Scoring Functions ===

function normalizeIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}

function calculateAmountScore(
  fileAmount: number,
  txAmount: number
): { score: number; source: TransactionMatchSource | null } {
  const absFile = Math.abs(fileAmount);
  const absTx = Math.abs(txAmount);

  if (absFile === 0 || absTx === 0) {
    return { score: 0, source: null };
  }

  if (absFile === absTx) {
    return { score: 40, source: "amount_exact" };
  }

  const difference = Math.abs(absFile - absTx);
  const tolerance = absFile;

  if (difference <= tolerance * 0.01) {
    return { score: 38, source: "amount_close" };
  }
  if (difference <= tolerance * 0.05) {
    return { score: 30, source: "amount_close" };
  }
  if (difference <= tolerance * 0.1) {
    return { score: 20, source: "amount_close" };
  }

  return { score: 0, source: null };
}

function calculateDateScore(
  fileDate: Date,
  txDate: Date
): { score: number; source: TransactionMatchSource | null } {
  const daysDiff = Math.abs(
    Math.floor((fileDate.getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24))
  );

  if (daysDiff === 0) return { score: 25, source: "date_exact" };
  if (daysDiff <= 3) return { score: 22, source: "date_close" };
  if (daysDiff <= 7) return { score: 15, source: "date_close" };
  if (daysDiff <= 14) return { score: 8, source: "date_close" };
  if (daysDiff <= 30) return { score: 3, source: "date_close" };

  return { score: 0, source: null };
}

function calculateReferenceScore(
  extractedText: string,
  reference: string,
  currentDateScore: number
): { score: number; dateBonus: number; source: TransactionMatchSource | null } {
  if (!reference || reference.length < 3) {
    return { score: 0, dateBonus: 0, source: null };
  }

  const normalizedText = extractedText.toLowerCase();
  const normalizedRef = reference.toLowerCase();

  if (normalizedText.includes(normalizedRef)) {
    const dateBonus = currentDateScore < 15 ? 10 : 0;
    return { score: 5, dateBonus, source: "reference" };
  }

  return { score: 0, dateBonus: 0, source: null };
}

function scoreTransaction(
  fileData: FirebaseFirestore.DocumentData,
  txId: string,
  txData: FirebaseFirestore.DocumentData
): TransactionMatchScore {
  let amountScore = 0;
  let dateScore = 0;
  let partnerScore = 0;
  let ibanScore = 0;
  let referenceScore = 0;
  const matchSources: TransactionMatchSource[] = [];

  // 1. Amount scoring (0-40)
  if (fileData.extractedAmount != null) {
    const result = calculateAmountScore(fileData.extractedAmount, txData.amount);
    amountScore = result.score;
    if (result.source) matchSources.push(result.source);
  }

  // 2. Date scoring (0-25)
  if (fileData.extractedDate) {
    const result = calculateDateScore(
      fileData.extractedDate.toDate(),
      txData.date.toDate()
    );
    dateScore = result.score;
    if (result.source) matchSources.push(result.source);
  }

  // 3. Partner scoring (0-20)
  if (fileData.partnerId && txData.partnerId) {
    if (fileData.partnerId === txData.partnerId) {
      partnerScore = 20;
      matchSources.push("partner");
    }
  }

  // 4. IBAN scoring (0-10)
  if (fileData.extractedIban && txData.partnerIban) {
    const fileIban = normalizeIban(fileData.extractedIban);
    const txIban = normalizeIban(txData.partnerIban);
    if (fileIban === txIban) {
      ibanScore = 10;
      matchSources.push("iban");
    }
  }

  // 5. Reference scoring (0-5, with date bonus)
  if (fileData.extractedText && txData.reference) {
    const result = calculateReferenceScore(
      fileData.extractedText,
      txData.reference,
      dateScore
    );
    referenceScore = result.score;
    if (result.dateBonus) {
      dateScore = Math.min(25, dateScore + result.dateBonus);
    }
    if (result.source) matchSources.push(result.source);
  }

  const confidence = amountScore + dateScore + partnerScore + ibanScore + referenceScore;

  return {
    transactionId: txId,
    confidence,
    matchSources,
    preview: {
      date: txData.date,
      amount: txData.amount,
      currency: txData.currency || "EUR",
      name: txData.name || "",
      partner: txData.partner || null,
    },
  };
}

// === Partner Priority Resolution ===

type PartnerMatchedBy = "manual" | "suggestion" | "auto" | null;

function resolvePartnerConflict(
  filePartnerId: string | null,
  fileMatchedBy: PartnerMatchedBy,
  txPartnerId: string | null,
  txMatchedBy: PartnerMatchedBy
): { winnerId: string | null; source: "file" | "transaction" | null } {
  if (!filePartnerId && !txPartnerId) {
    return { winnerId: null, source: null };
  }

  if (filePartnerId && !txPartnerId) {
    return { winnerId: filePartnerId, source: "file" };
  }
  if (txPartnerId && !filePartnerId) {
    return { winnerId: txPartnerId, source: "transaction" };
  }

  const fileIsManual = fileMatchedBy === "manual";
  const txIsManual = txMatchedBy === "manual";

  if (fileIsManual && !txIsManual) {
    return { winnerId: filePartnerId!, source: "file" };
  }
  if (txIsManual && !fileIsManual) {
    return { winnerId: txPartnerId!, source: "transaction" };
  }

  if (fileIsManual && txIsManual) {
    return { winnerId: txPartnerId!, source: "transaction" };
  }

  // Both auto/suggestion - file wins
  return { winnerId: filePartnerId!, source: "file" };
}

// === Main Function ===

async function runTransactionMatching(
  fileId: string,
  fileData: FirebaseFirestore.DocumentData
): Promise<void> {
  const userId = fileData.userId;

  // Get candidate transactions (within date range)
  let transactions: FirebaseFirestore.QueryDocumentSnapshot[] = [];

  if (fileData.extractedDate) {
    const centerDate = fileData.extractedDate.toDate();
    const startDate = new Date(centerDate);
    startDate.setDate(startDate.getDate() - CONFIG.DATE_RANGE_DAYS);
    const endDate = new Date(centerDate);
    endDate.setDate(endDate.getDate() + CONFIG.DATE_RANGE_DAYS);

    const snapshot = await db
      .collection("transactions")
      .where("userId", "==", userId)
      .where("date", ">=", Timestamp.fromDate(startDate))
      .where("date", "<=", Timestamp.fromDate(endDate))
      .orderBy("date", "desc")
      .limit(500)
      .get();

    transactions = snapshot.docs;
  } else {
    // No date? Query recent transactions
    const snapshot = await db
      .collection("transactions")
      .where("userId", "==", userId)
      .orderBy("date", "desc")
      .limit(200)
      .get();

    transactions = snapshot.docs;
  }

  if (transactions.length === 0) {
    await db.collection("files").doc(fileId).update({
      transactionMatchComplete: true,
      transactionMatchedAt: Timestamp.now(),
      transactionSuggestions: [],
      updatedAt: Timestamp.now(),
    });
    console.log(`No transactions found for file ${fileId}`);
    return;
  }

  // Exclude already connected transactions
  const connectedIds = new Set(fileData.transactionIds || []);

  // Score each transaction
  const matches = transactions
    .filter((doc) => !connectedIds.has(doc.id))
    .map((doc) => scoreTransaction(fileData, doc.id, doc.data()))
    .filter((m) => m.confidence >= CONFIG.SUGGESTION_THRESHOLD)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, CONFIG.MAX_SUGGESTIONS);

  // Separate auto-matches from suggestions
  const autoMatches = matches.filter((m) => m.confidence >= CONFIG.AUTO_MATCH_THRESHOLD);

  // Build suggestions for storage
  const suggestions: TransactionSuggestion[] = matches.map((m) => ({
    transactionId: m.transactionId,
    confidence: m.confidence,
    matchSources: m.matchSources,
    preview: m.preview,
  }));

  const batch = db.batch();
  const fileRef = db.collection("files").doc(fileId);
  const newTransactionIds: string[] = [];

  // Create auto-connections
  for (const match of autoMatches) {
    const connectionRef = db.collection("fileConnections").doc();
    batch.set(connectionRef, {
      fileId,
      transactionId: match.transactionId,
      userId,
      connectionType: "auto_matched",
      matchSources: match.matchSources,
      matchConfidence: match.confidence,
      createdAt: Timestamp.now(),
    });

    // Update transaction's fileIds array
    const txRef = db.collection("transactions").doc(match.transactionId);
    batch.update(txRef, {
      fileIds: FieldValue.arrayUnion(fileId),
      updatedAt: Timestamp.now(),
    });

    newTransactionIds.push(match.transactionId);

    // Handle partner resolution for auto-matched transactions
    const txDoc = await db.collection("transactions").doc(match.transactionId).get();
    if (txDoc.exists) {
      const txData = txDoc.data()!;
      const resolution = resolvePartnerConflict(
        fileData.partnerId || null,
        fileData.partnerMatchedBy || null,
        txData.partnerId || null,
        txData.partnerMatchedBy || null
      );

      // If file's partner should win and transaction doesn't have it, update transaction
      if (
        resolution.source === "file" &&
        fileData.partnerId &&
        txData.partnerId !== fileData.partnerId
      ) {
        batch.update(txRef, {
          partnerId: fileData.partnerId,
          partnerType: fileData.partnerType,
          partnerMatchedBy: "auto",
          partnerMatchConfidence: fileData.partnerMatchConfidence || null,
        });
      }
    }
  }

  // Update file document
  const fileUpdate: Record<string, unknown> = {
    transactionMatchComplete: true,
    transactionMatchedAt: Timestamp.now(),
    transactionSuggestions: suggestions,
    updatedAt: Timestamp.now(),
  };

  if (newTransactionIds.length > 0) {
    fileUpdate.transactionIds = FieldValue.arrayUnion(...newTransactionIds);
  }

  batch.update(fileRef, fileUpdate);

  await batch.commit();

  console.log(
    `Transaction matching complete for file ${fileId}: ` +
      `${autoMatches.length} auto-matched, ${suggestions.length} suggestions`
  );

  // Create notification if matches found
  if (autoMatches.length > 0 || suggestions.length > 0) {
    try {
      await db.collection(`users/${userId}/notifications`).add({
        type: "file_transaction_match",
        title:
          autoMatches.length > 0
            ? `Matched ${autoMatches.length} transaction${autoMatches.length !== 1 ? "s" : ""} to file`
            : `Found ${suggestions.length} transaction suggestion${suggestions.length !== 1 ? "s" : ""}`,
        message:
          autoMatches.length > 0
            ? `Your uploaded file was automatically matched to ${autoMatches.length} transaction${autoMatches.length !== 1 ? "s" : ""}.${suggestions.length > autoMatches.length ? ` Review ${suggestions.length - autoMatches.length} more suggestions.` : ""}`
            : `Found potential transaction matches for your uploaded file. Please review and confirm.`,
        createdAt: FieldValue.serverTimestamp(),
        readAt: null,
        context: {
          fileId,
          autoMatchCount: autoMatches.length,
          suggestionCount: suggestions.length,
        },
      });
    } catch (err) {
      console.error("Failed to create notification:", err);
    }
  }
}

// === Firestore Trigger ===

/**
 * Triggered when a file document is updated.
 * Runs transaction matching after extraction completes.
 */
export const matchFileTransactions = onDocumentUpdated(
  {
    document: "files/{fileId}",
    region: "europe-west1",
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const fileId = event.params.fileId;

    if (!before || !after) return;

    // Only run when extraction just completed successfully
    const extractionJustCompleted =
      !before.extractionComplete &&
      after.extractionComplete &&
      !after.extractionError;

    // Skip if transaction matching already done
    if (!extractionJustCompleted || after.transactionMatchComplete) {
      return;
    }

    console.log(`Starting transaction matching for file: ${fileId}`);

    try {
      await runTransactionMatching(fileId, after);
    } catch (error) {
      console.error(`Transaction matching failed for file ${fileId}:`, error);
      // Mark as complete with no matches (don't block the process)
      await db.collection("files").doc(fileId).update({
        transactionMatchComplete: true,
        transactionMatchedAt: Timestamp.now(),
        transactionSuggestions: [],
        updatedAt: Timestamp.now(),
      });
    }
  }
);
