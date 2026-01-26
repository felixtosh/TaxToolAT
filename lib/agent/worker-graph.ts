/**
 * Worker Graph
 *
 * LangGraph implementation for worker agents.
 * Workers are independent graphs with restricted toolsets
 * that run automation tasks.
 */

import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import {
  AIMessage,
  BaseMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { StructuredToolInterface } from "@langchain/core/tools";
import { ALL_TOOLS } from "./tools";
import { getWorkerConfig } from "./worker-configs";
import { getWorkerPrompt } from "@/lib/chat/worker-prompts";
import { createChatModel, ModelProvider } from "./model";
import { WorkerType, WorkerAction } from "@/types/worker";

// ============================================================================
// State Definition
// ============================================================================

/**
 * Worker state annotation
 */
const WorkerStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  userId: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),
  authHeader: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),
  runId: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),
  workerType: Annotation<WorkerType>({
    reducer: (_, next) => next,
    default: () => "file_matching" as WorkerType,
  }),
  modelProvider: Annotation<ModelProvider>({
    reducer: (_, next) => next,
    default: () => "gemini" as ModelProvider,
  }),
  messageCount: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),
  shouldContinue: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => true,
  }),
  actionsPerformed: Annotation<WorkerAction[]>({
    reducer: (prev, next) => [...(prev || []), ...(next || [])],
    default: () => [],
  }),
});

type WorkerState = typeof WorkerStateAnnotation.State;

// ============================================================================
// Tool Filtering
// ============================================================================

/**
 * Filter tools based on worker config
 */
function getWorkerTools(workerType: WorkerType): StructuredToolInterface[] {
  const config = getWorkerConfig(workerType);
  const allowedTools = new Set(config.toolNames);

  const filteredTools = ALL_TOOLS.filter((tool) => allowedTools.has(tool.name));

  console.log(
    `[WorkerGraph] Filtered to ${filteredTools.length} tools for ${workerType}:`,
    filteredTools.map((t) => t.name).join(", ")
  );

  return filteredTools;
}

// ============================================================================
// Model Cache
// ============================================================================

// Cache models per worker type + provider combination
const modelCache = new Map<string, Awaited<ReturnType<typeof createChatModel>>>();

async function getWorkerModel(workerType: WorkerType, provider: ModelProvider) {
  const cacheKey = `${workerType}:${provider}`;

  if (!modelCache.has(cacheKey)) {
    console.log(`[WorkerGraph] Creating ${provider} model for ${workerType}`);
    const tools = getWorkerTools(workerType);
    const model = await createChatModel({ provider }, tools);
    modelCache.set(cacheKey, model);
  }

  return modelCache.get(cacheKey)!;
}

// ============================================================================
// Graph Nodes
// ============================================================================

/**
 * Agent node - calls the LLM with tools
 */
async function agentNode(state: WorkerState): Promise<Partial<WorkerState>> {
  const { messages, workerType, modelProvider } = state;
  const config = getWorkerConfig(workerType);

  // Get the model
  const model = await getWorkerModel(workerType, modelProvider);

  // Add system message if not present
  const hasSystemMessage = messages.some((m) => m instanceof SystemMessage);
  const systemPrompt = getWorkerPrompt(config.systemPromptKey);
  const messagesWithSystem = hasSystemMessage
    ? messages
    : [new SystemMessage(systemPrompt), ...messages];

  console.log(`[Worker:${workerType}] Agent node, ${messagesWithSystem.length} messages`);

  // Call the model
  let response;
  try {
    response = await model.invoke(messagesWithSystem, {
      configurable: {
        userId: state.userId,
        authHeader: state.authHeader,
      },
    });
  } catch (error) {
    console.error(`[Worker:${workerType}] Model invoke failed:`, error);
    // Log the last few messages for debugging
    const lastMessages = messagesWithSystem.slice(-3);
    console.error(`[Worker:${workerType}] Last messages:`, JSON.stringify(lastMessages.map(m => ({
      type: m.constructor.name,
      content: typeof m.content === 'string' ? m.content.slice(0, 200) : m.content,
    })), null, 2));
    throw error;
  }

  // Count messages for runaway prevention
  const newMessageCount = state.messageCount + 1;

  return {
    messages: [response],
    messageCount: newMessageCount,
  };
}

/**
 * Create tools node for a specific worker type
 */
function createToolsNode(workerType: WorkerType) {
  const tools = getWorkerTools(workerType);
  const rawToolsNode = new ToolNode(tools);

  return async function toolsNode(
    state: WorkerState,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config?: any
  ): Promise<Partial<WorkerState>> {
    const { userId, authHeader } = state;

    const toolConfig = {
      ...config,
      configurable: {
        ...config?.configurable,
        userId,
        authHeader,
      },
    };

    try {
      const result = await rawToolsNode.invoke(state, toolConfig);
      console.log(`[Worker:${workerType}] Tools executed, got ${result.messages?.length} messages`);
      return result;
    } catch (error) {
      console.error(`[Worker:${workerType}] Tool execution error:`, error);
      throw error;
    }
  };
}

