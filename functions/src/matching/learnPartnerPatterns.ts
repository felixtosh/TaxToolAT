import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import Anthropic from "@anthropic-ai/sdk";
import { logAIUsage } from "../utils/ai-usage-logger";

const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");
const db = getFirestore();

// ============================================================================
// Types
// ============================================================================

interface LearnPatternsRequest {
  partnerId: string;
  transactionId?: string; // Optional: the newly assigned transaction
}

interface CollisionTransaction {
  partner: string | null;
  name: string;
  assignedPartnerId: string;
  assignedPartnerName: string;
}

/**
 * Record of a transaction that was manually removed from this partner.
 * Used as negative training signal (false positive) for pattern learning.
 */
interface ManualRemovalRecord {
  transactionId: string;
  partner: string | null;
  name: string;
}

interface LearnedPattern {
  pattern: string;
  /** DEPRECATED: field is ignored, patterns match all text fields combined */
  field?: "partner" | "name";
  confidence: number;
  createdAt: Timestamp;
  sourceTransactionIds: string[];
}

interface AIPatternResponse {
  patterns: Array<{
    pattern: string;
    confidence: number;
    reasoning: string;
  }>;
}

interface LearnPatternsResponse {
  patternsLearned: number;
  patterns: Array<{
    pattern: string;
    confidence: number;
  }>;
}

// ============================================================================
// Prompt Builder
// ============================================================================

function buildPrompt(
  partnerName: string,
  partnerAliases: string[],
  assignedTransactions: Array<{ id: string; partner: string | null; name: string }>,
  collisionTransactions: CollisionTransaction[],
  manualRemovals: ManualRemovalRecord[] = []
): string {
  const assignedList = assignedTransactions
    .map((tx) => `- partner: "${tx.partner || "(empty)"}" | name: "${tx.name}"`)
    .join("\n");

  // Group collision transactions by partner for clearer display
  const collisionList = collisionTransactions
    .slice(0, 30) // Limit to 30 samples
    .map((tx) => `- partner: "${tx.partner || "(empty)"}" | name: "${tx.name}" → assigned to: ${tx.assignedPartnerName}`)
    .join("\n");

  // Manual removals - transactions user explicitly said are NOT this partner
  const removalsList = manualRemovals
    .slice(0, 20) // Limit to 20 samples
    .map((tx) => `- partner: "${tx.partner || "(empty)"}" | name: "${tx.name}"`)
    .join("\n");

  return `You are analyzing bank transaction data to learn matching patterns for a partner.

## Partner Information
Name: ${partnerName}
Existing Aliases: ${partnerAliases.length > 0 ? partnerAliases.join(", ") : "(none)"}

## MUST MATCH - Transactions assigned to this partner
Your patterns MUST match ALL of these:
${assignedList || "(no transactions yet)"}

## MUST NOT MATCH - FALSE POSITIVES (user explicitly removed these)
These transactions were auto-matched but the user said they are WRONG. Your patterns MUST NOT match any of these:
${removalsList || "(none)"}

## MUST NOT MATCH - Transactions assigned to OTHER partners
Your patterns must NOT match ANY of these (collision check):
${collisionList || "(no other assigned transactions)"}

## Instructions

Generate glob-style patterns that will match future transactions from this partner.

IMPORTANT: Prefer GENERAL patterns over specific ones!
- If all transactions start with "Google", use "google*" not "google*cloud*", "google*ads*" separately
- Only be specific when necessary to avoid collisions with other partners
- Simpler patterns = better (easier to match future variations)

Pattern Rules:
1. Use * as a wildcard (matches any characters, including spaces)
2. Patterns must match ALL "must match" transactions
3. Patterns must NOT match ANY "must not match" transactions
4. Prefer shorter, more general patterns when safe
5. CRITICAL: Handle spelling variations by using * between word parts!
   - "Media Markt" and "Mediamarkt" → use "*media*markt*" (not "*media markt*")
   - Spaces and no-spaces are different! Use * to match both
6. Common pattern examples:
   - "google*" matches all Google services (Cloud, Ads, YouTube, etc.)
   - "amazon*" matches "AMAZON.DE", "AMAZON EU SARL"
   - "*netflix*" matches "NETFLIX.COM", "PP*NETFLIX"
   - "*media*markt*" matches "Media Markt", "Mediamarkt", "MEDIAMARKT 1070"

Confidence Guidelines:
- 95-100: General pattern that matches all transactions without any collisions
- 85-94: Good pattern with low collision risk
- 70-84: More specific pattern needed to avoid collisions
- Below 70: Don't suggest patterns this weak

Respond ONLY with valid JSON (no markdown, no explanation):
{
  "patterns": [
    {
      "pattern": "google*",
      "confidence": 95,
      "reasoning": "All Google transactions start with 'google' and no collisions with other partners"
    }
  ]
}

If no good patterns can be learned (e.g., only 1 transaction with no clear pattern), return:
{"patterns": []}`;
}

