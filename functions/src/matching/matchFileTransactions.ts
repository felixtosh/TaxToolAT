/**
 * Cloud Function: Match File to Transactions
 *
 * Triggered when a file's extraction completes.
 * Scores potential transaction matches and creates auto-connections.
 */

import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  SCORING_CONFIG,
  scoreTransaction,
  formatScoreBreakdown,
  TransactionMatchScore,
  TransactionMatchSource,
} from "./transactionScoring";

const db = getFirestore();

// Use shared config
const CONFIG = SCORING_CONFIG;

// === Types ===

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

// === Email Domain Learning ===

/**
 * Learn email domain from successful auto-match.
 * When a file with a Gmail sender is matched to a transaction with a partner,
 * we add the sender domain to the partner's known email domains.
 *
 * This enables future auto-matching: files from known domains get a confidence boost.
 */
async function learnEmailDomainFromMatch(
  fileData: FirebaseFirestore.DocumentData,
  transactionId: string
): Promise<void> {
  // Only learn from Gmail files with sender domain
  if (!fileData.gmailSenderDomain) {
    return;
  }

  // Get transaction to check for partner
  const txDoc = await db.collection("transactions").doc(transactionId).get();
  if (!txDoc.exists) {
    return;
  }

  const txData = txDoc.data()!;
  if (!txData.partnerId) {
    return;
  }

  const domain = fileData.gmailSenderDomain.toLowerCase().trim();

  // Get partner and check if domain already known
  const partnerDoc = await db.collection("partners").doc(txData.partnerId).get();
  if (!partnerDoc.exists) {
    return;
  }

  const partnerData = partnerDoc.data()!;
  const existingDomains: string[] = partnerData.emailDomains || [];

  if (existingDomains.includes(domain)) {
    return; // Already known
  }

  // Add domain to partner
  await partnerDoc.ref.update({
    emailDomains: FieldValue.arrayUnion(domain),
    emailDomainsUpdatedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });

  console.log(
    `[EmailDomain] Learned domain "${domain}" for partner ${txData.partnerId} ` +
    `from file ${fileData.fileName} matched to transaction ${transactionId}`
  );
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

export async function runTransactionMatching(
  fileId: string,
  fileData: FirebaseFirestore.DocumentData
): Promise<void> {
  // Skip soft-deleted files
  if (fileData.deletedAt) {
    console.log(`[TxMatch] Skipping deleted file: ${fileId}`);
    return;
  }

  const userId = fileData.userId;
  const t0 = Date.now();

  // Log file info
  const fileAmount = fileData.extractedAmount != null ? (fileData.extractedAmount / 100).toFixed(2) : "N/A";
  const fileDate = fileData.extractedDate ? fileData.extractedDate.toDate().toISOString().split("T")[0] : "N/A";
  console.log(`[TxMatch] File: ${fileData.fileName || fileId}`);
  console.log(`[TxMatch]   Amount: ${fileAmount} ${fileData.extractedCurrency || "EUR"}, Date: ${fileDate}`);
  console.log(`[TxMatch]   Extracted partner: "${fileData.extractedPartner || "none"}"`);
  console.log(`[TxMatch]   Assigned partnerId: ${fileData.partnerId || "none"}`);

  // Get candidate transactions (within date range)
  let transactions: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  let dateRangeStr = "";

  if (fileData.extractedDate) {
    const centerDate = fileData.extractedDate.toDate();
    const startDate = new Date(centerDate);
    startDate.setDate(startDate.getDate() - CONFIG.DATE_RANGE_DAYS);
    const endDate = new Date(centerDate);
    endDate.setDate(endDate.getDate() + CONFIG.DATE_RANGE_DAYS);
    dateRangeStr = `${startDate.toISOString().split("T")[0]} to ${endDate.toISOString().split("T")[0]}`;

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
    dateRangeStr = "recent (no file date)";
    const snapshot = await db
      .collection("transactions")
      .where("userId", "==", userId)
      .orderBy("date", "desc")
      .limit(200)
      .get();

    transactions = snapshot.docs;
  }

  console.log(`[TxMatch] Found ${transactions.length} candidate transactions (${dateRangeStr})`);

  // If there's a precision search hint with a transaction ID, ensure it's in the candidate set
  // The hint means automation already validated this transaction is relevant (by amount/partner search)
  // but it might be outside the date range
  if (fileData.precisionSearchHint?.transactionId) {
    const hintedTxId = fileData.precisionSearchHint.transactionId;
    const alreadyIncluded = transactions.some(doc => doc.id === hintedTxId);

    if (!alreadyIncluded) {
      const hintedTxDoc = await db.collection("transactions").doc(hintedTxId).get();
      if (hintedTxDoc.exists && hintedTxDoc.data()?.userId === userId) {
        transactions.push(hintedTxDoc as FirebaseFirestore.QueryDocumentSnapshot);
        console.log(`[TxMatch] Added hinted transaction ${hintedTxId} to candidates (was outside date range)`);
      }
    }
  }

  if (transactions.length === 0) {
    await db.collection("files").doc(fileId).update({
      transactionMatchComplete: true,
      transactionMatchedAt: Timestamp.now(),
      transactionSuggestions: [],
      updatedAt: Timestamp.now(),
    });
    console.log(`[TxMatch] No transactions found, marking complete`);
    return;
  }

  // Fetch partner aliases if file has an assigned partner
  let partnerAliases: string[] = [];
  if (fileData.partnerId) {
    try {
      const partnerDoc = await db.collection("partners").doc(fileData.partnerId).get();
      if (partnerDoc.exists) {
        const partnerData = partnerDoc.data()!;
        // Collect partner name + all aliases for matching
        partnerAliases = [
          partnerData.name,
          ...(partnerData.aliases || []),
        ].filter(Boolean);
        console.log(`[TxMatch] Partner aliases: [${partnerAliases.map(a => `"${a}"`).join(", ")}]`);
      }
    } catch (error) {
      console.warn("[TxMatch] Failed to fetch partner aliases:", error);
    }
  }

  // Exclude already connected transactions and transactions that rejected this file
  const connectedIds = new Set(fileData.transactionIds || []);
  let rejectedCount = 0;

  // Filter out transactions that have rejected this file
  const eligibleTransactions = transactions.filter((doc) => {
    if (connectedIds.has(doc.id)) return false;
    const txData = doc.data();
    const rejectedFileIds: string[] = txData.rejectedFileIds || [];
    if (rejectedFileIds.includes(fileId)) {
      rejectedCount++;
      return false;
    }
    return true;
  });

  const candidateCount = eligibleTransactions.length;
  console.log(`[TxMatch] Scoring ${candidateCount} transactions (${connectedIds.size} connected, ${rejectedCount} rejected this file)`);

  // Score each transaction
  const allScores = eligibleTransactions
    .map((doc) => {
      const txData = doc.data();
      return scoreTransaction(
        {
          extractedAmount: fileData.extractedAmount,
          extractedCurrency: fileData.extractedCurrency,
          extractedDate: fileData.extractedDate,
          extractedPartner: fileData.extractedPartner,
          extractedIban: fileData.extractedIban,
          extractedText: fileData.extractedText,
          partnerId: fileData.partnerId,
          precisionSearchHint: fileData.precisionSearchHint,
        },
        {
          id: doc.id,
          amount: txData.amount,
          date: txData.date,
          currency: txData.currency,
          name: txData.name,
          partner: txData.partner,
          partnerName: txData.partnerName,
          partnerId: txData.partnerId,
          partnerIban: txData.partnerIban,
          reference: txData.reference,
        },
        partnerAliases
      );
    });

  const matches = allScores
    .filter((m) => m.confidence >= CONFIG.SUGGESTION_THRESHOLD)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, CONFIG.MAX_SUGGESTIONS);

  // Helper to format score breakdown (using shared function)
  const formatBreakdown = (m: TransactionMatchScore) => formatScoreBreakdown(m.breakdown);

  // Log top matches with breakdown
  if (matches.length > 0) {
    console.log(`[TxMatch] Top ${matches.length} matches:`);
    for (const m of matches.slice(0, 5)) {
      const txAmount = (m.preview.amount / 100).toFixed(2);
      const txDate = m.preview.date.toDate().toISOString().split("T")[0];
      const breakdown = formatBreakdown(m);
      console.log(`[TxMatch]   ${m.confidence}% - "${m.preview.name}" | ${txAmount} ${m.preview.currency} | ${txDate}`);
      console.log(`[TxMatch]       Breakdown: ${breakdown}`);
    }
  } else {
    // Log best non-qualifying match for debugging
    const bestNonMatch = allScores.sort((a, b) => b.confidence - a.confidence)[0];
    if (bestNonMatch) {
      const txAmount = (bestNonMatch.preview.amount / 100).toFixed(2);
      const txDate = bestNonMatch.preview.date.toDate().toISOString().split("T")[0];
      const breakdown = formatBreakdown(bestNonMatch);
      console.log(`[TxMatch] No matches above ${CONFIG.SUGGESTION_THRESHOLD}%. Best was ${bestNonMatch.confidence}%:`);
      console.log(`[TxMatch]   "${bestNonMatch.preview.name}" | ${txAmount} ${bestNonMatch.preview.currency} | ${txDate}`);
      console.log(`[TxMatch]   Breakdown: ${breakdown}`);
    } else {
      console.log(`[TxMatch] No matches found.`);
    }
  }

  // Separate auto-matches from suggestions
  const potentialAutoMatches = matches.filter((m) => m.confidence >= CONFIG.AUTO_MATCH_THRESHOLD);

  // Filter out auto-matches for transactions that are already "covered"
  // This prevents over-matching (e.g., 6 monthly invoices all matching one transaction)
  const autoMatches: typeof potentialAutoMatches = [];
  for (const match of potentialAutoMatches) {
    const isCovered = await isTransactionCovered(
      match.transactionId,
      match.preview.amount
    );
    if (isCovered) {
      console.log(
        `[TxMatch] Skipping auto-match for ${match.transactionId} (already covered by existing files)`
      );
    } else {
      autoMatches.push(match);
    }
  }

  // Build suggestions for storage (still show covered transactions as suggestions,
  // but mark them so UI can indicate they're already covered)
  const suggestions: TransactionSuggestion[] = matches.map((m) => ({
    transactionId: m.transactionId,
    confidence: m.confidence,
    matchSources: m.matchSources,
    preview: m.preview,
  }));

  const batch = db.batch();
  const fileRef = db.collection("files").doc(fileId);
  const newTransactionIds: string[] = [];

  // Create auto-connections (only for non-covered transactions)
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

    // Learn email domain from Gmail files (non-blocking)
    learnEmailDomainFromMatch(fileData, match.transactionId).catch((err) => {
      console.error(`Failed to learn email domain for tx ${match.transactionId}:`, err);
    });

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

  const elapsed = Date.now() - t0;
  console.log(
    `[TxMatch] Complete for ${fileData.fileName || fileId}: ` +
      `${autoMatches.length} auto-matched, ${suggestions.length} suggestions (${elapsed}ms)`
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

// === Helper: Check for manual transaction connections ===

async function hasManualTransactionConnections(fileId: string): Promise<boolean> {
  const manualConnections = await db
    .collection("fileConnections")
    .where("fileId", "==", fileId)
    .where("connectionType", "==", "manual")
    .limit(1)
    .get();

  return !manualConnections.empty;
}

// === Helper: Check if transaction is already "covered" by existing files ===

/**
 * Checks if a transaction already has enough files matched to cover its amount.
 * This prevents over-matching (e.g., 6 files matched to a single transaction
 * when only 1 file should match).
 *
 * @param transactionId - Transaction to check
 * @param transactionAmount - Transaction amount in cents (absolute value)
 * @param tolerance - Percentage tolerance (default 10% - transaction is "covered" if
 *                   sum of file amounts is within 10% of transaction amount)
 * @returns true if transaction is covered and shouldn't receive more files
 */
async function isTransactionCovered(
  transactionId: string,
  transactionAmount: number,
  tolerance: number = 0.1
): Promise<boolean> {
  // Get existing file connections for this transaction
  const connectionsSnapshot = await db
    .collection("fileConnections")
    .where("transactionId", "==", transactionId)
    .get();

  if (connectionsSnapshot.empty) {
    return false; // No files connected, not covered
  }

  // Get the connected files to sum their amounts
  const fileIds = connectionsSnapshot.docs.map((doc) => doc.data().fileId);

  // Firestore 'in' queries have a limit of 30, batch if needed
  let totalFileAmount = 0;
  for (let i = 0; i < fileIds.length; i += 30) {
    const batch = fileIds.slice(i, i + 30);
    const filesSnapshot = await db
      .collection("files")
      .where("__name__", "in", batch)
      .get();

    for (const fileDoc of filesSnapshot.docs) {
      const fileData = fileDoc.data();
      if (fileData.extractedAmount != null) {
        totalFileAmount += Math.abs(fileData.extractedAmount);
      }
    }
  }

  const absTxAmount = Math.abs(transactionAmount);

  // Transaction is "covered" if file total is within tolerance of transaction amount
  // or exceeds it
  const coverageRatio = totalFileAmount / absTxAmount;
  const isCovered = coverageRatio >= (1 - tolerance);

  if (isCovered) {
    console.log(
      `[TxMatch] Transaction ${transactionId} is already covered: ` +
      `${(totalFileAmount / 100).toFixed(2)} / ${(absTxAmount / 100).toFixed(2)} ` +
      `(${(coverageRatio * 100).toFixed(0)}%)`
    );
  }

  return isCovered;
}

// === Firestore Trigger ===

/**
 * Triggered when a file document is updated.
 * Runs transaction matching:
 * 1. After partner matching completes (initial run)
 * 2. When partnerId changes (re-run to update match scores)
 */
export const matchFileTransactions = onDocumentUpdated(
  {
    document: "files/{fileId}",
    region: "europe-west1",
    timeoutSeconds: 60,
    memory: "256MiB",
    maxInstances: 5, // Limit concurrency to prevent queue overload
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const fileId = event.params.fileId;

    if (!before || !after) return;

    // Case 1: Partner matching just completed (initial run)
    const partnerMatchJustCompleted =
      !before.partnerMatchComplete &&
      after.partnerMatchComplete &&
      !after.extractionError;

    // Case 2: Partner ID changed (re-run)
    const partnerIdChanged =
      before.partnerId !== after.partnerId &&
      after.transactionMatchComplete === true; // Only re-run if already ran once

    // Case 3: Precision search requested re-matching (transactionMatchComplete flipped to false)
    const precisionSearchRequested =
      before.transactionMatchComplete === true &&
      after.transactionMatchComplete === false &&
      after.precisionSearchHint;

    // Determine if we should run
    let shouldRun = false;
    let reason = "";

    if (partnerMatchJustCompleted && !after.transactionMatchComplete) {
      shouldRun = true;
      reason = "partner_match_complete";
    } else if (precisionSearchRequested) {
      // Precision search added a hint and requested re-matching
      shouldRun = true;
      reason = "precision_search_hint";
    } else if (partnerIdChanged) {
      // Check for manual connections before re-running
      const hasManual = await hasManualTransactionConnections(fileId);
      if (!hasManual) {
        shouldRun = true;
        reason = "partner_changed";
        // Reset the file's transaction match state to trigger re-matching
        await db.collection("files").doc(fileId).update({
          transactionMatchComplete: false,
          transactionSuggestions: [],
          updatedAt: Timestamp.now(),
        });
        // Re-fetch the updated file data
        const updatedDoc = await db.collection("files").doc(fileId).get();
        if (updatedDoc.exists) {
          Object.assign(after, updatedDoc.data());
        }
      } else {
        console.log(`Skipping transaction re-matching for file ${fileId}: has manual connections`);
      }
    }

    if (!shouldRun) {
      return;
    }

    console.log(`Starting transaction matching for file: ${fileId} (reason: ${reason})`);

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
