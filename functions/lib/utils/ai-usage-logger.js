"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateAICost = calculateAICost;
exports.logAIUsage = logAIUsage;
const firestore_1 = require("firebase-admin/firestore");
// Pricing per million tokens (USD)
const AI_MODEL_PRICING = {
    // Claude models
    "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
    "claude-3-5-haiku-20241022": { input: 0.8, output: 4.0 },
    "claude-3-haiku-20240307": { input: 0.25, output: 1.25 },
    // Gemini models (via Vertex AI)
    "gemini-2.0-flash-lite-001": { input: 0.075, output: 0.30 },
    "gemini-2.0-flash-001": { input: 0.10, output: 0.40 },
    "gemini-2.5-flash-preview-05-20": { input: 0.15, output: 0.60 },
};
/**
 * Calculate estimated cost based on model pricing
 */
function calculateAICost(model, inputTokens, outputTokens) {
    const pricing = AI_MODEL_PRICING[model] || AI_MODEL_PRICING["claude-sonnet-4-20250514"];
    return (inputTokens * pricing.input + outputTokens * pricing.output) / 1000000;
}
/**
 * Log AI usage to Firestore (for use in Cloud Functions with Admin SDK)
 */
async function logAIUsage(userId, params) {
    const db = (0, firestore_1.getFirestore)();
    const cost = calculateAICost(params.model, params.inputTokens, params.outputTokens);
    try {
        await db.collection("aiUsage").add({
            userId,
            function: params.function,
            model: params.model,
            inputTokens: params.inputTokens,
            outputTokens: params.outputTokens,
            estimatedCost: cost,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            metadata: params.metadata || null,
        });
        console.log(`[AI Usage] ${params.function}`, {
            model: params.model,
            inputTokens: params.inputTokens,
            outputTokens: params.outputTokens,
            estimatedCost: `$${cost.toFixed(4)}`,
        });
    }
    catch (error) {
        // Don't fail the main request if logging fails
        console.error("[AI Usage] Failed to log usage:", error);
    }
}
//# sourceMappingURL=ai-usage-logger.js.map