// ============================================================================
// Helper: Re-match unassigned transactions
// ============================================================================

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

interface MatchedTransaction {
  id: string;
  name: string;
  amount: number;
  partner?: string;
}

interface RematchResult {
  matchedCount: number;
  matchedTransactions: MatchedTransaction[];
}

/**
 * Re-match unassigned transactions against newly learned patterns
 * Auto-assigns if pattern confidence >= 89%
 *
 * IMPORTANT: Skips transactions that are in manualRemovals (user explicitly removed them)
 */
async function rematchUnassignedTransactions(
  userId: string,
  partnerId: string,
  partnerName: string,
  learnedPatterns: LearnedPattern[],
  manualRemovalIds: Set<string> = new Set()
): Promise<RematchResult> {
  // Get ALL user transactions and filter client-side
  // (Firestore "== null" doesn't match missing/undefined fields)
  const allTxSnapshot = await db
    .collection("transactions")
    .where("userId", "==", userId)
    .limit(1000)
    .get();

  if (allTxSnapshot.empty) return { matchedCount: 0, matchedTransactions: [] };

  // Filter to unassigned transactions (partnerId is null, undefined, or missing)
  const unassignedDocs = allTxSnapshot.docs.filter((doc) => {
    const data = doc.data();
    return !data.partnerId;
  });

  console.log(`Found ${unassignedDocs.length} unassigned transactions to check`);
  console.log(`Excluding ${manualRemovalIds.size} transactions that user manually removed`);

  if (unassignedDocs.length === 0) return { matchedCount: 0, matchedTransactions: [] };

  const batch = db.batch();
  let matchedCount = 0;
  const matchedTransactions: MatchedTransaction[] = [];

  for (const txDoc of unassignedDocs) {
    const txData = txDoc.data();

    // CRITICAL: Skip transactions that user explicitly removed from this partner
    if (manualRemovalIds.has(txDoc.id)) {
      console.log(`  -> SKIPPING tx ${txDoc.id} - user manually removed it from this partner`);
      continue;
    }

    let bestMatch: { confidence: number; pattern: string } | null = null;

    // Combine all text fields for matching (no field-specific penalties)
    const textToMatch = [txData.name, txData.partner, txData.reference]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (!textToMatch) continue;

    // Check each pattern against combined text
    for (const pattern of learnedPatterns) {
      if (globMatch(pattern.pattern, textToMatch)) {
        console.log(`  -> MATCH: "${pattern.pattern}" on text="${textToMatch}" (${pattern.confidence}%)`);
        if (!bestMatch || pattern.confidence > bestMatch.confidence) {
          bestMatch = { confidence: pattern.confidence, pattern: pattern.pattern };
        }
      }
    }

    // Auto-assign if best match confidence >= 89%
    if (bestMatch && bestMatch.confidence >= 89) {
      console.log(`  -> AUTO-ASSIGNING with confidence ${bestMatch.confidence}%`);
      batch.update(txDoc.ref, {
        partnerId: partnerId,
        partnerType: "user",
        partnerMatchConfidence: bestMatch.confidence,
        partnerMatchedBy: "auto",
        partnerSuggestions: [{
          partnerId: partnerId,
          partnerType: "user",
          confidence: bestMatch.confidence,
          source: "pattern",
        }],
        updatedAt: FieldValue.serverTimestamp(),
      });
      matchedCount++;

      // Collect transaction data for preview (limit to 10)
      if (matchedTransactions.length < 10) {
        matchedTransactions.push({
          id: txDoc.id,
          name: txData.name || txData.partner || "Unknown",
          amount: txData.amount || 0,
          partner: txData.partner,
        });
      }
    } else if (bestMatch) {
      console.log(`  -> Confidence too low (${bestMatch.confidence}% < 89%), skipping auto-assign`);
    }

    // Batch limit
    if (matchedCount >= 100) break;
  }

  if (matchedCount > 0) {
    await batch.commit();
  }

  return { matchedCount, matchedTransactions };
}

