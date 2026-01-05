"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.learnPartnerPatterns = void 0;
exports.learnPatternsForPartnersBatch = learnPatternsForPartnersBatch;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const firestore_1 = require("firebase-admin/firestore");
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const anthropicApiKey = (0, params_1.defineSecret)("ANTHROPIC_API_KEY");
const db = (0, firestore_1.getFirestore)();
// ============================================================================
// Prompt Builder
// ============================================================================
function buildPrompt(partnerName, partnerAliases, assignedTransactions, collisionTransactions) {
    const assignedList = assignedTransactions
        .map((tx) => `- partner: "${tx.partner || "(empty)"}" | name: "${tx.name}"`)
        .join("\n");
    // Group collision transactions by partner for clearer display
    const collisionList = collisionTransactions
        .slice(0, 30) // Limit to 30 samples
        .map((tx) => `- partner: "${tx.partner || "(empty)"}" | name: "${tx.name}" → assigned to: ${tx.assignedPartnerName}`)
        .join("\n");
    return `You are analyzing bank transaction data to learn matching patterns for a partner.

## Partner Information
Name: ${partnerName}
Existing Aliases: ${partnerAliases.length > 0 ? partnerAliases.join(", ") : "(none)"}

## MUST MATCH - Transactions assigned to this partner
Your patterns MUST match ALL of these:
${assignedList || "(no transactions yet)"}

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
1. Use * as a wildcard (matches any characters)
2. Patterns must match ALL "must match" transactions
3. Patterns must NOT match ANY "must not match" transactions
4. Prefer shorter, more general patterns when safe
5. Common pattern examples:
   - "google*" matches all Google services (Cloud, Ads, YouTube, etc.)
   - "amazon*" matches "AMAZON.DE", "AMAZON EU SARL"
   - "*netflix*" matches "NETFLIX.COM", "PP*NETFLIX"

Confidence Guidelines:
- 95-100: General pattern that matches all transactions without any collisions
- 85-94: Good pattern with low collision risk
- 70-84: More specific pattern needed to avoid collisions
- Below 70: Don't suggest patterns this weak

For each pattern, specify:
- "field": which transaction field to match ("partner" for bank statement name, "name" for description)
- Use "partner" field when possible as it's more reliable

Respond ONLY with valid JSON (no markdown, no explanation):
{
  "patterns": [
    {
      "pattern": "google*",
      "field": "partner",
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
function globMatch(pattern, text) {
    if (!pattern || !text)
        return false;
    const normalizedText = text.toLowerCase();
    const normalizedPattern = pattern.toLowerCase();
    const regexPattern = normalizedPattern
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*");
    try {
        return new RegExp(`^${regexPattern}$`).test(normalizedText);
    }
    catch {
        return false;
    }
}
/**
 * Re-match unassigned transactions against newly learned patterns
 * Auto-assigns if pattern confidence >= 89%
 */
async function rematchUnassignedTransactions(userId, partnerId, partnerName, learnedPatterns) {
    // Get ALL user transactions and filter client-side
    // (Firestore "== null" doesn't match missing/undefined fields)
    const allTxSnapshot = await db
        .collection("transactions")
        .where("userId", "==", userId)
        .limit(1000)
        .get();
    if (allTxSnapshot.empty)
        return 0;
    // Filter to unassigned transactions (partnerId is null, undefined, or missing)
    const unassignedDocs = allTxSnapshot.docs.filter((doc) => {
        const data = doc.data();
        return !data.partnerId;
    });
    console.log(`Found ${unassignedDocs.length} unassigned transactions to check`);
    if (unassignedDocs.length === 0)
        return 0;
    const batch = db.batch();
    let matchedCount = 0;
    for (const txDoc of unassignedDocs) {
        const txData = txDoc.data();
        // Check each pattern
        for (const pattern of learnedPatterns) {
            const textToMatch = pattern.field === "partner"
                ? txData.partner
                : txData.name;
            console.log(`Checking pattern "${pattern.pattern}" (${pattern.confidence}%) against "${textToMatch}"`);
            if (textToMatch && globMatch(pattern.pattern, textToMatch)) {
                console.log(`  -> MATCH! Confidence: ${pattern.confidence}%`);
                // Only auto-assign if confidence >= 89%
                if (pattern.confidence >= 89) {
                    batch.update(txDoc.ref, {
                        partnerId: partnerId,
                        partnerType: "user",
                        partnerMatchConfidence: pattern.confidence,
                        partnerMatchedBy: "auto",
                        partnerSuggestions: [{
                                partnerId: partnerId,
                                partnerType: "user",
                                confidence: pattern.confidence,
                                source: "pattern",
                            }],
                        updatedAt: firestore_1.FieldValue.serverTimestamp(),
                    });
                    matchedCount++;
                    break; // Only match once per transaction
                }
                else {
                    console.log(`  -> Confidence too low (${pattern.confidence}% < 89%), skipping auto-assign`);
                }
            }
        }
        // Batch limit
        if (matchedCount >= 100)
            break;
    }
    if (matchedCount > 0) {
        await batch.commit();
    }
    return matchedCount;
}
// ============================================================================
// Cloud Function
// ============================================================================
/**
 * Learn matching patterns for a partner based on assigned transactions
 * Called after a user manually assigns a partner to a transaction
 */
exports.learnPartnerPatterns = (0, https_1.onCall)({
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 60,
    secrets: [anthropicApiKey],
}, async (request) => {
    const userId = request.auth?.uid || "dev-user-123";
    const { partnerId, transactionId } = request.data;
    if (!partnerId) {
        throw new https_1.HttpsError("invalid-argument", "partnerId is required");
    }
    console.log(`Learning patterns for partner ${partnerId}, triggered by transaction ${transactionId || "manual"}`);
    try {
        // 1. Fetch the partner
        const partnerDoc = await db.collection("partners").doc(partnerId).get();
        if (!partnerDoc.exists) {
            throw new https_1.HttpsError("not-found", `Partner ${partnerId} not found`);
        }
        const partnerData = partnerDoc.data();
        if (partnerData.userId !== userId) {
            throw new https_1.HttpsError("permission-denied", "Cannot access this partner");
        }
        const partnerName = partnerData.name || "";
        const partnerAliases = partnerData.aliases || [];
        // 2. Fetch all transactions assigned to this partner
        const assignedSnapshot = await db
            .collection("transactions")
            .where("userId", "==", userId)
            .where("partnerId", "==", partnerId)
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
        // Skip if no transactions assigned yet
        if (assignedTransactions.length === 0) {
            console.log(`No transactions assigned to partner ${partnerId}, skipping pattern learning`);
            return { patternsLearned: 0, patterns: [] };
        }
        // 3. Fetch transactions assigned to OTHER partners (collision set)
        const allAssignedSnapshot = await db
            .collection("transactions")
            .where("userId", "==", userId)
            .limit(500)
            .get();
        // Get partner names for collision transactions
        const partnerIds = new Set();
        allAssignedSnapshot.docs.forEach((doc) => {
            const pid = doc.data().partnerId;
            if (pid && pid !== partnerId) {
                partnerIds.add(pid);
            }
        });
        // Fetch partner names in bulk
        const partnerNameMap = new Map();
        if (partnerIds.size > 0) {
            const partnerDocs = await Promise.all(Array.from(partnerIds).slice(0, 50).map((pid) => db.collection("partners").doc(pid).get()));
            partnerDocs.forEach((doc) => {
                if (doc.exists) {
                    partnerNameMap.set(doc.id, doc.data().name || "Unknown");
                }
            });
        }
        // Build collision set
        const collisionTransactions = allAssignedSnapshot.docs
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
        const client = new sdk_1.default({ apiKey: anthropicApiKey.value() });
        const prompt = buildPrompt(partnerName, partnerAliases, assignedTransactions, collisionTransactions);
        const response = await client.messages.create({
            model: "claude-3-5-haiku-20241022",
            max_tokens: 1024,
            messages: [{ role: "user", content: prompt }],
        });
        // Extract text from response
        const textBlock = response.content.find((block) => block.type === "text");
        if (!textBlock || textBlock.type !== "text") {
            throw new https_1.HttpsError("internal", "No text response from AI");
        }
        // Parse JSON response
        const jsonText = textBlock.text.trim();
        let aiResult;
        try {
            aiResult = JSON.parse(jsonText);
        }
        catch (parseError) {
            console.error("Failed to parse AI response:", jsonText);
            throw new https_1.HttpsError("internal", "Failed to parse AI response as JSON");
        }
        // Validate and transform patterns
        if (!aiResult.patterns || !Array.isArray(aiResult.patterns)) {
            console.log("AI returned no patterns");
            return { patternsLearned: 0, patterns: [] };
        }
        const now = firestore_1.Timestamp.now();
        const transactionIds = assignedTransactions.map((tx) => tx.id);
        // Helper to check collision
        const hasCollision = (pattern, field) => {
            for (const tx of collisionTransactions) {
                const textToMatch = field === "partner" ? tx.partner : tx.name;
                if (textToMatch && globMatch(pattern, textToMatch)) {
                    return tx;
                }
            }
            return null;
        };
        const learnedPatterns = aiResult.patterns
            .filter((p) => {
            // Validate pattern structure
            if (!p.pattern || typeof p.pattern !== "string")
                return false;
            if (!["partner", "name"].includes(p.field))
                return false;
            if (typeof p.confidence !== "number" || p.confidence < 50)
                return false;
            // Server-side collision validation
            const normalizedPattern = p.pattern.toLowerCase().trim();
            const collision = hasCollision(normalizedPattern, p.field);
            if (collision) {
                console.log(`REJECTED pattern "${normalizedPattern}" - collides with "${collision.assignedPartnerName}" (tx: ${collision.partner || collision.name})`);
                return false;
            }
            return true;
        })
            .map((p) => ({
            pattern: p.pattern.toLowerCase().trim(),
            field: p.field,
            confidence: Math.min(100, Math.max(0, Math.round(p.confidence))),
            createdAt: now,
            sourceTransactionIds: transactionIds,
        }));
        // 5. Update the partner with learned patterns
        if (learnedPatterns.length > 0) {
            await partnerDoc.ref.update({
                learnedPatterns: learnedPatterns,
                patternsUpdatedAt: firestore_1.FieldValue.serverTimestamp(),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            console.log(`Learned ${learnedPatterns.length} patterns for partner ${partnerId}:`, learnedPatterns.map((p) => p.pattern));
            // 6. Re-match unassigned transactions with the new patterns
            const autoMatched = await rematchUnassignedTransactions(userId, partnerId, partnerName, learnedPatterns);
            console.log(`Auto-matched ${autoMatched} additional transactions with new patterns`);
        }
        return {
            patternsLearned: learnedPatterns.length,
            patterns: learnedPatterns.map((p) => ({
                pattern: p.pattern,
                field: p.field,
                confidence: p.confidence,
            })),
        };
    }
    catch (error) {
        if (error instanceof https_1.HttpsError)
            throw error;
        console.error("Error learning partner patterns:", error);
        throw new https_1.HttpsError("internal", `Pattern learning failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
});
// ============================================================================
// Batched Learning (for queue processing)
// ============================================================================
/**
 * Learn patterns for multiple partners in a single operation
 * Called by the learning queue processor
 */