/**
 * Respond node - generates final response
 */
async function respondNode(state: WorkerState): Promise<Partial<WorkerState>> {
  return {
    shouldContinue: false,
  };
}

// ============================================================================
// Routing
// ============================================================================

/**
 * Route after agent node
 */
function routeAfterAgent(state: WorkerState): "tools" | "respond" {
  const { messages, messageCount, workerType } = state;
  const config = getWorkerConfig(workerType);
  const lastMessage = messages[messages.length - 1];

  // Check for runaway prevention
  if (messageCount >= config.maxMessages) {
    console.log(`[Worker:${workerType}] Max messages (${config.maxMessages}) reached, stopping`);
    return "respond";
  }

  // Check for tool calls
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const msgAny = lastMessage as any;
  const toolCalls = msgAny?.tool_calls || msgAny?.additional_kwargs?.tool_calls || [];

  if (!toolCalls.length) {
    return "respond";
  }

  console.log(`[Worker:${workerType}] Routing to tools: ${toolCalls.map((tc: { name: string }) => tc.name).join(", ")}`);
  return "tools";
}

/**
 * Route after tools node
 */
function routeAfterTools(state: WorkerState): "agent" | "respond" {
  const { messages, messageCount, workerType } = state;
  const config = getWorkerConfig(workerType);
  const lastMessage = messages[messages.length - 1];

  // Check for runaway prevention
  if (messageCount >= config.maxMessages) {
    console.log(`[Worker:${workerType}] Max messages reached after tools, stopping`);
    return "respond";
  }

  // If the last message is a tool message, continue to agent
  if (lastMessage instanceof ToolMessage) {
    return "agent";
  }

  return "respond";
}

// ============================================================================
// Graph Builder
// ============================================================================

/**
 * Build a worker graph for a specific worker type
 */
export function buildWorkerGraph(workerType: WorkerType) {
  console.log(`[WorkerGraph] Building graph for ${workerType}`);

  const toolsNode = createToolsNode(workerType);

  const graph = new StateGraph(WorkerStateAnnotation)
    .addNode("agent", agentNode)
    .addNode("tools", toolsNode)
    .addNode("respond", respondNode)
    .addEdge(START, "agent")
    .addConditionalEdges("agent", routeAfterAgent, {
      tools: "tools",
      respond: "respond",
    })
    .addConditionalEdges("tools", routeAfterTools, {
      agent: "agent",
      respond: "respond",
    })
    .addEdge("respond", END);

  return graph.compile();
}

// ============================================================================
// Helper to run the worker graph
// ============================================================================

export interface RunWorkerInput {
  messages: BaseMessage[];
  userId: string;
  authHeader: string;
  workerType: WorkerType;
  runId: string;
  modelProvider?: ModelProvider;
}

export interface RunWorkerOutput {
  messages: BaseMessage[];
  actionsPerformed: WorkerAction[];
}

/**
 * Run a worker graph
 */
export async function runWorkerGraph(input: RunWorkerInput): Promise<RunWorkerOutput> {
  const graph = buildWorkerGraph(input.workerType);
  const config = getWorkerConfig(input.workerType);

  // Set recursion limit based on worker config (each agent->tools cycle is ~2 steps)
  const recursionLimit = (config.maxMessages * 2) + 5;

  const result = await graph.invoke(
    {
      messages: input.messages,
      userId: input.userId,
      authHeader: input.authHeader,
      workerType: input.workerType,
      runId: input.runId,
      modelProvider: input.modelProvider || "gemini",
      messageCount: 0,
      shouldContinue: true,
      actionsPerformed: [],
    },
    {
      recursionLimit,
    }
  );

  return {
    messages: result.messages,
    actionsPerformed: result.actionsPerformed || [],
  };
}

/**
 * Stream a worker graph execution
 */
export async function* streamWorkerGraph(input: RunWorkerInput) {
  const graph = buildWorkerGraph(input.workerType);
  const config = getWorkerConfig(input.workerType);
  const recursionLimit = (config.maxMessages * 2) + 5;

  const stream = await graph.stream(
    {
      messages: input.messages,
      userId: input.userId,
      authHeader: input.authHeader,
      workerType: input.workerType,
      runId: input.runId,
      modelProvider: input.modelProvider || "gemini",
      messageCount: 0,
      shouldContinue: true,
      actionsPerformed: [],
    },
    {
      streamMode: "messages",
      recursionLimit,
    }
  );

  for await (const chunk of stream) {
    yield chunk;
  }
}
