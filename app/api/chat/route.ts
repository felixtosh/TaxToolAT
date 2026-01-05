import { anthropic } from "@ai-sdk/anthropic";
import { streamText, tool, createUIMessageStreamResponse, createUIMessageStream } from "ai";
import { z } from "zod";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { SYSTEM_PROMPT } from "@/lib/chat/system-prompt";
import { requiresConfirmation } from "@/lib/chat/confirmation-config";
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
  bulkUpdateTransactionsWithHistory,
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

// Mock user for development
const MOCK_USER_ID = "dev-user-123";

function createContext(): OperationsContext {
  return { db, userId: MOCK_USER_ID };
}

export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages } = await req.json();
  const ctx = createContext();

  // Test without tools first
  const result = streamText({
    model: anthropic("claude-sonnet-4-20250514"),
    system: SYSTEM_PROMPT,
    messages,
    /* TEMPORARILY DISABLED - tools: {
      // ===== READ-ONLY TOOLS (no confirmation) =====

      listTransactions: tool({
        description:
          "List transactions with optional filters. Returns date, amount, partner, description, etc.",
        parameters: z.object({
          sourceId: z.string().optional().describe("Filter by bank account ID"),
          dateFrom: z.string().optional().describe("Start date (ISO format)"),
          dateTo: z.string().optional().describe("End date (ISO format)"),
          search: z.string().optional().describe("Search in name, description, partner"),
          limit: z.number().max(50).optional().default(20).describe("Max results"),
        }),
        execute: async (params) => {
          const transactions = await listTransactions(ctx, {
            sourceId: params.sourceId,
            dateFrom: params.dateFrom ? new Date(params.dateFrom) : undefined,
            dateTo: params.dateTo ? new Date(params.dateTo) : undefined,
            search: params.search,
            limit: params.limit,
          });

          return transactions.map((t) => ({
            id: t.id,
            date: t.date.toDate().toISOString(),
            amount: t.amount,
            amountFormatted: `${(t.amount / 100).toFixed(2)} ${t.currency}`,
            name: t.name,
            description: t.description,
            partner: t.partner,
            categoryId: t.categoryId,
            isComplete: t.isComplete,
            hasReceipts: t.receiptIds.length > 0,
          }));
        },
      }),

      getTransaction: tool({
        description: "Get full details of a single transaction by ID",
        parameters: z.object({
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
            categoryId: t.categoryId,
            isComplete: t.isComplete,
            receiptIds: t.receiptIds,
            sourceId: t.sourceId,
          };
        },
      }),

      listSources: tool({
        description: "List all bank accounts/sources",
        parameters: z.object({
          _dummy: z.string().optional().describe("Not used"),
        }),
        execute: async () => {
          const sources = await listSources(ctx);
          return sources.map((s) => ({
            id: s.id,
            name: s.name,
            iban: s.iban,
            bankName: s.bankName,
            currency: s.currency,
          }));
        },
      }),

      getSource: tool({
        description: "Get details of a single bank account by ID",
        parameters: z.object({
          sourceId: z.string().describe("The source/bank account ID"),
        }),
        execute: async ({ sourceId }) => {
          const s = await getSourceById(ctx, sourceId);
          if (!s) return { error: "Source not found" };

          return {
            id: s.id,
            name: s.name,
            iban: s.iban,
            bic: s.bic,
            bankName: s.bankName,
            currency: s.currency,
          };
        },
      }),

      getTransactionHistory: tool({
        description: "Get the edit history for a transaction (shows previous changes)",
        parameters: z.object({
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
        parameters: z.object({
          path: z.enum(["/transactions", "/sources"]).describe("The page path to navigate to"),
        }),
        execute: async ({ path }) => {
          return { action: "navigate", path };
        },
      }),

      openTransactionSheet: tool({
        description: "Open the detail sheet/sidebar for a specific transaction",
        parameters: z.object({
          transactionId: z.string().describe("The transaction ID to show"),
        }),
        execute: async ({ transactionId }) => {
          return { action: "openSheet", transactionId };
        },
      }),

      scrollToTransaction: tool({
        description: "Scroll to and highlight a transaction in the list",
        parameters: z.object({
          transactionId: z.string().describe("The transaction ID to scroll to"),
        }),
        execute: async ({ transactionId }) => {
          return { action: "scrollTo", transactionId };
        },
      }),

      // ===== DATA MODIFICATION TOOLS (require confirmation) =====

      updateTransaction: tool({
        description:
          "Update a transaction's description, category, or completion status. REQUIRES USER CONFIRMATION.",
        parameters: z.object({
          transactionId: z.string().describe("The transaction ID to update"),
          description: z.string().optional().describe("New description for tax purposes"),
          categoryId: z.string().nullable().optional().describe("Category ID or null to remove"),
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

      bulkCategorize: tool({
        description:
          "Assign a category to multiple transactions at once. REQUIRES USER CONFIRMATION.",
        parameters: z.object({
          transactionIds: z.array(z.string()).describe("Array of transaction IDs"),
          categoryId: z.string().describe("Category ID to assign to all transactions"),
        }),
        execute: async ({ transactionIds, categoryId }) => {
          const result = await bulkUpdateTransactionsWithHistory(
            ctx,
            transactionIds,
            { categoryId },
            { type: "ai_chat", userId: ctx.userId },
            "Bulk categorization via AI chat"
          );
          return result;
        },
      }),

      createSource: tool({
        description: "Create a new bank account/source. REQUIRES USER CONFIRMATION.",
        parameters: z.object({
          name: z.string().describe("Display name for the account"),
          iban: z.string().describe("IBAN of the bank account"),
          currency: z.string().default("EUR").describe("Currency code"),
        }),
        execute: async ({ name, iban, currency }) => {
          const sourceId = await createSource(ctx, {
            name,
            iban,
            currency,
            type: "csv",
          });
          return { success: true, sourceId };
        },
      }),

      rollbackTransaction: tool({
        description:
          "Rollback a transaction to a previous state from its history. REQUIRES USER CONFIRMATION.",
        parameters: z.object({
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

    // Mark which tools require confirmation for the client
    // experimental_toolCallStreaming: true,
  }, */ // END TEMPORARILY DISABLED
  });

  // Use createUIMessageStream for compatibility with useChat from @ai-sdk/react
  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      async execute({ writer }) {
        try {
          // Forward the text stream to the UI message writer
          console.log("[API] Starting stream...");
          let fullText = "";
          for await (const chunk of result.textStream) {
            console.log("[API] Chunk:", chunk);
            fullText += chunk;
            writer.write({ type: "text", text: chunk });
          }
          console.log("[API] Full response:", fullText);
        } catch (err) {
          console.error("[API] Stream error:", err);
          throw err;
        }
      },
    }),
  });
}
