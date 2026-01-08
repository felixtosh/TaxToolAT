/**
 * Cloud Function: Match Files for Partner
 *
 * Searches for files matching a partner's file source patterns
 * and connects them to transactions assigned to that partner.
 *
 * Called:
 * 1. After learnPartnerPatterns completes (chained)
 * 2. After partner is manually assigned to a transaction
 * 3. Manually via callable function
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

const db = getFirestore();

// === Configuration ===

const CONFIG = {
  /** Minimum confidence for auto-matching (creates connection) */
  AUTO_MATCH_THRESHOLD: 85,
  /** Minimum confidence to show as suggestion */
  SUGGESTION_THRESHOLD: 50,
  /** Days to search before transaction date */
  DATE_RANGE_DAYS_BEFORE: 30,
  /** Days to search after transaction date */
  DATE_RANGE_DAYS_AFTER: 7,
  /** Max files to process per partner */
  MAX_FILES_PER_PARTNER: 100,
  /** Max transactions to process per partner */
  MAX_TRANSACTIONS_PER_PARTNER: 50,
};

// === Types ===

interface FileSourcePattern {
  sourceType: "local" | "gmail";
  pattern: string;
  integrationId?: string;
  confidence: number;
  usageCount: number;
  sourceTransactionIds: string[];
}

interface FileMatchScore {
  fileId: string;
  transactionId: string;
  confidence: number;
  matchReasons: string[];
}

interface MatchFilesForPartnerRequest {
  partnerId: string;
  transactionIds?: string[]; // Optional: specific transactions to match
}

interface MatchFilesForPartnerResponse {
  processed: number;
  autoMatched: number;
  suggested: number;
}

// === Scoring Functions ===

/**
 * Match a glob-style pattern against text
 */
function globMatch(pattern: string, text: string): boolean {
  if (!pattern || !text) return false;

  const normalizedText = text.toLowerCase();
  const normalizedPattern = pattern.toLowerCase();

  const regexPattern = normalizedPattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");

  try {
    return new RegExp(`^${regexPattern}$`).test(normalizedText);
  } catch {
    return false;
  }
}

/**
 * Score how well a file matches a transaction
 */
function scoreFileForTransaction(
  fileData: FirebaseFirestore.DocumentData,
  txData: FirebaseFirestore.DocumentData,
  partnerPatterns: FileSourcePattern[]
): { score: number; matchReasons: string[] } {
  let score = 0;
  const matchReasons: string[] = [];

  // 1. Amount match (0-40)
  if (fileData.extractedAmount != null && txData.amount != null) {
    const fileAmount = Math.abs(fileData.extractedAmount);
    const txAmount = Math.abs(txData.amount);

    if (fileAmount > 0 && txAmount > 0) {
      const diff = Math.abs(fileAmount - txAmount) / txAmount;

      if (diff === 0) {
        score += 40;
        matchReasons.push("Exact amount");
      } else if (diff <= 0.01) {
        score += 38;
        matchReasons.push("Amount ±1%");
      } else if (diff <= 0.05) {
        score += 30;
        matchReasons.push("Amount ±5%");
      } else if (diff <= 0.1) {
        score += 20;
        matchReasons.push("Amount ±10%");
      }
    }
  }

  // 2. Date proximity (0-25)
  if (fileData.extractedDate && txData.date) {
    const fileDate = fileData.extractedDate.toDate();
    const txDate = txData.date.toDate();
    const daysDiff = Math.abs(
      Math.floor((fileDate.getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24))
    );

    if (daysDiff === 0) {
      score += 25;
      matchReasons.push("Same day");
    } else if (daysDiff <= 3) {
      score += 22;
      matchReasons.push("Within 3 days");
    } else if (daysDiff <= 7) {
      score += 15;
      matchReasons.push("Within 7 days");
    } else if (daysDiff <= 14) {
      score += 8;
      matchReasons.push("Within 14 days");
    } else if (daysDiff <= 30) {
      score += 3;
      matchReasons.push("Within 30 days");
    }
  }

  // 3. Partner match (already guaranteed since we filter by partner) (0-20)
  // Both file and transaction are assigned to same partner
  if (fileData.partnerId && txData.partnerId && fileData.partnerId === txData.partnerId) {
    score += 20;
    matchReasons.push("Same partner");
  }

  // 4. Source pattern match (0-10)
  if (partnerPatterns.length > 0) {
    const fileName = fileData.fileName?.toLowerCase() || "";
    const matchesPattern = partnerPatterns.some(
      (p) => p.sourceType === "local" && globMatch(p.pattern, fileName)
    );
    if (matchesPattern) {
      score += 10;
      matchReasons.push("Matches source pattern");
    }
  }

  // 5. File is likely a receipt (0-5)
  // PDFs and images are more likely receipts
  const mimeType = fileData.fileType || "";
  if (mimeType === "application/pdf" || mimeType.startsWith("image/")) {
    score += 5;
    matchReasons.push("Likely receipt");
  }

  return { score, matchReasons };
}

