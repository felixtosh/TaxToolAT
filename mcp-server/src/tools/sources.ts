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
  addDoc,
  deleteDoc,
  writeBatch,
  Timestamp,
} from "firebase/firestore";
import { OperationsContext } from "../types.js";
import { Tool } from "@modelcontextprotocol/sdk/types.js";

const IMPORTS_COLLECTION = "imports";
const TRANSACTIONS_COLLECTION = "transactions";

const SOURCES_COLLECTION = "sources";

// Input schemas
const listSourcesSchema = z.object({});

const getSourceSchema = z.object({
  sourceId: z.string().describe("The source/bank account ID"),
});

const createSourceSchema = z.object({
  name: z.string().describe("Display name for the account"),
  iban: z.string().describe("IBAN of the bank account"),
  bic: z.string().optional().describe("BIC/SWIFT code"),
  bankName: z.string().optional().describe("Bank institution name"),
  currency: z.string().default("EUR").describe("Currency code"),
});

const updateSourceSchema = z.object({
  sourceId: z.string().describe("The source ID to update"),
  name: z.string().optional().describe("New display name"),
  bankName: z.string().optional().describe("New bank name"),
});

const deleteSourceSchema = z.object({
  sourceId: z.string().describe("The source ID to delete"),
});

// Tool definitions
export const sourceToolDefinitions: Tool[] = [
  {
    name: "list_sources",
    description: "List all bank accounts/sources for the current user",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_source",
    description: "Get a single bank account/source by ID",
    inputSchema: {
      type: "object",
      properties: {
        sourceId: { type: "string", description: "The source/bank account ID" },
      },
      required: ["sourceId"],
    },
  },
  {
    name: "create_source",
    description: "Create a new bank account/source for importing transactions",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Display name for the account" },
        iban: { type: "string", description: "IBAN of the bank account" },
        bic: { type: "string", description: "BIC/SWIFT code (optional)" },
        bankName: { type: "string", description: "Bank institution name (optional)" },
        currency: { type: "string", description: "Currency code (default: EUR)" },
      },
      required: ["name", "iban"],
    },
  },
  {
    name: "update_source",
    description: "Update a bank account/source",
    inputSchema: {
      type: "object",
      properties: {
        sourceId: { type: "string", description: "The source ID to update" },
        name: { type: "string", description: "New display name" },
        bankName: { type: "string", description: "New bank name" },
      },
      required: ["sourceId"],
    },
  },
  {
    name: "delete_source",
    description: "Delete a bank account/source and all associated imports and transactions",
    inputSchema: {
      type: "object",
      properties: {
        sourceId: { type: "string", description: "The source ID to delete" },
      },
      required: ["sourceId"],
    },
  },
];

// Normalize IBAN (uppercase, remove spaces)
function normalizeIban(iban: string): string {
  return iban.replace(/\s/g, "").toUpperCase();
}

