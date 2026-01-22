/**
 * LangFuse Integration
 *
 * Provides observability and tracing for the agent.
 */

import { Langfuse } from "langfuse";
import { CallbackHandler } from "langfuse-langchain";

// ============================================================================
// Langfuse Client
// ============================================================================

let langfuseClient: Langfuse | null = null;

/**
 * Get or create the Langfuse client
 */
export function getLangfuseClient(): Langfuse | null {
  if (langfuseClient) return langfuseClient;

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com";

  if (!publicKey || !secretKey) {
    console.warn("[Langfuse] Missing API keys, tracing disabled");
    return null;
  }

  langfuseClient = new Langfuse({
    publicKey,
    secretKey,
    baseUrl,
  });

  return langfuseClient;
}

// ============================================================================
// Callback Handler for LangChain
// ============================================================================

/**
 * Create a Langfuse callback handler for LangChain
 */
export function createLangfuseHandler(options?: {
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}): CallbackHandler | null {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com";

  if (!publicKey || !secretKey) {
    return null;
  }

  return new CallbackHandler({
    publicKey,
    secretKey,
    baseUrl,
    userId: options?.userId,
    sessionId: options?.sessionId,
    metadata: options?.metadata,
  });
}

// ============================================================================
// Trace Helpers
// ============================================================================

export interface TraceOptions {
  userId: string;
  sessionId?: string;
  name: string;
  metadata?: Record<string, unknown>;
}

/**
 * Create a trace for manual instrumentation
 */
export function createTrace(options: TraceOptions) {
  const client = getLangfuseClient();
  if (!client) return null;

  return client.trace({
    name: options.name,
    userId: options.userId,
    sessionId: options.sessionId,
    metadata: options.metadata,
  });
}

/**
 * Log a generation (LLM call)
 */
export function logGeneration(
  trace: ReturnType<typeof createTrace>,
  options: {
    name: string;
    model: string;
    input: unknown;
    output: unknown;
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
    metadata?: Record<string, unknown>;
  }
) {
  if (!trace) return;

  trace.generation({
    name: options.name,
    model: options.model,
    input: options.input,
    output: options.output,
    usage: options.usage,
    metadata: options.metadata,
  });
}

/**
 * Log a span (non-LLM operation)
 */
export function logSpan(
  trace: ReturnType<typeof createTrace>,
  options: {
    name: string;
    input?: unknown;
    output?: unknown;
    metadata?: Record<string, unknown>;
  }
) {
  if (!trace) return;

  trace.span({
    name: options.name,
    input: options.input,
    output: options.output,
    metadata: options.metadata,
  });
}

/**
 * Log an event
 */
export function logEvent(
  trace: ReturnType<typeof createTrace>,
  options: {
    name: string;
    metadata?: Record<string, unknown>;
  }
) {
  if (!trace) return;

  trace.event({
    name: options.name,
    metadata: options.metadata,
  });
}

// ============================================================================
// Score Helpers
// ============================================================================

/**
 * Log a score for evaluation
 */
export function logScore(
  trace: ReturnType<typeof createTrace>,
  options: {
    name: string;
    value: number;
    comment?: string;
  }
) {
  if (!trace) return;

  trace.score({
    name: options.name,
    value: options.value,
    comment: options.comment,
  });
}

// ============================================================================
// Flush
// ============================================================================

/**
 * Flush pending events to Langfuse
 */
export async function flushLangfuse() {
  const client = getLangfuseClient();
  if (!client) return;

  await client.flushAsync();
}
