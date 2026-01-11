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

/**
 * Normalize a name for comparison (lowercase, remove common suffixes, trim)
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*(gmbh|ag|kg|ohg|ug|e\.?k\.?|inc\.?|ltd\.?|llc|co\.?)\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check if two names match (fuzzy comparison)
 * Scoring rationale:
 * - Exact match = 25 pts (same as partner ID match - high trust)
 * - Contains match = 18 pts (e.g., "Amazon" vs "Amazon EU S.a.r.l.")
 * - Word overlap = 12-15 pts (partial confidence)
 */
function namesMatch(name1: string, name2: string): { match: boolean; score: number } {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);

  // Exact match after normalization - treat as strong as partner ID match
  if (n1 === n2) {
    return { match: true, score: 25 };
  }

  // One contains the other (for partial matches like "Amazon" vs "Amazon EU S.a.r.l.")
  if (n1.includes(n2) || n2.includes(n1)) {
    return { match: true, score: 18 };
  }

  // Check for significant word overlap (at least 2 words match)
  const words1 = n1.split(" ").filter(w => w.length > 2);
  const words2 = n2.split(" ").filter(w => w.length > 2);
  const matchingWords = words1.filter(w => words2.some(w2 => w === w2 || w.includes(w2) || w2.includes(w)));

  if (matchingWords.length >= 2) {
    return { match: true, score: 15 };
  }
  if (matchingWords.length >= 1 && (words1.length <= 2 || words2.length <= 2)) {
    return { match: true, score: 12 };
  }

  return { match: false, score: 0 };
}

/**
 * Calculate partner score with multiple matching strategies:
 * 1. Partner ID match (strongest signal)
 * 2. Partner text match (file's extractedPartner vs transaction's name/partner)
 * 3. Partner alias match (check if transaction name matches any alias of file's assigned partner)
 */
function calculatePartnerScore(
  fileData: FirebaseFirestore.DocumentData,
  txData: FirebaseFirestore.DocumentData,
  partnerAliases?: string[]
): { score: number; source: TransactionMatchSource | null } {
  // 1. Direct partner ID match (strongest - both have partnerId assigned)
  if (fileData.partnerId && txData.partnerId && fileData.partnerId === txData.partnerId) {
    return { score: 25, source: "partner" };
  }

  // Get transaction's text name (could be in 'name', 'partner', or 'partnerName' field)
  const txName = txData.name || txData.partner || txData.partnerName || "";
  if (!txName) {
    return { score: 0, source: null };
  }

  // 2. Check file's extracted partner text against transaction name
  if (fileData.extractedPartner) {
    const result = namesMatch(fileData.extractedPartner, txName);
    if (result.match) {
      return { score: result.score, source: "partner" };
    }
  }

  // 3. Check partner aliases against transaction name
  if (partnerAliases && partnerAliases.length > 0) {
    for (const alias of partnerAliases) {
      const result = namesMatch(alias, txName);
      if (result.match) {
        return { score: result.score, source: "partner" };
      }
    }
  }

  return { score: 0, source: null };
}

interface ScoreBreakdown {
  amount: number;
  date: number;
  partner: number;
  iban: number;
  reference: number;
}

interface TransactionMatchScoreWithBreakdown extends TransactionMatchScore {
  breakdown: ScoreBreakdown;
}

function scoreTransaction(
  fileData: FirebaseFirestore.DocumentData,
  txId: string,
  txData: FirebaseFirestore.DocumentData,
  partnerAliases?: string[]
): TransactionMatchScoreWithBreakdown {
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

  // 3. Partner scoring (0-25 for ID match, 0-15 for text match)
  // Uses multiple strategies: ID match, extracted text match, alias match
  const partnerResult = calculatePartnerScore(fileData, txData, partnerAliases);
  partnerScore = partnerResult.score;
  if (partnerResult.source) matchSources.push(partnerResult.source);

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
    breakdown: {
      amount: amountScore,
      date: dateScore,
      partner: partnerScore,
      iban: ibanScore,
      reference: referenceScore,
    },
    preview: {
      date: txData.date,
      amount: txData.amount,
      currency: txData.currency || "EUR",
      name: txData.name || "",
      partner: txData.partner || null,
    },
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

  // Exclude already connected transactions
  const connectedIds = new Set(fileData.transactionIds || []);
  const candidateCount = transactions.length - connectedIds.size;
  console.log(`[TxMatch] Scoring ${candidateCount} transactions (${connectedIds.size} already connected)`);

  // Score each transaction
  const allScores = transactions
    .filter((doc) => !connectedIds.has(doc.id))
    .map((doc) => scoreTransaction(fileData, doc.id, doc.data(), partnerAliases));

  const matches = allScores
    .filter((m) => m.confidence >= CONFIG.SUGGESTION_THRESHOLD)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, CONFIG.MAX_SUGGESTIONS);

  // Helper to format score breakdown
  const formatBreakdown = (m: TransactionMatchScoreWithBreakdown) => {
    const parts: string[] = [];
    if (m.breakdown.amount > 0) parts.push(`amt:${m.breakdown.amount}`);
    if (m.breakdown.date > 0) parts.push(`date:${m.breakdown.date}`);
    if (m.breakdown.partner > 0) parts.push(`partner:${m.breakdown.partner}`);
    if (m.breakdown.iban > 0) parts.push(`iban:${m.breakdown.iban}`);
    if (m.breakdown.reference > 0) parts.push(`ref:${m.breakdown.reference}`);
    return parts.join(" + ");
  };

  // Log top matches with breakdown
  if (matches.length > 0) {
    console.log(`[TxMatch] Top ${matches.length} matches:`);
    for (const m of matches.slice(0, 5)) {
      const txAmount = (m.preview.amount / 100).toFixed(2);
      const txDate = m.preview.date.toDate().toISOString().split("T")[0];
      const breakdown = formatBreakdown(m as TransactionMatchScoreWithBreakdown);
      console.log(`[TxMatch]   ${m.confidence}% - "${m.preview.name}" | ${txAmount} ${m.preview.currency} | ${txDate}`);
      console.log(`[TxMatch]       Breakdown: ${breakdown}`);
    }
  } else {
    // Log best non-qualifying match for debugging
    const bestNonMatch = allScores.sort((a, b) => b.confidence - a.confidence)[0];
    if (bestNonMatch) {
      const txAmount = (bestNonMatch.preview.amount / 100).toFixed(2);
      const txDate = bestNonMatch.preview.date.toDate().toISOString().split("T")[0];
      const breakdown = formatBreakdown(bestNonMatch as TransactionMatchScoreWithBreakdown);
      console.log(`[TxMatch] No matches above ${CONFIG.SUGGESTION_THRESHOLD}%. Best was ${bestNonMatch.confidence}%:`);
      console.log(`[TxMatch]   "${bestNonMatch.preview.name}" | ${txAmount} ${bestNonMatch.preview.currency} | ${txDate}`);
      console.log(`[TxMatch]   Breakdown: ${breakdown}`);
    } else {
      console.log(`[TxMatch] No matches found.`);
    }
  }

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

    // Determine if we should run
    let shouldRun = false;
    let reason = "";

    if (partnerMatchJustCompleted && !after.transactionMatchComplete) {
      shouldRun = true;
      reason = "partner_match_complete";
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
