/**
 * Chat API Route - Full LangGraph Implementation
 *
 * Uses LangGraph for agent orchestration with:
 * - @ai-sdk/langchain adapter for streaming
 * - LangFuse tracing
 * - Vercel AI SDK compatible response format
 */

import { createUIMessageStreamResponse } from "ai";
import { toUIMessageStream } from "@ai-sdk/langchain";
import { getServerUserIdWithFallback } from "@/lib/auth/get-server-user";
import { buildAgentGraph, ModelProvider } from "@/lib/agent/graph";
import { getModelId, calculateCost } from "@/lib/agent/model";
import { createLangfuseHandler, flushLangfuse } from "@/lib/agent/langfuse";
import {
  HumanMessage,
  AIMessage,
  AIMessageChunk,
  SystemMessage,
  ToolMessage,
  BaseMessage,
} from "@langchain/core/messages";
import { SYSTEM_PROMPT } from "@/lib/chat/system-prompt";
import { getAdminDb } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

const db = getAdminDb();

export const maxDuration = 60;

// ============================================================================
// Message Conversion
// ============================================================================

interface UIMessageInput {
  id: string;
  role: "user" | "assistant" | "system";
  content?: string;
  parts?: Array<{
    type: string;
    text?: string;
    toolCallId?: string;
    toolName?: string;
    args?: Record<string, unknown>;
    input?: Record<string, unknown>;
    result?: unknown;
    output?: unknown;
    [key: string]: unknown;
  }>;
}

/**
 * Convert UI messages to LangChain message format
 */
function convertToLangChainMessages(uiMessages: UIMessageInput[]): BaseMessage[] {
  const result: BaseMessage[] = [];

  for (const msg of uiMessages) {
    if (msg.role === "user") {
      const content =
        msg.content ||
        msg.parts
          ?.filter((p) => p.type === "text" && p.text)
          .map((p) => p.text)
          .join("") ||
        "";
      if (content.trim()) {
        result.push(new HumanMessage(content));
      }
      continue;
    }

    if (msg.role === "assistant") {
      let textContent = "";
      const toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];
      const toolResults: Array<{ toolCallId: string; result: unknown }> = [];

      if (msg.parts) {
        for (const part of msg.parts) {
          if (part.type === "text" && part.text) {
            textContent += part.text;
          } else if (part.type.startsWith("tool-")) {
            const toolName = part.type.replace("tool-", "");
            const toolCallId = part.toolCallId as string;
            const args = (part.args || part.input || {}) as Record<string, unknown>;
            const toolResult = part.result ?? part.output;

            toolCalls.push({ id: toolCallId, name: toolName, args });

            if (toolResult !== undefined) {
              toolResults.push({ toolCallId, result: toolResult });
            }
          }
        }
      } else if (msg.content) {
        textContent = msg.content;
      }

      if (textContent || toolCalls.length > 0) {
        result.push(
          new AIMessage({
            content: textContent,
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
          })
        );
      }

      for (const tr of toolResults) {
        result.push(
          new ToolMessage({
            tool_call_id: tr.toolCallId,
            content: typeof tr.result === "string" ? tr.result : JSON.stringify(tr.result),
          })
        );
      }
      continue;
    }

    if (msg.role === "system" && msg.content) {
      result.push(new SystemMessage(msg.content));
    }
  }

  return result;
}

// ============================================================================
// AI Usage Logging
// ============================================================================

async function logAIUsage(
  userId: string,
  params: {
    function: string;
    model: string;
    modelProvider: ModelProvider;
    inputTokens: number;
    outputTokens: number;
  }
): Promise<void> {
  const cost = calculateCost(params.modelProvider, params.inputTokens, params.outputTokens);

  try {
    await db.collection("aiUsage").add({
      userId,
      function: params.function,
      model: params.model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      estimatedCost: cost,
      createdAt: Timestamp.now(),
      metadata: null,
    });

    console.log(`[AI Usage] ${params.function}`, {
      model: params.model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      estimatedCost: `$${cost.toFixed(4)}`,
    });
  } catch (error) {
    console.error("[AI Usage] Failed to log usage:", error);
  }
}

// ============================================================================
// API Handler
// ============================================================================

