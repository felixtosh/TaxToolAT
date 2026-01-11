import { Timestamp } from "firebase/firestore";

export type AIFunction =
  | "chat"
  | "companyLookup"
  | "companyLookupSearch"
  | "patternLearning"
  | "columnMatching"
  | "extraction"
  | "classification";

export interface AIUsageRecord {
  id: string;
  userId: string;
  function: AIFunction;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number; // in USD
  createdAt: Timestamp;
  metadata?: {
    partnerId?: string;
    sourceId?: string;
    fileId?: string;
    webSearchUsed?: boolean;
  } | null;
}

export interface AIUsageSummary {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  byFunction: Record<
    AIFunction,
    {
      calls: number;
      inputTokens: number;
      outputTokens: number;
      cost: number;
    }
  >;
  byModel: Record<
    string,
    {
      calls: number;
      inputTokens: number;
      outputTokens: number;
      cost: number;
    }
  >;
}

export interface AIUsageDailyStats {
  date: string; // ISO date string (YYYY-MM-DD)
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

// Pricing per million tokens (USD)
export const AI_MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Claude models
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
  "claude-3-5-haiku-20241022": { input: 0.8, output: 4.0 },
  "claude-3-haiku-20240307": { input: 0.25, output: 1.25 },
  // Gemini models (via Vertex AI)
  "gemini-2.0-flash-lite-001": { input: 0.075, output: 0.30 },
  "gemini-2.0-flash-001": { input: 0.10, output: 0.40 },
  "gemini-2.5-flash-preview-05-20": { input: 0.15, output: 0.60 },
};
