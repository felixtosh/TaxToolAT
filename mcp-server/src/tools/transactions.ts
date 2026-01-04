import { z } from "zod";
import {
  collection,
  query,
  orderBy,
  where,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  Timestamp,
  limit as firestoreLimit,
  writeBatch,
} from "firebase/firestore";
import { OperationsContext } from "../types.js";
import { Tool } from "@modelcontextprotocol/sdk/types.js";

const TRANSACTIONS_COLLECTION = "transactions";

// Input schemas
const listTransactionsSchema = z.object({
  sourceId: z.string().optional().describe("Filter by bank account ID"),
  dateFrom: z.string().optional().describe("Start date (ISO format)"),
  dateTo: z.string().optional().describe("End date (ISO format)"),
  search: z.string().optional().describe("Search in name, description, partner"),
  hasReceipt: z.boolean().optional().describe("Filter by receipt attachment"),
  isComplete: z.boolean().optional().describe("Filter by completion status"),
  limit: z.number().max(100).optional().default(50).describe("Max results"),
});

const getTransactionSchema = z.object({
  transactionId: z.string().describe("The transaction ID"),
});

const updateTransactionSchema = z.object({
  transactionId: z.string().describe("The transaction ID to update"),
  description: z.string().optional().describe("Description for tax purposes"),
  categoryId: z.string().nullable().optional().describe("Category ID"),
  isComplete: z.boolean().optional().describe("Mark as complete/incomplete"),
});

// NOTE: delete_transaction tool is intentionally NOT provided.
// Individual transaction deletion is not allowed - transactions must be
// deleted together with their source to maintain accounting integrity.

const bulkCategorizeSchema = z.object({
  transactionIds: z.array(z.string()).describe("Array of transaction IDs"),
  categoryId: z.string().describe("Category ID to assign"),
});

// Tool definitions
export const transactionToolDefinitions: Tool[] = [
  {
    name: "list_transactions",
    description: "List transactions with optional filters. Returns date, amount, partner, etc.",
    inputSchema: {
      type: "object",
      properties: {
        sourceId: { type: "string", description: "Filter by bank account ID" },
        dateFrom: { type: "string", description: "Start date (ISO format, e.g., 2024-01-01)" },
        dateTo: { type: "string", description: "End date (ISO format)" },
        search: { type: "string", description: "Search in name, description, partner" },
        hasReceipt: { type: "boolean", description: "Filter by receipt attachment" },
        isComplete: { type: "boolean", description: "Filter by completion status" },
        limit: { type: "number", description: "Max results (default 50, max 100)" },
      },
    },
  },
  {
    name: "get_transaction",
    description: "Get a single transaction by ID with full details",
    inputSchema: {
      type: "object",
      properties: {
        transactionId: { type: "string", description: "The transaction ID" },
      },
      required: ["transactionId"],
    },
  },
  {
    name: "update_transaction",
    description: "Update transaction fields like description, category, completion status",
    inputSchema: {
      type: "object",
      properties: {
        transactionId: { type: "string", description: "The transaction ID" },
        description: { type: "string", description: "Description for tax purposes" },
        categoryId: {
          type: ["string", "null"],
          description: "Category ID or null to remove",
        },
        isComplete: { type: "boolean", description: "Mark as complete/incomplete" },
      },
      required: ["transactionId"],
    },
  },
  // NOTE: delete_transaction is intentionally NOT provided.
  // Transactions must be deleted with their source for accounting integrity.
  {
    name: "bulk_categorize",
    description: "Assign a category to multiple transactions at once",
    inputSchema: {
      type: "object",
      properties: {
        transactionIds: {
          type: "array",
          items: { type: "string" },
          description: "Array of transaction IDs",
        },
        categoryId: { type: "string", description: "Category ID to assign" },
      },
      required: ["transactionIds", "categoryId"],
    },
  },
];

// Helper to format transaction for display
function formatTransaction(txn: Record<string, unknown>) {
  const date = txn.date as Timestamp;
  const amount = txn.amount as number;
  return {
    ...txn,
    date: date?.toDate?.()?.toISOString?.() || txn.date,
    amountFormatted: `${(amount / 100).toFixed(2)} ${txn.currency || "EUR"}`,
  };
}

