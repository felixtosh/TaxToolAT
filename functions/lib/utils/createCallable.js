"use strict";
/**
 * Factory for creating Cloud Functions with automatic usage tracking.
 * All data operations should use this wrapper to ensure consistent
 * logging of function invocations for admin and user dashboards.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpsError = void 0;
exports.createCallable = createCallable;
const https_1 = require("firebase-functions/v2/https");
Object.defineProperty(exports, "HttpsError", { enumerable: true, get: function () { return https_1.HttpsError; } });
const firestore_1 = require("firebase-admin/firestore");
// Pricing per million tokens (USD)
const AI_MODEL_PRICING = {
    // Claude models
    "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
    "claude-3-5-haiku-20241022": { input: 0.8, output: 4.0 },
    "claude-3-haiku-20240307": { input: 0.25, output: 1.25 },
    // Gemini models (via Vertex AI)
    "gemini-2.0-flash-lite-001": { input: 0.075, output: 0.3 },
    "gemini-2.0-flash-001": { input: 0.1, output: 0.4 },
    "gemini-2.5-flash-preview-05-20": { input: 0.15, output: 0.6 },
};
function calculateAICost(model, inputTokens, outputTokens) {
    const pricing = AI_MODEL_PRICING[model] || AI_MODEL_PRICING["claude-sonnet-4-20250514"];
    return (inputTokens * pricing.input + outputTokens * pricing.output) / 1000000;
}
/**
 * Create a callable Cloud Function with automatic usage tracking.
 *
 * @example
 * ```typescript
 * export const updateTransactionCallable = createCallable<UpdateRequest, UpdateResponse>(
 *   { name: "updateTransaction" },
 *   async (ctx, data) => {
 *     // ctx.userId - authenticated user
 *     // ctx.db - Firestore instance
 *     // ctx.logAIUsage() - log AI usage if needed
 *     return { success: true };
 *   }
 * );
 * ```
 */
function createCallable(config, handler) {
    return (0, https_1.onCall)({
        region: "europe-west1",
        memory: config.memory || "256MiB",
        timeoutSeconds: config.timeoutSeconds || 60,
        secrets: config.secrets || [],
    }, async (request) => {
        // 1. Auth check
        if (!request.auth) {
            throw new https_1.HttpsError("unauthenticated", "Must be authenticated");
        }
        const userId = request.auth.uid;
        const startTime = Date.now();
        const db = (0, firestore_1.getFirestore)();
        // AI usage accumulator for this call
        const aiUsageRecords = [];
        // Create context for handler
        const ctx = {
            userId,
            db,
            request,
            logAIUsage: async (params) => {
                aiUsageRecords.push(params);
            },
        };
        console.log(`[${config.name}] Started`, { userId });
        try {
            // 2. Execute handler
            const result = await handler(ctx, request.data);
            const durationMs = Date.now() - startTime;
            console.log(`[${config.name}] Success`, { userId, durationMs });
            // 3. Log success (non-blocking)
            if (!config.skipUsageLogging) {
                logFunctionCall(db, {
                    functionName: config.name,
                    userId,
                    status: "success",
                    durationMs,
                    createdAt: firestore_1.FieldValue.serverTimestamp(),
                }).catch((err) => console.error(`[${config.name}] Failed to log success:`, err));
            }
            // 4. Log any AI usage (non-blocking)
            for (const aiUsage of aiUsageRecords) {
                logAIUsageRecord(db, userId, aiUsage, config.name).catch((err) => console.error(`[${config.name}] Failed to log AI usage:`, err));
            }
            return result;
        }
        catch (error) {
            const durationMs = Date.now() - startTime;
            const errorCode = error instanceof https_1.HttpsError ? error.code : "internal";
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            console.error(`[${config.name}] Error`, {
                userId,
                durationMs,
                errorCode,
                errorMessage,
            });
            // Log error (non-blocking)
            if (!config.skipUsageLogging) {
                logFunctionCall(db, {
                    functionName: config.name,
                    userId,
                    status: "error",
                    durationMs,
                    errorCode,
                    errorMessage,
                    createdAt: firestore_1.FieldValue.serverTimestamp(),
                }).catch((err) => console.error(`[${config.name}] Failed to log error:`, err));
            }
            // Re-throw HttpsError as-is, wrap others
            if (error instanceof https_1.HttpsError) {
                throw error;
            }
            throw new https_1.HttpsError("internal", "Operation failed");
        }
    });
}
async function logFunctionCall(db, log) {
    await db.collection("functionCalls").add(log);
}
async function logAIUsageRecord(db, userId, params, callingFunction) {
    const cost = calculateAICost(params.model, params.inputTokens, params.outputTokens);
    await db.collection("aiUsage").add({
        userId,
        function: params.function || callingFunction,
        model: params.model,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        estimatedCost: cost,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        metadata: params.metadata || null,
    });
    console.log(`[AI Usage] ${params.function || callingFunction}`, {
        model: params.model,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        estimatedCost: `$${cost.toFixed(4)}`,
    });
}
//# sourceMappingURL=createCallable.js.map