// Tool handlers
export async function registerSourceTools(
  ctx: OperationsContext,
  toolName: string,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> } | null> {
  switch (toolName) {
    case "list_sources": {
      listSourcesSchema.parse(args);

      const q = query(
        collection(ctx.db, SOURCES_COLLECTION),
        where("userId", "==", ctx.userId),
        where("isActive", "==", true),
        orderBy("name", "asc")
      );

      const snapshot = await getDocs(q);
      const sources = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return {
        content: [{ type: "text", text: JSON.stringify(sources, null, 2) }],
      };
    }

    case "get_source": {
      const { sourceId } = getSourceSchema.parse(args);

      const docRef = doc(ctx.db, SOURCES_COLLECTION, sourceId);
      const snapshot = await getDoc(docRef);

      if (!snapshot.exists()) {
        return {
          content: [{ type: "text", text: `Source ${sourceId} not found` }],
        };
      }

      const data = snapshot.data();
      if (data.userId !== ctx.userId) {
        return {
          content: [{ type: "text", text: `Source ${sourceId} not found` }],
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify({ id: snapshot.id, ...data }, null, 2) }],
      };
    }

    case "create_source": {
      const { name, iban, bic, bankName, currency } = createSourceSchema.parse(args);

      const now = Timestamp.now();
      const newSource = {
        name,
        iban: normalizeIban(iban),
        bic: bic || null,
        bankName: bankName || null,
        currency: currency || "EUR",
        type: "csv",
        isActive: true,
        userId: ctx.userId,
        createdAt: now,
        updatedAt: now,
      };

      const docRef = await addDoc(collection(ctx.db, SOURCES_COLLECTION), newSource);

      return {
        content: [{ type: "text", text: `Created source with ID: ${docRef.id}` }],
      };
    }

    case "update_source": {
      const { sourceId, ...updates } = updateSourceSchema.parse(args);

      // Verify ownership
      const docRef = doc(ctx.db, SOURCES_COLLECTION, sourceId);
      const snapshot = await getDoc(docRef);

      if (!snapshot.exists() || snapshot.data().userId !== ctx.userId) {
        return {
          content: [{ type: "text", text: `Source ${sourceId} not found` }],
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
        content: [{ type: "text", text: `Updated source ${sourceId}` }],
      };
    }

    case "delete_source": {
      const { sourceId } = deleteSourceSchema.parse(args);

      // Verify ownership
      const docRef = doc(ctx.db, SOURCES_COLLECTION, sourceId);
      const snapshot = await getDoc(docRef);

      if (!snapshot.exists() || snapshot.data().userId !== ctx.userId) {
        return {
          content: [{ type: "text", text: `Source ${sourceId} not found` }],
        };
      }

      const BATCH_SIZE = 500;
      let deletedImports = 0;
      let deletedTransactions = 0;

      // 1. Find and delete all imports for this source (cascade to their transactions)
      const importsQuery = query(
        collection(ctx.db, IMPORTS_COLLECTION),
        where("sourceId", "==", sourceId),
        where("userId", "==", ctx.userId)
      );
      const importsSnapshot = await getDocs(importsQuery);

      for (const importDoc of importsSnapshot.docs) {
        // Delete transactions for this import
        const txQuery = query(
          collection(ctx.db, TRANSACTIONS_COLLECTION),
          where("importJobId", "==", importDoc.id),
          where("userId", "==", ctx.userId)
        );
        const txSnapshot = await getDocs(txQuery);

        for (let i = 0; i < txSnapshot.docs.length; i += BATCH_SIZE) {
          const batch = writeBatch(ctx.db);
          const chunk = txSnapshot.docs.slice(i, i + BATCH_SIZE);
          for (const txDoc of chunk) {
            batch.delete(txDoc.ref);
            deletedTransactions++;
          }
          await batch.commit();
        }

        // Delete the import record
        await deleteDoc(importDoc.ref);
        deletedImports++;
      }

      // 2. Delete any orphaned transactions (without importJobId)
      const orphanedTxQuery = query(
        collection(ctx.db, TRANSACTIONS_COLLECTION),
        where("sourceId", "==", sourceId),
        where("userId", "==", ctx.userId)
      );
      const orphanedTxSnapshot = await getDocs(orphanedTxQuery);

      for (let i = 0; i < orphanedTxSnapshot.docs.length; i += BATCH_SIZE) {
        const batch = writeBatch(ctx.db);
        const chunk = orphanedTxSnapshot.docs.slice(i, i + BATCH_SIZE);
        for (const txDoc of chunk) {
          batch.delete(txDoc.ref);
          deletedTransactions++;
        }
        await batch.commit();
      }

      // 3. Delete the source document
      await deleteDoc(docRef);

      return {
        content: [
          {
            type: "text",
            text: `Deleted source ${sourceId} (${deletedImports} imports, ${deletedTransactions} transactions)`,
          },
        ],
      };
    }

    default:
      return null;
  }
}