async function learnPatternsForPartnersBatch(userId, partnerIds) {
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
            const partnerData = partnerDoc.data();
            if (partnerData.userId !== userId) {
                console.log(`Partner ${partnerId} doesn't belong to user ${userId}, skipping`);
                continue;
            }
            // Fetch assigned transactions
            const assignedSnapshot = await db
                .collection("transactions")
                .where("userId", "==", userId)
                .where("partnerId", "==", partnerId)
                .limit(50)
                .get();
            if (assignedSnapshot.empty) {
                console.log(`No transactions assigned to partner ${partnerId}, skipping`);
                continue;
            }
            const assignedTransactions = assignedSnapshot.docs.map((doc) => ({
                id: doc.id,
                partner: doc.data().partner || null,
                name: doc.data().name || "",
            }));
            // Fetch collision set
            const allAssignedSnapshot = await db
                .collection("transactions")
                .where("userId", "==", userId)
                .limit(500)
                .get();
            const partnerIdsSet = new Set();
            allAssignedSnapshot.docs.forEach((doc) => {
                const pid = doc.data().partnerId;
                if (pid && pid !== partnerId) {
                    partnerIdsSet.add(pid);
                }
            });
            const partnerNameMap = new Map();
            if (partnerIdsSet.size > 0) {
                const partnerDocs = await Promise.all(Array.from(partnerIdsSet).slice(0, 50).map((pid) => db.collection("partners").doc(pid).get()));
                partnerDocs.forEach((doc) => {
                    if (doc.exists) {
                        partnerNameMap.set(doc.id, doc.data().name || "Unknown");
                    }
                });
            }
            const collisionTransactions = allAssignedSnapshot.docs
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
            const client = new sdk_1.default({ apiKey: anthropicApiKey.value() });
            const prompt = buildPrompt(partnerData.name, partnerData.aliases || [], assignedTransactions, collisionTransactions);
            const response = await client.messages.create({
                model: "claude-3-5-haiku-20241022",
                max_tokens: 1024,
                messages: [{ role: "user", content: prompt }],
            });
            const textBlock = response.content.find((block) => block.type === "text");
            if (!textBlock || textBlock.type !== "text") {
                console.log(`No text response for partner ${partnerId}, skipping`);
                continue;
            }
            let aiResult;
            try {
                aiResult = JSON.parse(textBlock.text.trim());
            }
            catch {
                console.error(`Failed to parse AI response for partner ${partnerId}`);
                continue;
            }
            if (!aiResult.patterns || !Array.isArray(aiResult.patterns)) {
                console.log(`No patterns returned for partner ${partnerId}`);
                continue;
            }
            // Validate and transform patterns
            const now = firestore_1.Timestamp.now();
            const transactionIds = assignedTransactions.map((tx) => tx.id);
            const hasCollision = (pattern, field) => {
                for (const tx of collisionTransactions) {
                    const textToMatch = field === "partner" ? tx.partner : tx.name;
                    if (textToMatch && globMatch(pattern, textToMatch)) {
                        return tx;
                    }
                }
                return null;
            };
            const learnedPatterns = aiResult.patterns
                .filter((p) => {
                if (!p.pattern || typeof p.pattern !== "string")
                    return false;
                if (!["partner", "name"].includes(p.field))
                    return false;
                if (typeof p.confidence !== "number" || p.confidence < 50)
                    return false;
                const normalizedPattern = p.pattern.toLowerCase().trim();
                const collision = hasCollision(normalizedPattern, p.field);
                if (collision) {
                    console.log(`REJECTED pattern "${normalizedPattern}" for ${partnerData.name} - collides with ${collision.assignedPartnerName}`);
                    return false;
                }
                return true;
            })
                .map((p) => ({
                pattern: p.pattern.toLowerCase().trim(),
                field: p.field,
                confidence: Math.min(100, Math.max(0, Math.round(p.confidence))),
                createdAt: now,
                sourceTransactionIds: transactionIds,
            }));
            if (learnedPatterns.length > 0) {
                await partnerDoc.ref.update({
                    learnedPatterns: learnedPatterns,
                    patternsUpdatedAt: firestore_1.FieldValue.serverTimestamp(),
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                });
                console.log(`Learned ${learnedPatterns.length} patterns for ${partnerData.name}:`, learnedPatterns.map((p) => p.pattern));
            }
        }
        catch (error) {
            console.error(`Error learning patterns for partner ${partnerId}:`, error);
            // Continue with next partner
        }
    }
    // After all patterns are learned, apply them to unassigned transactions
    console.log("Applying patterns to unassigned transactions...");
    const { applyAllPatternsToTransactions } = await Promise.resolve().then(() => __importStar(require("./applyPatterns")));
    await applyAllPatternsToTransactions(userId);
}
//# sourceMappingURL=learnPartnerPatterns.js.map