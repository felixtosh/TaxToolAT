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
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerLearningNow = exports.processLearningQueue = exports.queuePartnerForLearning = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const db = (0, firestore_1.getFirestore)();
// ============================================================================
// Queue Management Functions
// ============================================================================
/**
 * Add a partner to the learning queue
 * Called from client after partner assignment
 */
exports.queuePartnerForLearning = (0, https_1.onCall)({
    region: "europe-west1",
    memory: "128MiB",
    timeoutSeconds: 10,
}, async (request) => {
    // TODO: Use real auth when ready for multi-user
    const userId = "dev-user-123";
    const { partnerId } = request.data;
    if (!partnerId) {
        throw new https_1.HttpsError("invalid-argument", "partnerId is required");
    }
    const queueRef = db.collection("users").doc(userId).collection("system").doc("learningQueue");
    const now = firestore_1.Timestamp.now();
    const processAfter = firestore_1.Timestamp.fromMillis(Date.now() + 5 * 60 * 1000); // 5 minutes from now
    try {
        await db.runTransaction(async (transaction) => {
            const queueDoc = await transaction.get(queueRef);
            if (!queueDoc.exists) {
                // Create new queue
                transaction.set(queueRef, {
                    pendingPartners: [partnerId],
                    queuedAt: now,
                    processAfter: processAfter,
                    status: "idle",
                    userId: userId,
                });
            }
            else {
                const data = queueDoc.data();
                // Don't modify if currently processing
                if (data.status === "processing") {
                    // Just add to pending, don't change processAfter
                    transaction.update(queueRef, {
                        pendingPartners: firestore_1.FieldValue.arrayUnion(partnerId),
                    });
                }
                else {
                    // Add partner and reset timer if needed
                    transaction.update(queueRef, {
                        pendingPartners: firestore_1.FieldValue.arrayUnion(partnerId),
                        // Keep original processAfter to maintain debounce from first item
                    });
                }
            }
        });
        console.log(`Queued partner ${partnerId} for learning (user: ${userId})`);
        return { success: true, partnerId };
    }
    catch (error) {
        console.error("Error queueing partner:", error);
        throw new https_1.HttpsError("internal", "Failed to queue partner for learning");
    }
});
/**
 * Process all pending learning queues
 * Runs on schedule every 5 minutes
 */
exports.processLearningQueue = (0, scheduler_1.onSchedule)({
    schedule: "every 5 minutes",
    region: "europe-west1",
    memory: "512MiB",
    timeoutSeconds: 300,
}, async () => {
    console.log("Processing learning queues...");
    const now = firestore_1.Timestamp.now();
    // Find all users with pending queues that are ready to process
    const usersSnapshot = await db.collectionGroup("system")
        .where("pendingPartners", "!=", [])
        .where("status", "==", "idle")
        .get();
    console.log(`Found ${usersSnapshot.size} queues to check`);
    for (const queueDoc of usersSnapshot.docs) {
        const data = queueDoc.data();
        // Check if it's time to process (debounce period passed)
        if (data.processAfter.toMillis() > now.toMillis()) {
            console.log(`Queue for user ${data.userId} not ready yet (waiting until ${data.processAfter.toDate()})`);
            continue;
        }
        // Mark as processing
        await queueDoc.ref.update({ status: "processing" });
        try {
            const partnerIds = data.pendingPartners;
            console.log(`Processing ${partnerIds.length} partners for user ${data.userId}`);
            // Import and call the batched learning function
            const { learnPatternsForPartnersBatch } = await Promise.resolve().then(() => __importStar(require("./learnPartnerPatterns")));
            await learnPatternsForPartnersBatch(data.userId, partnerIds);
            // Clear the queue
            await queueDoc.ref.update({
                pendingPartners: [],
                status: "idle",
                processAfter: firestore_1.FieldValue.delete(),
                queuedAt: firestore_1.FieldValue.delete(),
            });
            console.log(`Completed learning for user ${data.userId}`);
        }
        catch (error) {
            console.error(`Error processing queue for user ${data.userId}:`, error);
            // Reset status to allow retry
            await queueDoc.ref.update({ status: "idle" });
        }
    }
});
/**
 * Manually trigger queue processing for a user
 * Useful for testing or immediate processing
 */
exports.triggerLearningNow = (0, https_1.onCall)({
    region: "europe-west1",
    memory: "512MiB",
    timeoutSeconds: 300,
}, async (request) => {
    // TODO: Use real auth when ready for multi-user
    const userId = "dev-user-123";
    const queueRef = db.collection("users").doc(userId).collection("system").doc("learningQueue");
    const queueDoc = await queueRef.get();
    if (!queueDoc.exists) {
        return { success: true, message: "No pending patterns to learn" };
    }
    const data = queueDoc.data();
    if (data.pendingPartners.length === 0) {
        return { success: true, message: "No pending patterns to learn" };
    }
    if (data.status === "processing") {
        return { success: false, message: "Already processing" };
    }
    // Mark as processing
    await queueRef.update({ status: "processing" });
    try {
        const partnerIds = data.pendingPartners;
        console.log(`Manual trigger: Processing ${partnerIds.length} partners for user ${userId}`);
        const { learnPatternsForPartnersBatch } = await Promise.resolve().then(() => __importStar(require("./learnPartnerPatterns")));
        await learnPatternsForPartnersBatch(userId, partnerIds);
        // Clear the queue
        await queueRef.update({
            pendingPartners: [],
            status: "idle",
            processAfter: firestore_1.FieldValue.delete(),
            queuedAt: firestore_1.FieldValue.delete(),
        });
        return {
            success: true,
            message: `Learned patterns for ${partnerIds.length} partners`
        };
    }
    catch (error) {
        await queueRef.update({ status: "idle" });
        throw new https_1.HttpsError("internal", `Learning failed: ${error instanceof Error ? error.message : "Unknown"}`);
    }
});
//# sourceMappingURL=learningQueue.js.map