// === Main Matching Logic ===

/**
 * Match files to transactions for a specific partner
 * Called after partner pattern learning or when partner is assigned
 */
export async function matchFilesForPartnerInternal(
  userId: string,
  partnerId: string,
  specificTransactionIds?: string[]
): Promise<MatchFilesForPartnerResponse> {
  console.log(`Starting file matching for partner ${partnerId} (user: ${userId})`);

  // 1. Get partner with file source patterns
  const partnerDoc = await db.collection("partners").doc(partnerId).get();
  if (!partnerDoc.exists) {
    console.log(`Partner ${partnerId} not found`);
    return { processed: 0, autoMatched: 0, suggested: 0 };
  }

  const partnerData = partnerDoc.data()!;
  if (partnerData.userId !== userId) {
    console.log(`Partner ${partnerId} doesn't belong to user ${userId}`);
    return { processed: 0, autoMatched: 0, suggested: 0 };
  }

  const partnerName = partnerData.name || "Unknown";
  const fileSourcePatterns: FileSourcePattern[] = partnerData.fileSourcePatterns || [];

  console.log(`Partner ${partnerName} has ${fileSourcePatterns.length} file source patterns`);

  // 2. Get transactions with this partner that need files
  let transactionsQuery = db
    .collection("transactions")
    .where("userId", "==", userId)
    .where("partnerId", "==", partnerId);

  let transactions: FirebaseFirestore.QueryDocumentSnapshot[];

  if (specificTransactionIds && specificTransactionIds.length > 0) {
    // Fetch specific transactions
    const docs = await Promise.all(
      specificTransactionIds.map((id) => db.collection("transactions").doc(id).get())
    );
    transactions = docs.filter(
      (doc) =>
        doc.exists &&
        doc.data()?.userId === userId &&
        doc.data()?.partnerId === partnerId
    ) as FirebaseFirestore.QueryDocumentSnapshot[];
  } else {
    // Get all transactions for this partner
    const snapshot = await transactionsQuery
      .limit(CONFIG.MAX_TRANSACTIONS_PER_PARTNER)
      .get();
    transactions = snapshot.docs;
  }

  // Filter to transactions without files (or without noReceiptCategoryId)
  const unfiledTransactions = transactions.filter((doc) => {
    const data = doc.data();
    const hasFiles = data.fileIds && data.fileIds.length > 0;
    const hasNoReceiptCategory = !!data.noReceiptCategoryId;
    return !hasFiles && !hasNoReceiptCategory;
  });

  if (unfiledTransactions.length === 0) {
    console.log(`No unfiled transactions for partner ${partnerName}`);
    return { processed: 0, autoMatched: 0, suggested: 0 };
  }

  console.log(`Found ${unfiledTransactions.length} unfiled transactions for partner ${partnerName}`);

  // 3. Get candidate files
  // Strategy: Search for files with same partner OR unassigned files
  // within date range of the transactions

  // Find date range across all transactions
  const txDates = unfiledTransactions.map((doc) => {
    const date = doc.data().date;
    return date ? date.toDate() : new Date();
  });
  const minTxDate = new Date(Math.min(...txDates.map((d) => d.getTime())));
  const maxTxDate = new Date(Math.max(...txDates.map((d) => d.getTime())));

  // Expand date range
  const searchStartDate = new Date(minTxDate);
  searchStartDate.setDate(searchStartDate.getDate() - CONFIG.DATE_RANGE_DAYS_BEFORE);
  const searchEndDate = new Date(maxTxDate);
  searchEndDate.setDate(searchEndDate.getDate() + CONFIG.DATE_RANGE_DAYS_AFTER);

  // Query files: same partner OR unassigned, within date range, not connected
  const [partnerFilesSnapshot, unassignedFilesSnapshot] = await Promise.all([
    // Files assigned to this partner
    db
      .collection("files")
      .where("userId", "==", userId)
      .where("partnerId", "==", partnerId)
      .where("extractionComplete", "==", true)
      .limit(CONFIG.MAX_FILES_PER_PARTNER)
      .get(),
    // Unassigned files within date range
    db
      .collection("files")
      .where("userId", "==", userId)
      .where("extractionComplete", "==", true)
      .where("extractedDate", ">=", Timestamp.fromDate(searchStartDate))
      .where("extractedDate", "<=", Timestamp.fromDate(searchEndDate))
      .limit(CONFIG.MAX_FILES_PER_PARTNER)
      .get(),
  ]);

  // Merge and deduplicate files
  const fileMap = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();

  for (const doc of partnerFilesSnapshot.docs) {
    fileMap.set(doc.id, doc);
  }

  for (const doc of unassignedFilesSnapshot.docs) {
    const data = doc.data();
    // Only include unassigned files (no partnerId or partnerId matches)
    if (!data.partnerId || data.partnerId === partnerId) {
      fileMap.set(doc.id, doc);
    }
  }

  // Filter to unconnected files
  const unconnectedFiles = Array.from(fileMap.values()).filter((doc) => {
    const data = doc.data();
    return !data.transactionIds || data.transactionIds.length === 0;
  });

  if (unconnectedFiles.length === 0) {
    console.log(`No candidate files found for partner ${partnerName}`);
    return { processed: 0, autoMatched: 0, suggested: 0 };
  }

  console.log(`Found ${unconnectedFiles.length} candidate files to match`);

  // 4. Score all file-transaction pairs
  const allScores: FileMatchScore[] = [];

  for (const fileDoc of unconnectedFiles) {
    const fileData = fileDoc.data();

    for (const txDoc of unfiledTransactions) {
      const txData = txDoc.data();

      const { score, matchReasons } = scoreFileForTransaction(
        fileData,
        txData,
        fileSourcePatterns
      );

      if (score >= CONFIG.SUGGESTION_THRESHOLD) {
        allScores.push({
          fileId: fileDoc.id,
          transactionId: txDoc.id,
          confidence: score,
          matchReasons,
        });
      }
    }
  }

  if (allScores.length === 0) {
    console.log(`No file-transaction matches above threshold for partner ${partnerName}`);
    return { processed: unfiledTransactions.length, autoMatched: 0, suggested: 0 };
  }

  // Sort by confidence
  allScores.sort((a, b) => b.confidence - a.confidence);

  console.log(`Found ${allScores.length} potential matches, top score: ${allScores[0]?.confidence}`);

  // 5. Create connections for auto-matches
  // Greedy matching: each file to at most one transaction, each transaction to at most one file
  const usedFiles = new Set<string>();
  const usedTransactions = new Set<string>();
  const batch = db.batch();
  let batchCount = 0;
  let autoMatched = 0;
  let suggested = 0;

  for (const match of allScores) {
    if (usedFiles.has(match.fileId) || usedTransactions.has(match.transactionId)) {
      continue;
    }

    if (match.confidence >= CONFIG.AUTO_MATCH_THRESHOLD) {
      // Auto-connect
      const connectionRef = db.collection("fileConnections").doc();
      batch.set(connectionRef, {
        fileId: match.fileId,
        transactionId: match.transactionId,
        userId,
        connectionType: "auto_matched",
        matchSources: match.matchReasons.map((r) => r.toLowerCase().replace(/\s+/g, "_")),
        matchConfidence: match.confidence,
        createdAt: Timestamp.now(),
      });

      // Update file's transactionIds
      const fileRef = db.collection("files").doc(match.fileId);
      batch.update(fileRef, {
        transactionIds: FieldValue.arrayUnion(match.transactionId),
        updatedAt: Timestamp.now(),
      });

      // Update transaction's fileIds
      const txRef = db.collection("transactions").doc(match.transactionId);
      batch.update(txRef, {
        fileIds: FieldValue.arrayUnion(match.fileId),
        updatedAt: Timestamp.now(),
      });

      usedFiles.add(match.fileId);
      usedTransactions.add(match.transactionId);
      autoMatched++;
      batchCount += 3;

      if (batchCount >= 450) {
        await batch.commit();
        console.log(`Committed batch of ${batchCount} operations`);
        batchCount = 0;
      }
    } else {
      // Store as suggestion on the transaction (not auto-connected)
      // Note: For now, just counting. Could store suggestions if needed.
      suggested++;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  console.log(
    `File matching complete for partner ${partnerName}: ` +
      `${autoMatched} auto-matched, ${suggested} suggested`
  );

  // 6. Create notification if matches found
  if (autoMatched > 0) {
    try {
      await db.collection(`users/${userId}/notifications`).add({
        type: "file_partner_match",
        title: `Matched ${autoMatched} file${autoMatched !== 1 ? "s" : ""} to ${partnerName}`,
        message: `Based on your past behavior, I automatically connected ${autoMatched} receipt${autoMatched !== 1 ? "s" : ""} to transactions from ${partnerName}.`,
        createdAt: FieldValue.serverTimestamp(),
        readAt: null,
        context: {
          partnerId,
          partnerName,
          autoMatchCount: autoMatched,
          suggestionsCount: suggested,
        },
      });
    } catch (err) {
      console.error("Failed to create file matching notification:", err);
    }
  }

  return {
    processed: unfiledTransactions.length,
    autoMatched,
    suggested,
  };
}

// === Callable Function ===

/**
 * Callable function to manually trigger file matching for a partner
 */
export const matchFilesForPartner = onCall<MatchFilesForPartnerRequest>(
  {
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 60,
  },
  async (request): Promise<MatchFilesForPartnerResponse> => {
    // TODO: Use real auth when ready for multi-user
    const userId = "dev-user-123";
    const { partnerId, transactionIds } = request.data;

    if (!partnerId) {
      throw new HttpsError("invalid-argument", "partnerId is required");
    }

    return matchFilesForPartnerInternal(userId, partnerId, transactionIds);
  }
);