// ============================================================================
// Helper: Cascade unassign auto-matched transactions
// ============================================================================

/**
 * Unassign auto-matched transactions that no longer match the current patterns.
 * Called when patterns are updated or cleared to maintain consistency.
 *
 * @param userId - The user ID
 * @param partnerId - The partner ID whose auto-assignments to check
 * @param newPatterns - The new patterns to check against (empty = unassign all)
 * @returns Number of transactions that were unassigned
 */
async function cascadeUnassignTransactions(
  userId: string,
  partnerId: string,
  newPatterns: LearnedPattern[] = []
): Promise<number> {
  // Get all transactions assigned to this partner
  // We can't use compound queries with "in" on partnerMatchedBy because we also need
  // to handle legacy transactions without the field, so we fetch all and filter client-side
  const allAssignedSnapshot = await db
    .collection("transactions")
    .where("userId", "==", userId)
    .where("partnerId", "==", partnerId)
    .limit(500)
    .get();

  // Filter to only auto-matched OR legacy transactions without partnerMatchedBy
  // Manual/suggestion assignments are user decisions and should NOT be cascade-unassigned
  const autoAssignedDocs = allAssignedSnapshot.docs.filter((doc) => {
    const data = doc.data();
    const matchedBy = data.partnerMatchedBy;
    // Include: "auto", null, undefined, or missing field (legacy)
    return matchedBy === "auto" || !matchedBy;
  });

  if (autoAssignedDocs.length === 0) return 0;

  console.log(`Found ${autoAssignedDocs.length} auto/legacy-assigned transactions to re-evaluate (of ${allAssignedSnapshot.size} total)`);

  const batch = db.batch();
  let unassignedCount = 0;

  for (const txDoc of autoAssignedDocs) {
    const txData = txDoc.data();

    // If we have new patterns, check if transaction still matches
    if (newPatterns.length > 0) {
      // Combine all text fields for matching (no field-specific penalties)
      const textToMatch = [txData.name, txData.partner, txData.reference]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      let stillMatches = false;

      for (const pattern of newPatterns) {
        if (textToMatch && globMatch(pattern.pattern, textToMatch)) {
          // Check confidence meets threshold (no penalty)
          if (pattern.confidence >= 89) {
            stillMatches = true;
            break;
          }
        }
      }

      if (stillMatches) continue; // Keep this assignment
    }

    // Unassign transaction (no matching pattern or patterns are empty)
    batch.update(txDoc.ref, {
      partnerId: null,
      partnerType: null,
      partnerMatchedBy: null,
      partnerMatchConfidence: null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    unassignedCount++;
  }

  if (unassignedCount > 0) {
    await batch.commit();
    console.log(`Cascade-unassigned ${unassignedCount} transactions that no longer match patterns`);
  }

  return unassignedCount;
}

// ============================================================================
// Cloud Function
// ============================================================================

/**
 * Learn matching patterns for a partner based on assigned transactions
 * Called after a user manually assigns a partner to a transaction
 */
export const learnPartnerPatterns = onCall<LearnPatternsRequest>(
  {
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 60,
    secrets: [anthropicApiKey],
  },
  async (request): Promise<LearnPatternsResponse> => {
    // TODO: Use real auth when ready for multi-user
    const userId = "dev-user-123";
    const { partnerId, transactionId } = request.data;

    if (!partnerId) {
      throw new HttpsError("invalid-argument", "partnerId is required");
    }

    console.log(`Learning patterns for partner ${partnerId}, triggered by transaction ${transactionId || "manual"}`);

    try {
      // 1. Fetch the partner
      const partnerDoc = await db.collection("partners").doc(partnerId).get();
      if (!partnerDoc.exists) {
        throw new HttpsError("not-found", `Partner ${partnerId} not found`);
      }

      const partnerData = partnerDoc.data()!;
      if (partnerData.userId !== userId) {
        throw new HttpsError("permission-denied", "Cannot access this partner");
      }

      const partnerName = partnerData.name || "";
      const partnerAliases: string[] = partnerData.aliases || [];

      // Get manual removals (false positives) from partner data
      const manualRemovals: ManualRemovalRecord[] = (partnerData.manualRemovals || []).map(
        (r: { transactionId: string; partner: string | null; name: string }) => ({
          transactionId: r.transactionId,
          partner: r.partner || null,
          name: r.name || "",
        })
      );

      console.log(`Found ${manualRemovals.length} manual removals (false positives) for partner ${partnerId}`);

      // 2. Fetch ONLY manually assigned transactions (not auto-assigned)
      // This ensures patterns are only learned from explicit user decisions,
      // not from previous auto-matches (which could create feedback loops)
      const assignedSnapshot = await db
        .collection("transactions")
        .where("userId", "==", userId)
        .where("partnerId", "==", partnerId)
        .where("partnerMatchedBy", "in", ["manual", "suggestion"])
        .limit(50) // Limit to avoid huge prompts
        .get();

      const assignedTransactions = assignedSnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          partner: data.partner || null,
          name: data.name || "",
        };
      });

      // Handle case where no manual/suggestion assignments remain
      if (assignedTransactions.length === 0) {
        console.log(`No manual assignments for partner ${partnerId}, clearing patterns and cascade-unassigning`);

        // Clear all learned patterns from the partner
        await partnerDoc.ref.update({
          learnedPatterns: [],
          patternsUpdatedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Cascade-unassign all auto-assigned transactions (passing empty patterns)
        const unassignedCount = await cascadeUnassignTransactions(userId, partnerId, []);

        // Create notification if any transactions were unassigned
        if (unassignedCount > 0) {
          try {
            await db.collection(`users/${userId}/notifications`).add({
              type: "patterns_cleared",
              title: `Patterns cleared for ${partnerName}`,
              message: `All manual assignments removed. ${unassignedCount} auto-matched transaction${unassignedCount !== 1 ? "s were" : " was"} unassigned.`,
              createdAt: FieldValue.serverTimestamp(),
              readAt: null,
              context: {
                partnerId,
                partnerName,
                unassignedCount,
              },
            });
            console.log(`Created patterns_cleared notification for ${partnerName}`);
          } catch (err) {
            console.error("Failed to create patterns_cleared notification:", err);
          }
        }

        return { patternsLearned: 0, patterns: [] };
      }

      // 3. Fetch transactions assigned to OTHER partners (collision set)
      const allAssignedSnapshot = await db
        .collection("transactions")
        .where("userId", "==", userId)
        .limit(500)
        .get();

      // Get partner names for collision transactions
      const partnerIds = new Set<string>();
      allAssignedSnapshot.docs.forEach((doc) => {
        const pid = doc.data().partnerId;
        if (pid && pid !== partnerId) {
          partnerIds.add(pid);
        }
      });

      // Fetch partner names in bulk
      const partnerNameMap = new Map<string, string>();
      if (partnerIds.size > 0) {
        const partnerDocs = await Promise.all(
          Array.from(partnerIds).slice(0, 50).map((pid) => db.collection("partners").doc(pid).get())
        );
        partnerDocs.forEach((doc) => {
          if (doc.exists) {
            partnerNameMap.set(doc.id, doc.data()!.name || "Unknown");
          }
        });
      }

      // Build collision set
      const collisionTransactions: CollisionTransaction[] = allAssignedSnapshot.docs
        .filter((doc) => {
          const pid = doc.data().partnerId;
          return pid && pid !== partnerId;
        })
        .map((doc) => {
          const data = doc.data();
          return {
            partner: data.partner || null,
            name: data.name || "",
            assignedPartnerId: data.partnerId,
            assignedPartnerName: partnerNameMap.get(data.partnerId) || "Unknown",
          };
        });

      console.log(`Found ${collisionTransactions.length} transactions assigned to other partners for collision check`);

      // 4. Call Claude to generate patterns
      const client = new Anthropic({ apiKey: anthropicApiKey.value() });
      const prompt = buildPrompt(partnerName, partnerAliases, assignedTransactions, collisionTransactions, manualRemovals);

      const response = await client.messages.create({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });

      // Log AI usage
      await logAIUsage(userId, {
        function: "patternLearning",
        model: "claude-3-5-haiku-20241022",
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        metadata: { partnerId },
      });

      // Extract text from response
      const textBlock = response.content.find((block) => block.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new HttpsError("internal", "No text response from AI");
      }

      // Parse JSON response
      const jsonText = textBlock.text.trim();
      let aiResult: AIPatternResponse;

      try {
        aiResult = JSON.parse(jsonText);
      } catch (parseError) {
        console.error("Failed to parse AI response:", jsonText);
        throw new HttpsError("internal", "Failed to parse AI response as JSON");
      }

      // Validate and transform patterns
      if (!aiResult.patterns || !Array.isArray(aiResult.patterns)) {
        console.log("AI returned no patterns");

        // Still try file matching even if no patterns learned
        // (amount/date/partner scoring can still work)
        try {
          const { matchFilesForPartnerInternal } = await import("./matchFilesForPartner");
          const fileResult = await matchFilesForPartnerInternal(userId, partnerId);
          if (fileResult.autoMatched > 0 || fileResult.suggested > 0) {
            console.log(
              `File matching (no patterns) for ${partnerName}: ${fileResult.autoMatched} auto-matched`
            );
          }
        } catch (err) {
          console.error("Failed to run file matching:", err);
        }

        return { patternsLearned: 0, patterns: [] };
      }

      const now = Timestamp.now();
      const transactionIds = assignedTransactions.map((tx) => tx.id);

      // Helper to check collision with other partners
      const hasCollision = (pattern: string): CollisionTransaction | null => {
        for (const tx of collisionTransactions) {
          const textToMatch = [tx.name, tx.partner]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (textToMatch && globMatch(pattern, textToMatch)) {
            return tx;
          }
        }
        return null;
      };

      // Helper to check collision with manual removals (false positives)
      const matchesFalsePositive = (pattern: string): ManualRemovalRecord | null => {
        for (const tx of manualRemovals) {
          const textToMatch = [tx.name, tx.partner]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (textToMatch && globMatch(pattern, textToMatch)) {
            return tx;
          }
        }
        return null;
      };

      const learnedPatterns: LearnedPattern[] = aiResult.patterns
        .filter((p) => {
          // Validate pattern structure
          if (!p.pattern || typeof p.pattern !== "string") return false;
          if (typeof p.confidence !== "number" || p.confidence < 50) return false;

          const normalizedPattern = p.pattern.toLowerCase().trim();

          // Server-side validation: reject patterns matching false positives
          const falsePositive = matchesFalsePositive(normalizedPattern);
          if (falsePositive) {
            console.log(`REJECTED pattern "${normalizedPattern}" - matches false positive: "${falsePositive.partner || falsePositive.name}"`);
            return false;
          }

          // Server-side validation: reject patterns matching other partners
          const collision = hasCollision(normalizedPattern);
          if (collision) {
            console.log(`REJECTED pattern "${normalizedPattern}" - collides with "${collision.assignedPartnerName}" (tx: ${collision.partner || collision.name})`);
            return false;
          }

          return true;
        })
        .map((p) => ({
          pattern: p.pattern.toLowerCase().trim(),
          confidence: Math.min(100, Math.max(0, Math.round(p.confidence))),
          createdAt: now,
          sourceTransactionIds: transactionIds,
        }));

      // 5. Update the partner with learned patterns
      if (learnedPatterns.length > 0) {
        await partnerDoc.ref.update({
          learnedPatterns: learnedPatterns,
          patternsUpdatedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        console.log(`Learned ${learnedPatterns.length} patterns for partner ${partnerId}:`,
          learnedPatterns.map((p) => p.pattern));

        // 6. Cascade-unassign auto-matched transactions that no longer match
        // This is important when patterns change (e.g., manual assignment removed)
        const unassignedCount = await cascadeUnassignTransactions(userId, partnerId, learnedPatterns);
        if (unassignedCount > 0) {
          console.log(`Cascade-unassigned ${unassignedCount} transactions that no longer match updated patterns`);
        }

        // 8. Re-match unassigned transactions with the new patterns
        // IMPORTANT: Pass manualRemovalIds to prevent re-assigning transactions user explicitly removed
        const manualRemovalIds = new Set(manualRemovals.map((r) => r.transactionId));
        const { matchedCount: autoMatched, matchedTransactions } = await rematchUnassignedTransactions(
          userId,
          partnerId,
          partnerName,
          learnedPatterns,
          manualRemovalIds
        );
        console.log(`Auto-matched ${autoMatched} additional transactions with new patterns`);

        // 9. Create notification for pattern learning
        if (autoMatched > 0) {
          try {
            console.log(`Creating notification for user ${userId} - ${autoMatched} transactions matched`);
            const notifRef = await db.collection(`users/${userId}/notifications`).add({
              type: "pattern_learned",
              title: `Learned patterns for ${partnerName}`,
              message: `I learned ${learnedPatterns.length} pattern${learnedPatterns.length !== 1 ? "s" : ""} from your assignment and automatically matched ${autoMatched} similar transaction${autoMatched !== 1 ? "s" : ""} to ${partnerName}.`,
              createdAt: FieldValue.serverTimestamp(),
              readAt: null,
              context: {
                partnerId,
                partnerName,
                patternsLearned: learnedPatterns.length,
                transactionsMatched: autoMatched,
              },
              preview: {
                transactions: matchedTransactions,
              },
            });
            console.log(`Notification created: ${notifRef.id}`);
          } catch (err) {
            console.error("Failed to create pattern learning notification:", err);
          }
        }

        // 10. Chain file matching for partner
        // Always try file matching when patterns are learned or transactions are matched
        // This ensures files are auto-connected when a partner is manually assigned
        try {
          const { matchFilesForPartnerInternal } = await import("./matchFilesForPartner");
          const fileResult = await matchFilesForPartnerInternal(userId, partnerId);
          if (fileResult.autoMatched > 0 || fileResult.suggested > 0) {
            console.log(
              `File matching chained for ${partnerName}: ${fileResult.autoMatched} auto-matched, ${fileResult.suggested} suggested`
            );
          }
        } catch (err) {
          console.error("Failed to chain file matching:", err);
        }
      }

      return {
        patternsLearned: learnedPatterns.length,
        patterns: learnedPatterns.map((p) => ({
          pattern: p.pattern,
          confidence: p.confidence,
        })),
      };
    } catch (error) {
      if (error instanceof HttpsError) throw error;

      console.error("Error learning partner patterns:", error);
      throw new HttpsError(
        "internal",
        `Pattern learning failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
);

// ============================================================================
// Batched Learning (for queue processing)
// ============================================================================

/**
 * Learn patterns for multiple partners in a single operation
 * Called by the learning queue processor
 */
export async function learnPatternsForPartnersBatch(
  userId: string,
  partnerIds: string[]
): Promise<void> {
  console.log(`Batch learning patterns for ${partnerIds.length} partners (user: ${userId})`);

  // Process each partner (could be parallelized for performance)
  for (const partnerId of partnerIds) {
    try {
      // Reuse the single partner learning logic
      // This is a simplified version - in production you'd want to batch the AI calls too
      const partnerDoc = await db.collection("partners").doc(partnerId).get();
      if (!partnerDoc.exists) {
        console.log(`Partner ${partnerId} not found, skipping`);
        continue;
      }

      const partnerData = partnerDoc.data()!;
      if (partnerData.userId !== userId) {
        console.log(`Partner ${partnerId} doesn't belong to user ${userId}, skipping`);
        continue;
      }

      // Fetch ONLY manually assigned transactions (not auto-assigned)
      const assignedSnapshot = await db
        .collection("transactions")
        .where("userId", "==", userId)
        .where("partnerId", "==", partnerId)
        .where("partnerMatchedBy", "in", ["manual", "suggestion"])
        .limit(50)
        .get();

      // If no manual/suggestion assignments, clear patterns and cascade-unassign
      if (assignedSnapshot.empty) {
        console.log(`No manual assignments for partner ${partnerId}, clearing patterns`);

        // Clear learned patterns
        await partnerDoc.ref.update({
          learnedPatterns: [],
          patternsUpdatedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Cascade-unassign all auto-assigned transactions
        await cascadeUnassignTransactions(userId, partnerId, []);
        continue;
      }

      const assignedTransactions = assignedSnapshot.docs.map((doc) => ({
        id: doc.id,
        partner: doc.data().partner || null,
        name: doc.data().name || "",
      }));

      // Get manual removals (false positives) from partner data
      const manualRemovals: ManualRemovalRecord[] = (partnerData.manualRemovals || []).map(
        (r: { transactionId: string; partner: string | null; name: string }) => ({
          transactionId: r.transactionId,
          partner: r.partner || null,
          name: r.name || "",
        })
      );

      // Fetch collision set
      const allAssignedSnapshot = await db
        .collection("transactions")
        .where("userId", "==", userId)
        .limit(500)
        .get();

      const partnerIdsSet = new Set<string>();
      allAssignedSnapshot.docs.forEach((doc) => {
        const pid = doc.data().partnerId;
        if (pid && pid !== partnerId) {
          partnerIdsSet.add(pid);
        }
      });

      const partnerNameMap = new Map<string, string>();
      if (partnerIdsSet.size > 0) {
        const partnerDocs = await Promise.all(
          Array.from(partnerIdsSet).slice(0, 50).map((pid) =>
            db.collection("partners").doc(pid).get()
          )
        );
        partnerDocs.forEach((doc) => {
          if (doc.exists) {
            partnerNameMap.set(doc.id, doc.data()!.name || "Unknown");
          }
        });
      }

      const collisionTransactions: CollisionTransaction[] = allAssignedSnapshot.docs
        .filter((doc) => {
          const pid = doc.data().partnerId;
          return pid && pid !== partnerId;
        })
        .map((doc) => {
          const data = doc.data();
          return {
            partner: data.partner || null,
            name: data.name || "",
            assignedPartnerId: data.partnerId,
            assignedPartnerName: partnerNameMap.get(data.partnerId) || "Unknown",
          };
        });

      // Call AI to generate patterns
      const client = new Anthropic({ apiKey: anthropicApiKey.value() });
      const prompt = buildPrompt(
        partnerData.name,
        partnerData.aliases || [],
        assignedTransactions,
        collisionTransactions,
        manualRemovals
      );

      const response = await client.messages.create({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });

      // Log AI usage
      await logAIUsage(userId, {
        function: "patternLearning",
        model: "claude-3-5-haiku-20241022",
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        metadata: { partnerId },
      });

      const textBlock = response.content.find((block) => block.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        console.log(`No text response for partner ${partnerId}, skipping`);
        continue;
      }

      let aiResult: AIPatternResponse;
      try {
        aiResult = JSON.parse(textBlock.text.trim());
      } catch {
        console.error(`Failed to parse AI response for partner ${partnerId}`);
        continue;
      }

      if (!aiResult.patterns || !Array.isArray(aiResult.patterns)) {
        console.log(`No patterns returned for partner ${partnerId}`);
        continue;
      }

      // Validate and transform patterns
      const now = Timestamp.now();
      const transactionIds = assignedTransactions.map((tx) => tx.id);

      const hasCollision = (pattern: string): CollisionTransaction | null => {
        for (const tx of collisionTransactions) {
          const textToMatch = [tx.name, tx.partner]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (textToMatch && globMatch(pattern, textToMatch)) {
            return tx;
          }
        }
        return null;
      };

      const matchesFalsePositive = (pattern: string): ManualRemovalRecord | null => {
        for (const tx of manualRemovals) {
          const textToMatch = [tx.name, tx.partner]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (textToMatch && globMatch(pattern, textToMatch)) {
            return tx;
          }
        }
        return null;
      };

      const learnedPatterns: LearnedPattern[] = aiResult.patterns
        .filter((p) => {
          if (!p.pattern || typeof p.pattern !== "string") return false;
          if (typeof p.confidence !== "number" || p.confidence < 50) return false;

          const normalizedPattern = p.pattern.toLowerCase().trim();

          // Check against false positives first
          const falsePositive = matchesFalsePositive(normalizedPattern);
          if (falsePositive) {
            console.log(`REJECTED pattern "${normalizedPattern}" for ${partnerData.name} - matches false positive: "${falsePositive.partner || falsePositive.name}"`);
            return false;
          }

          const collision = hasCollision(normalizedPattern);
          if (collision) {
            console.log(`REJECTED pattern "${normalizedPattern}" for ${partnerData.name} - collides with ${collision.assignedPartnerName}`);
            return false;
          }
          return true;
        })
        .map((p) => ({
          pattern: p.pattern.toLowerCase().trim(),
          confidence: Math.min(100, Math.max(0, Math.round(p.confidence))),
          createdAt: now,
          sourceTransactionIds: transactionIds,
        }));

      if (learnedPatterns.length > 0) {
        await partnerDoc.ref.update({
          learnedPatterns: learnedPatterns,
          patternsUpdatedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        console.log(`Learned ${learnedPatterns.length} patterns for ${partnerData.name}:`,
          learnedPatterns.map((p) => p.pattern));
      }
    } catch (error) {
      console.error(`Error learning patterns for partner ${partnerId}:`, error);
      // Continue with next partner
    }
  }

  // After all patterns are learned, apply them to unassigned transactions
  console.log("Applying patterns to unassigned transactions...");
  const { applyAllPatternsToTransactions } = await import("./applyPatterns");
  await applyAllPatternsToTransactions(userId);
}
