import { anthropic } from "@ai-sdk/anthropic";
import { streamText, tool, stepCountIs } from "ai";
import { z } from "zod/v4";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { SYSTEM_PROMPT } from "@/lib/chat/system-prompt";
import { requiresConfirmation } from "@/lib/chat/confirmation-config";
import { logAIUsageToFirestore } from "@/lib/ai/usage-logger";
import { getServerUserIdWithFallback } from "@/lib/auth/get-server-user";
import {
  listSources,
  getSourceById,
  createSource,
  updateSource,
  deleteSource,
  listTransactions,
  getTransaction,
  getTransactionHistory,
  updateTransactionWithHistory,
  rollbackTransaction,
  OperationsContext,
} from "@/lib/operations";

// Initialize Firebase for server-side
const firebaseConfig = {
  apiKey: "AIzaSyDhxXMbHgaD1z9n0bkuVaSRmmiCrbNL-l4",
  authDomain: "taxstudio-f12fb.firebaseapp.com",
  projectId: "taxstudio-f12fb",
  storageBucket: "taxstudio-f12fb.firebasestorage.app",
  messagingSenderId: "534848611676",
  appId: "1:534848611676:web:8a3d1ede57c65b7e884d99",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);

// Connect to Firestore emulator in development
let emulatorConnected = false;
if (process.env.NODE_ENV === "development" && !emulatorConnected) {
  try {
    connectFirestoreEmulator(db, "localhost", 8080);
    emulatorConnected = true;
    console.log("[Chat API] Connected to Firestore emulator");
  } catch (e) {
    // Already connected
  }
}

// User ID will be set per request
let currentUserId: string = "";

function createContext(): OperationsContext {
  return { db, userId: currentUserId };
}

export const maxDuration = 60;

// Convert UI messages to model messages format
// IMPORTANT: Must preserve tool calls and results for multi-turn conversations
interface UIMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content?: string;
  parts?: Array<{
    type: string;
    text?: string;
    toolCallId?: string;
    toolName?: string;
    args?: Record<string, unknown>;
    result?: unknown;
    [key: string]: unknown;
  }>;
}

type ContentPart =
  | { type: "text"; text: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; args: Record<string, unknown> };

type ToolResultPart = { type: "tool-result"; toolCallId: string; result: unknown };

type ConvertedMessage =
  | { role: "user" | "system"; content: string }
  | { role: "assistant"; content: ContentPart[] }
  | { role: "tool"; content: ToolResultPart[] };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertMessages(uiMessages: UIMessage[]): any[] {
  const result: ConvertedMessage[] = [];

  for (const msg of uiMessages) {
    // User messages: just extract text content
    if (msg.role === "user") {
      const content = msg.content ||
        msg.parts?.filter((p) => p.type === "text" && p.text).map((p) => p.text).join("") ||
        "";
      if (content.trim()) {
        result.push({ role: "user", content });
      }
      continue;
    }

    // Assistant messages: need to handle both text and tool calls
    if (msg.role === "assistant" && msg.parts) {
      const contentParts: ContentPart[] = [];
      const toolResults: ToolResultPart[] = [];

      for (const part of msg.parts) {
        if (part.type === "text" && part.text) {
          contentParts.push({ type: "text", text: part.text });
        } else if (part.type.startsWith("tool-")) {
          // Tool part format: type is "tool-{toolName}"
          const toolName = part.type.replace("tool-", "");
          const toolCallId = part.toolCallId as string;
          const args = (part.args || part.input || {}) as Record<string, unknown>;
          const toolResult = part.result ?? part.output;

          // Add tool call to assistant message
          contentParts.push({
            type: "tool-call",
            toolCallId,
            toolName,
            args,
          });

          // If there's a result, collect it for a tool message
          if (toolResult !== undefined) {
            toolResults.push({
              type: "tool-result",
              toolCallId,
              result: toolResult,
            });
          }
        }
      }

      // Add assistant message if it has any content
      if (contentParts.length > 0) {
        result.push({ role: "assistant", content: contentParts });
      }

      // Add tool results as a separate message
      if (toolResults.length > 0) {
        result.push({ role: "tool", content: toolResults });
      }
      continue;
    }

    // Fallback: simple text content
    if (typeof msg.content === "string" && msg.content.trim()) {
      if (msg.role === "system") {
        result.push({ role: "system", content: msg.content });
      } else if (msg.role === "assistant") {
        result.push({ role: "assistant", content: [{ type: "text", text: msg.content }] });
      }
    }
  }

  return result;
}

