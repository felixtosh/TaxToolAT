import { onCall } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, DocumentSnapshot } from "firebase-admin/firestore";
import { globMatch, LearnedPattern } from "../utils/partner-matcher";

const db = getFirestore();

// ============================================================================
// Types
// ============================================================================

interface ManualRemoval {
  transactionId: string;
}

interface PartnerWithPatterns {
  id: string;
  name: string;
  learnedPatterns: LearnedPattern[];
  manualRemovalIds: Set<string>;
}

interface MatchResult {
  partnerId: string;
  partnerName: string;
  confidence: number;
}

// ============================================================================
// Pattern Matching
// ============================================================================

function findBestMatch(
  txId: string,
  txPartner: string | null,
  txName: string,
  txReference: string | null,
  partners: PartnerWithPatterns[]
): MatchResult | null {
  let bestMatch: MatchResult | null = null;

  // Combine all text fields for matching (no field-specific penalties)
  const textToMatch = [txName, txPartner, txReference]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!textToMatch) return null;

  for (const partner of partners) {
    if (!partner.learnedPatterns || partner.learnedPatterns.length === 0) continue;

    // CRITICAL: Skip this partner if user manually removed this transaction from it
    if (partner.manualRemovalIds.has(txId)) {
      continue;
    }

    for (const pattern of partner.learnedPatterns) {
      if (globMatch(pattern.pattern, textToMatch)) {
        // Use pattern confidence directly, no penalty
        if (!bestMatch || pattern.confidence > bestMatch.confidence) {
          bestMatch = {
            partnerId: partner.id,
            partnerName: partner.name,
            confidence: pattern.confidence,
          };
        }
      }
    }
  }

  return bestMatch;
}

// ============================================================================
// Background Worker
// ============================================================================

/**
 * Apply all learned patterns to unassigned transactions
 * Called after batch learning completes
 * No limits - processes ALL transactions using pagination
 */
export async function applyAllPatternsToTransactions(userId: string): Promise<{ processed: number; matched: number }> {
  console.log(`Applying patterns to all transactions for user ${userId}`);

  // Fetch all partners with patterns
  const partnersSnapshot = await db
    .collection("partners")
    .where("userId", "==", userId)
    .get();

  const partners: PartnerWithPatterns[] = partnersSnapshot.docs
    .filter((doc) => {
      const data = doc.data();
      return data.learnedPatterns && data.learnedPatterns.length > 0;
    })
    .map((doc) => {
      const data = doc.data();
      // Build set of transaction IDs that user manually removed from this partner
      const manualRemovals: ManualRemoval[] = data.manualRemovals || [];
      const manualRemovalIds = new Set(manualRemovals.map((r) => r.transactionId));

      return {
        id: doc.id,
        name: data.name,
        learnedPatterns: data.learnedPatterns,
        manualRemovalIds,
      };
    });

  if (partners.length === 0) {
    console.log("No partners with patterns found");
    return { processed: 0, matched: 0 };
  }

  console.log(`Found ${partners.length} partners with patterns`);

  let processed = 0;
  let matched = 0;
  let cursor: DocumentSnapshot | null = null;

  // Process in batches using pagination
  while (true) {
    // Build query
    let query = db
      .collection("transactions")
      .where("userId", "==", userId)
      .orderBy("date", "desc")
      .limit(500);

    if (cursor) {
      query = query.startAfter(cursor);
    }

    const batch = await query.get();
    if (batch.empty) break;

    // Filter to unassigned (client-side because null query is unreliable)
    const unassigned = batch.docs.filter((doc) => !doc.data().partnerId);

    if (unassigned.length > 0) {
      const updates = db.batch();
      let batchMatchCount = 0;

      for (const doc of unassigned) {
        const data = doc.data();
        const match = findBestMatch(doc.id, data.partner || null, data.name || "", data.reference || null, partners);

        if (match && match.confidence >= 89) {
          updates.update(doc.ref, {
            partnerId: match.partnerId,
            partnerType: "user",
            partnerMatchConfidence: match.confidence,
            partnerMatchedBy: "auto",
            partnerSuggestions: [{
              partnerId: match.partnerId,
              partnerType: "user",
              confidence: match.confidence,
              source: "pattern",
            }],
            updatedAt: FieldValue.serverTimestamp(),
          });
          batchMatchCount++;
        }
      }

      if (batchMatchCount > 0) {
        await updates.commit();
        matched += batchMatchCount;
      }
    }

    processed += batch.docs.length;
    cursor = batch.docs[batch.docs.length - 1];

    console.log(`Processed ${processed} transactions, matched ${matched} so far`);

    // Safety limit - process max 10,000 transactions per run
    if (processed >= 10000) {
      console.log("Reached safety limit of 10,000 transactions");
      break;
    }
  }

  console.log(`Completed: processed ${processed}, matched ${matched}`);
  return { processed, matched };
}

/**
 * Callable function to manually trigger pattern application
 */
export const applyPatternsToTransactions = onCall<Record<string, never>>(
  {
    region: "europe-west1",
    memory: "512MiB",
    timeoutSeconds: 540,
  },
  async (request) => {
    // TODO: Use real auth when ready for multi-user
    const userId = "dev-user-123";
    return await applyAllPatternsToTransactions(userId);
  }
);
