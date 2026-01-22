/**
 * LangGraph Agent Types
 *
 * Type definitions for the agentic system.
 */

import { BaseMessage } from "@langchain/core/messages";

// ============================================================================
// Agent State
// ============================================================================

/**
 * The state of the agent graph
 */
export interface AgentState {
  /** Conversation messages */
  messages: BaseMessage[];

  /** Current user ID */
  userId: string;

  /** Auth header for API calls */
  authHeader: string;

  /** Current transaction context (if any) */
  currentTransaction?: {
    id: string;
    name: string;
    amount: number;
    date: string;
    partner?: string;
    partnerId?: string;
  };

  /** Search state for agentic receipt search */
  searchState?: {
    iteration: number;
    maxIterations: number;
    searchesPerformed: Array<{
      type: string;
      query?: string;
      candidatesFound: number;
      at: Date;
    }>;
    nominatedCandidates: Array<{
      id: string;
      filename: string;
      score: number;
      reason: string;
    }>;
    filesConnected: string[];
  };

  /** Tool call that requires confirmation */
  pendingConfirmation?: {
    toolName: string;
    toolCallId: string;
    args: Record<string, unknown>;
  };

  /** Whether the agent should continue */
  shouldContinue: boolean;

  /** Final response to user */
  finalResponse?: string;

  /** Error state */
  error?: string;
}

// ============================================================================
// Tool Types
// ============================================================================

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface ConfirmableToolCall {
  toolName: string;
  toolCallId: string;
  args: Record<string, unknown>;
  confirmationMessage: string;
}

// ============================================================================
// Graph Nodes
// ============================================================================

export type NodeName =
  | "agent"
  | "tools"
  | "confirmation"
  | "respond"
  | "error";

// ============================================================================
// Langfuse Tracing
// ============================================================================

export interface TraceMetadata {
  userId: string;
  sessionId?: string;
  transactionId?: string;
  toolsUsed: string[];
  totalTokens?: number;
}