// Tool handlers
export async function registerTransactionTools(
  ctx: OperationsContext,
  toolName: string,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> } | null> {
  switch (toolName) {
    case "list_transactions": {
      const filters = listTransactionsSchema.parse(args);

      // Build query
      const constraints: Parameters<typeof query>[1][] = [
        where("userId", "==", ctx.userId),
        orderBy("date", "desc"),
      ];

      if (filters.sourceId) {
        constraints.push(where("sourceId", "==", filters.sourceId));
      }

      if (filters.isComplete !== undefined) {
        constraints.push(where("isComplete", "==", filters.isComplete));
      }

      if (filters.limit) {
        constraints.push(firestoreLimit(filters.limit));
      }

      const q = query(collection(ctx.db, TRANSACTIONS_COLLECTION), ...constraints);
      const snapshot = await getDocs(q);

      type TransactionDoc = {
        id: string;
        date?: Timestamp;
        receiptIds?: string[];
        name?: string;
        description?: string;
        partner?: string;
        [key: string]: unknown;
      };

      let transactions: TransactionDoc[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Client-side filters
      if (filters.dateFrom) {
        const from = new Date(filters.dateFrom);
        transactions = transactions.filter((t) => {
          const date = t.date?.toDate?.();
          return date && date >= from;
        });
      }

      if (filters.dateTo) {
        const to = new Date(filters.dateTo);
        transactions = transactions.filter((t) => {
          const date = t.date?.toDate?.();
          return date && date <= to;
        });
      }

      if (filters.hasReceipt !== undefined) {
        transactions = transactions.filter((t) => {
          const receiptIds = t.receiptIds;
          return filters.hasReceipt
            ? receiptIds && receiptIds.length > 0
            : !receiptIds || receiptIds.length === 0;
        });
      }

      if (filters.search) {
        const search = filters.search.toLowerCase();
        transactions = transactions.filter((t) => {
          const name = t.name?.toLowerCase() || "";
          const description = t.description?.toLowerCase() || "";
          const partner = t.partner?.toLowerCase() || "";
          return name.includes(search) || description.includes(search) || partner.includes(search);
        });
      }

      // Format for display
      const formatted = transactions.map(formatTransaction);

      return {
        content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }],
      };
    }

    case "get_transaction": {
      const { transactionId } = getTransactionSchema.parse(args);

      const docRef = doc(ctx.db, TRANSACTIONS_COLLECTION, transactionId);
      const snapshot = await getDoc(docRef);

      if (!snapshot.exists()) {
        return {
          content: [{ type: "text", text: `Transaction ${transactionId} not found` }],
        };
      }

      const data = snapshot.data();
      if (data.userId !== ctx.userId) {
        return {
          content: [{ type: "text", text: `Transaction ${transactionId} not found` }],
        };
      }

      const formatted = formatTransaction({ id: snapshot.id, ...data });

      return {
        content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }],
      };
    }

    case "update_transaction": {
      const { transactionId, ...updates } = updateTransactionSchema.parse(args);

      // Verify ownership
      const docRef = doc(ctx.db, TRANSACTIONS_COLLECTION, transactionId);
      const snapshot = await getDoc(docRef);

      if (!snapshot.exists() || snapshot.data().userId !== ctx.userId) {
        return {
          content: [{ type: "text", text: `Transaction ${transactionId} not found` }],
        };
      }

      // Filter out undefined values
      const cleanUpdates: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          cleanUpdates[key] = value;
        }
      }

      await updateDoc(docRef, {
        ...cleanUpdates,
        updatedAt: Timestamp.now(),
      });

      return {
        content: [{ type: "text", text: `Updated transaction ${transactionId}` }],
      };
    }

    // NOTE: delete_transaction case intentionally removed.
    // Transactions must be deleted with their source for accounting integrity.

    case "bulk_categorize": {
      const { transactionIds, categoryId } = bulkCategorizeSchema.parse(args);

      const batch = writeBatch(ctx.db);
      const now = Timestamp.now();
      let updated = 0;

      for (const id of transactionIds) {
        const docRef = doc(ctx.db, TRANSACTIONS_COLLECTION, id);
        const snapshot = await getDoc(docRef);

        if (snapshot.exists() && snapshot.data().userId === ctx.userId) {
          batch.update(docRef, {
            categoryId,
            updatedAt: now,
          });
          updated++;
        }
      }

      await batch.commit();

      return {
        content: [
          { type: "text", text: `Categorized ${updated} of ${transactionIds.length} transactions` },
        ],
      };
    }

    default:
      return null;
  }
}