export async function POST(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  const userId = await getServerUserIdWithFallback(req);
  const { messages: rawMessages, modelProvider: requestedProvider } = await req.json();

  // Determine model provider (default to gemini for cost savings, anthropic as backup)
  const modelProvider: ModelProvider = requestedProvider || "gemini";

  console.log(`[Chat API] Starting LangGraph agent with ${modelProvider}, ${rawMessages.length} messages`);

  // Convert messages to LangChain format
  const messages = convertToLangChainMessages(rawMessages);

  // Add system message if not present
  const hasSystemMessage = messages.some((m) => m instanceof SystemMessage);
  if (!hasSystemMessage) {
    messages.unshift(new SystemMessage(SYSTEM_PROMPT));
  }

  // Create Langfuse handler for tracing
  const langfuseHandler = createLangfuseHandler({
    userId,
    metadata: {
      messageCount: messages.length,
    },
  });

  // Build the graph
  const graph = buildAgentGraph();

  // Track token usage
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Use graph.stream with messages streamMode for best compatibility with toUIMessageStream
  const graphStream = await graph.stream(
    {
      messages,
      userId,
      authHeader,
      modelProvider,
      pendingConfirmation: null,
      shouldContinue: true,
    },
    {
      streamMode: ["messages"] as const,
      callbacks: langfuseHandler ? [langfuseHandler] : undefined,
    }
  );

  // Wrap stream to capture token usage while preserving the langgraph format
  // The graphStream with streamMode: ["messages"] yields tuples: ["messages", [AIMessageChunk, metadata]]
  // We must yield the FULL tuple for toUIMessageStream to detect it as langgraph format
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function* trackUsage(): AsyncGenerator<any> {
    for await (const chunk of graphStream) {
      // Format: ["messages", [AIMessageChunk, metadata]]
      if (!Array.isArray(chunk) || chunk[0] !== "messages") {
        // Pass through non-messages chunks
        yield chunk;
        continue;
      }

      const msgData = chunk[1] as [AIMessageChunk, unknown];
      if (!Array.isArray(msgData)) {
        yield chunk;
        continue;
      }

      const msgChunk = msgData[0];
      if (msgChunk) {
        // Extract usage metadata from kwargs (serialized LC format)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chunkObj = msgChunk as any;
        const kwargs = chunkObj.kwargs || chunkObj;
        const usageMeta = kwargs.usage_metadata;

        if (usageMeta) {
          totalInputTokens += usageMeta.input_tokens || 0;
          totalOutputTokens += usageMeta.output_tokens || 0;
          console.log("[Token Usage]", usageMeta);
        }

        // Log content for debugging (from kwargs for serialized format)
        const content = kwargs.content;
        if (Array.isArray(content) && content.length > 0) {
          const textBlocks = content.filter((c: { type: string }) => c.type === "text");
          if (textBlocks.length > 0) {
            const text = textBlocks.map((c: { text: string }) => c.text || "").join("");
            if (text) {
              console.log("[Stream] Text:", JSON.stringify(text.slice(0, 50)));
            }
          }
          // Log tool calls
          const toolBlocks = content.filter((c: { type: string }) => c.type === "tool_use");
          if (toolBlocks.length > 0) {
            console.log("[Stream] Tool call:", JSON.stringify(toolBlocks[0]));
          }
        }

        // Log tool_call_chunks if present
        const toolCallChunks = kwargs.tool_call_chunks;
        if (toolCallChunks && toolCallChunks.length > 0) {
          console.log("[Stream] Tool chunks:", JSON.stringify(toolCallChunks));
        }
      }

      // Yield the FULL chunk (preserves langgraph format for toUIMessageStream)
      yield chunk;
    }
  }

  // Convert to UI message stream using official adapter
  // By yielding the full ["messages", [chunk, metadata]] format, the adapter
  // will detect this as langgraph format and properly handle serialized LC objects
  // Create a wrapper to log what chunks are being sent to the frontend
  const wrappedStream = new TransformStream({
    transform(chunk, controller) {
      // Log the chunk type
      if (chunk && typeof chunk === "object" && "type" in chunk) {
        const c = chunk as { type: string; [key: string]: unknown };
        if (c.type.includes("tool")) {
          console.log("[UI Chunk] Tool chunk:", JSON.stringify(c).slice(0, 200));
        }
      }
      controller.enqueue(chunk);
    },
  });

  const uiStream = toUIMessageStream(trackUsage(), {
    onText: (text) => {
      console.log("[UI Stream] onText:", JSON.stringify(text.slice(0, 50)));
    },
    onFinal: async () => {
      console.log("[Stream] Complete, tokens:", { totalInputTokens, totalOutputTokens });

      // Log AI usage
      if (userId && (totalInputTokens > 0 || totalOutputTokens > 0)) {
        await logAIUsage(userId, {
          function: "chat",
          model: getModelId(modelProvider),
          modelProvider,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
        });
      }

      // Flush Langfuse
      await flushLangfuse();
    },
  });

  // Pipe through the logging wrapper
  const loggedStream = uiStream.pipeThrough(wrappedStream);
  return createUIMessageStreamResponse({ stream: loggedStream });
}
