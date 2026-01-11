import { getFirestore, FieldValue } from "firebase-admin/firestore";

type AIFunction =
  | "chat"
  | "companyLookup"
  | "companyLookupSearch"
  | "patternLearning"
  | "columnMatching"
  | "extraction"
  | "classification"
  | "domainValidation";

// Pricing per million tokens (USD)
const AI_MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Claude models
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
  "claude-3-5-haiku-20241022": { input: 0.8, output: 4.0 },
  "claude-3-haiku-20240307": { input: 0.25, output: 1.25 },
  // Gemini models (via Vertex AI)
  "gemini-2.0-flash-lite-001": { input: 0.075, output: 0.30 },
  "gemini-2.0-flash-001": { input: 0.10, output: 0.40 },
  "gemini-2.5-flash-preview-05-20": { input: 0.15, output: 0.60 },
};

export interface AIUsageParams {
  function: AIFunction;
  model: string;
  inputTokens: number;
  outputTokens: number;
  metadata?: {
    partnerId?: string;
    sourceId?: string;
    fileId?: string;
    webSearchUsed?: boolean;
  } | null;
}

/**
 * Calculate estimated cost based on model pricing
 */
export function calculateAICost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = AI_MODEL_PRICING[model] || AI_MODEL_PRICING["claude-sonnet-4-20250514"];
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

/**
 * Log AI usage to Firestore (for use in Cloud Functions with Admin SDK)
 */
export async function logAIUsage(
  userId: string,
  params: AIUsageParams
): Promise<void> {
  const db = getFirestore();
  const cost = calculateAICost(params.model, params.inputTokens, params.outputTokens);

  try {
    await db.collection("aiUsage").add({
      userId,
      function: params.function,
      model: params.model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      estimatedCost: cost,
      createdAt: FieldValue.serverTimestamp(),
      metadata: params.metadata || null,
    });

    console.log(`[AI Usage] ${params.function}`, {
      model: params.model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      estimatedCost: `$${cost.toFixed(4)}`,
    });
  } catch (error) {
    // Don't fail the main request if logging fails
    console.error("[AI Usage] Failed to log usage:", error);
  }
}