export async function POST(req: Request) {
  currentUserId = await getServerUserIdWithFallback(req);
  const { messages: rawMessages } = await req.json();
  const messages = convertMessages(rawMessages);
  const ctx = createContext();

  console.log("[Chat API] Starting streamText with", messages.length, "messages");

  const result = streamText({
    model: anthropic("claude-sonnet-4-20250514"),
    system: SYSTEM_PROMPT,
    messages,
    stopWhen: stepCountIs(5), // Allow up to 5 steps for multi-tool execution
    onStepFinish: ({ text, toolCalls, toolResults }) => {
      console.log("[Step finished]", {
        hasText: !!text,
        textLength: text?.length,
        toolCallsCount: toolCalls?.length,
        toolResultsCount: toolResults?.length,
      });
    },
    onFinish: async ({ text, finishReason, usage, steps }) => {
      console.log("[Stream finished]", {
        finishReason,
        totalSteps: steps?.length,
        totalText: text?.length,
        usage,
      });

      // Log AI usage to Firestore
      if (usage && usage.inputTokens !== undefined && usage.outputTokens !== undefined) {
        await logAIUsageToFirestore(db, currentUserId, {
          function: "chat",
          model: "claude-sonnet-4-20250514",
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
        });
      }
    },
    tools: {
      // ===== READ-ONLY TOOLS (no confirmation) =====

      listTransactions: tool({
        description:
          "List transactions with optional filters. Returns date, amount, partner, description, etc.",
        inputSchema: z.object({
          sourceId: z.string().optional().describe("Filter by bank account ID"),
          dateFrom: z.string().optional().describe("Start date (ISO format)"),
          dateTo: z.string().optional().describe("End date (ISO format)"),
          search: z.string().optional().describe("Search in name, description, partner"),
          limit: z.number().max(50).optional().describe("Max results (default 20)"),
        }),
        execute: async (params) => {
          console.log("[Tool] listTransactions called with:", params);
          const transactions = await listTransactions(ctx, {
            sourceId: params.sourceId,
            dateFrom: params.dateFrom ? new Date(params.dateFrom) : undefined,
            dateTo: params.dateTo ? new Date(params.dateTo) : undefined,
            search: params.search,
            limit: params.limit ?? 20,
          });
          console.log("[Tool] listTransactions found:", transactions.length, "transactions");

          const result = transactions.map((t) => {
            const dateObj = t.date.toDate();
            return {
              id: t.id,
              date: dateObj.toISOString(),
              dateFormatted: dateObj.toLocaleDateString("de-DE", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric"
              }),
              amount: t.amount,
              amountFormatted: `${(t.amount / 100).toFixed(2).replace(".", ",")} ${t.currency}`,
              name: t.name,
              description: t.description,
            partner: t.partner,
            isComplete: t.isComplete,
            hasFiles: (t.fileIds?.length || 0) > 0,
            };
          });
          console.log("[Tool] listTransactions returning:", JSON.stringify(result, null, 2));
          return result;
        },
      }),

      getTransaction: tool({
        description: "Get full details of a single transaction by ID",
        inputSchema: z.object({
          transactionId: z.string().describe("The transaction ID"),
        }),
        execute: async ({ transactionId }) => {
          const t = await getTransaction(ctx, transactionId);
          if (!t) return { error: "Transaction not found" };

          return {
            id: t.id,
            date: t.date.toDate().toISOString(),
            amount: t.amount,
            amountFormatted: `${(t.amount / 100).toFixed(2)} ${t.currency}`,
            name: t.name,
            description: t.description,
            partner: t.partner,
            reference: t.reference,
            partnerIban: t.partnerIban,
            isComplete: t.isComplete,
            fileIds: t.fileIds || [],
            sourceId: t.sourceId,
          };
        },
      }),

      listSources: tool({
        description: "List all bank accounts/sources",
        inputSchema: z.object({
          includeInactive: z.boolean().optional().describe("Include inactive sources"),
        }),
        execute: async () => {
          const sources = await listSources(ctx);
          return sources.map((s) => ({
            id: s.id,
            name: s.name,
            accountKind: s.accountKind,
            iban: s.iban,
            cardBrand: s.cardBrand,
            cardLast4: s.cardLast4,
            currency: s.currency,
          }));
        },
      }),

      getSource: tool({
        description: "Get details of a single bank account by ID",
        inputSchema: z.object({
          sourceId: z.string().describe("The source/bank account ID"),
        }),
        execute: async ({ sourceId }) => {
          const s = await getSourceById(ctx, sourceId);
          if (!s) return { error: "Source not found" };

          return {
            id: s.id,
            name: s.name,
            accountKind: s.accountKind,
            iban: s.iban,
            cardBrand: s.cardBrand,
            cardLast4: s.cardLast4,
            currency: s.currency,
          };
        },
      }),

      getTransactionHistory: tool({
        description: "Get the edit history for a transaction (shows previous changes)",
        inputSchema: z.object({
          transactionId: z.string().describe("The transaction ID"),
        }),
        execute: async ({ transactionId }) => {
          const history = await getTransactionHistory(ctx, transactionId);
          return history.map((h) => ({
            id: h.id,
            changedFields: h.changedFields,
            previousState: h.previousState,
            changedBy: h.changedBy,
            changeReason: h.changeReason,
            createdAt: h.createdAt.toDate().toISOString(),
          }));
        },
      }),

      // ===== UI CONTROL TOOLS (no confirmation, client-side execution) =====

      navigateTo: tool({
        description: "Navigate to a page in the application",
        inputSchema: z.object({
          path: z.enum(["/transactions", "/sources"]).describe("The page path"),
        }),
        execute: async ({ path }) => {
          return { action: "navigate", path };
        },
      }),

      openTransactionSheet: tool({
        description: "Open the detail sheet/sidebar for a specific transaction",
        inputSchema: z.object({
          transactionId: z.string().describe("The transaction ID to show"),
        }),
        execute: async ({ transactionId }) => {
          return { action: "openSheet", transactionId };
        },
      }),

      scrollToTransaction: tool({
        description: "Scroll to and highlight a transaction in the list",
        inputSchema: z.object({
          transactionId: z.string().describe("The transaction ID to scroll to"),
        }),
        execute: async ({ transactionId }) => {
          return { action: "scrollTo", transactionId };
        },
      }),

      // ===== DATA MODIFICATION TOOLS (require confirmation) =====

      updateTransaction: tool({
        description:
          "Update a transaction's description or completion status. REQUIRES USER CONFIRMATION.",
        inputSchema: z.object({
          transactionId: z.string().describe("The transaction ID to update"),
          description: z.string().optional().describe("New description for tax purposes"),
          isComplete: z.boolean().optional().describe("Mark as complete/incomplete"),
        }),
        execute: async ({ transactionId, ...updates }) => {
          await updateTransactionWithHistory(
            ctx,
            transactionId,
            updates,
            { type: "ai_chat", userId: ctx.userId },
            "Updated via AI chat"
          );
          return { success: true, transactionId };
        },
      }),

      createSource: tool({
        description: "Create a new bank account/source. REQUIRES USER CONFIRMATION.",
        inputSchema: z.object({
          name: z.string().describe("Display name for the account"),
          accountKind: z.enum(["bank_account", "credit_card"]).optional().describe("Type of account (default: bank_account)"),
          iban: z.string().optional().describe("IBAN of the bank account (required for bank accounts, optional for credit cards)"),
          currency: z.string().optional().describe("Currency code (default EUR)"),
        }),
        execute: async ({ name, accountKind, iban, currency }) => {
          const sourceId = await createSource(ctx, {
            name,
            accountKind: accountKind ?? "bank_account",
            iban,
            currency: currency ?? "EUR",
            type: "csv",
          });
          return { success: true, sourceId };
        },
      }),

      rollbackTransaction: tool({
        description:
          "Rollback a transaction to a previous state from its history. REQUIRES USER CONFIRMATION.",
        inputSchema: z.object({
          transactionId: z.string().describe("The transaction ID"),
          historyId: z.string().describe("The history entry ID to rollback to"),
        }),
        execute: async ({ transactionId, historyId }) => {
          await rollbackTransaction(ctx, transactionId, historyId, {
            type: "ai_chat",
            userId: ctx.userId,
          });
          return { success: true, transactionId, rolledBackTo: historyId };
        },
      }),
    },
  });

  // Use toUIMessageStreamResponse for direct compatibility with useChat from @ai-sdk/react
  return result.toUIMessageStreamResponse();
}
