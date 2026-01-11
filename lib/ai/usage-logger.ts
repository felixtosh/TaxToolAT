import { Firestore, addDoc, collection, Timestamp } from "firebase/firestore";
import { AIFunction, AI_MODEL_PRICING } from "@/types/ai-usage";

export interface AIUsageParams {
  function: AIFunction;
  model: string;
  inputTokens: number;
  outputTokens: number;
  metadata?: {
    partnerId?: string;
    sourceId?: string;
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
 * Log AI usage to Firestore (for use in API routes)
 */
export async function logAIUsageToFirestore(
  db: Firestore,
  userId: string,
  params: AIUsageParams
): Promise<void> {
  const cost = calculateAICost(params.model, params.inputTokens, params.outputTokens);

  try {
    await addDoc(collection(db, "aiUsage"), {
      userId,
      function: params.function,
      model: params.model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      estimatedCost: cost,
      createdAt: Timestamp.now(),
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

/**
 * Format model name for display
 */
export function formatModelName(model: string): string {
  if (model.includes("sonnet")) return "Claude Sonnet 4";
  if (model.includes("haiku")) return "Claude 3.5 Haiku";
  if (model.includes("opus")) return "Claude Opus";
  return model;
}

/**
 * Format function name for display
 */
export function formatFunctionName(fn: AIFunction): string {
  const names: Record<AIFunction, string> = {
    chat: "Chat",
    companyLookup: "Company Lookup",
    companyLookupSearch: "Company Lookup (Search)",
    patternLearning: "Pattern Learning",
    columnMatching: "Column Matching",
    extraction: "Extraction",
    classification: "Classification",
  };
  return names[fn] || fn;
}
