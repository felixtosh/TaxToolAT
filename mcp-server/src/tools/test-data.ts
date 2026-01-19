import { z } from "zod";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  writeBatch,
  Timestamp,
} from "firebase/firestore";
import { OperationsContext } from "../types.js";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import * as crypto from "crypto";

const SOURCES_COLLECTION = "sources";
const TRANSACTIONS_COLLECTION = "transactions";
const TEST_SOURCE_ID = "test-source-001";

// Input schemas
const toggleTestDataSchema = z.object({
  enable: z.boolean().describe("true to enable, false to disable"),
});

const getStatusSchema = z.object({});

// Tool definitions
export const testDataToolDefinitions: Tool[] = [
  {
    name: "toggle_test_data",
    description:
      "Enable or disable test data. Creates/removes a Test Bank Account with 100 sample transactions.",
    inputSchema: {
      type: "object",
      properties: {
        enable: { type: "boolean", description: "true to enable, false to disable" },
      },
      required: ["enable"],
    },
  },
  {
    name: "get_test_data_status",
    description: "Check if test data is currently enabled",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// Generate deterministic test transactions
function generateTestTransactions(userId: string) {
  const transactions: Array<Record<string, unknown>> = [];
  const now = new Date();

  // Sample data
  const expenses = [
    { name: "REWE Supermarkt", partner: "REWE", amounts: [-25.99, -45.50, -18.30] },
    { name: "Amazon.de", partner: "Amazon", amounts: [-89.99, -24.95, -156.00] },
    { name: "Netflix", partner: "Netflix Inc", amounts: [-15.99] },
    { name: "Spotify", partner: "Spotify AB", amounts: [-9.99] },
    { name: "DB Bahn", partner: "Deutsche Bahn", amounts: [-49.00, -89.00] },
    { name: "Shell Tankstelle", partner: "Shell", amounts: [-65.00, -72.50] },
    { name: "Lidl", partner: "Lidl", amounts: [-32.40, -28.90] },
  ];

  const incomes = [
    { name: "Gehalt", partner: "Mustermann GmbH", amounts: [3500.00, 3500.00] },
    { name: "Freelance Payment", partner: "Client ABC", amounts: [1200.00, 850.00] },
  ];

  let txnIndex = 0;

  // Generate 85 realistic transactions
  for (let i = 0; i < 85; i++) {
    const daysAgo = Math.floor(i * 3.5);
    const date = new Date(now);
    date.setDate(date.getDate() - daysAgo);

    const isIncome = i % 10 === 0;
    const source = isIncome
      ? incomes[i % incomes.length]
      : expenses[i % expenses.length];
    const amount = source.amounts[i % source.amounts.length];

    const id = `test-txn-${String(txnIndex++).padStart(4, "0")}`;
    const dedupeHash = crypto
      .createHash("sha256")
      .update(`${date.toISOString()}${amount}${TEST_SOURCE_ID}${id}`)
      .digest("hex");

    transactions.push({
      id,
      sourceId: TEST_SOURCE_ID,
      date: Timestamp.fromDate(date),
      amount: Math.round(amount * 100), // cents
      currency: "EUR",
      name: source.name,
      description: null,
      partner: source.partner,
      reference: `REF-${id}`,
      partnerIban: null,
      dedupeHash,
      receiptIds: [],
      isComplete: false,
      // Partner fields - explicitly null for Firestore query compatibility
      partnerId: null,
      partnerType: null,
      partnerMatchedBy: null,
      partnerMatchConfidence: null,
      partnerSuggestions: [],
      importJobId: "test-import",
      userId: userId,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      _original: {
        date: date.toLocaleDateString("de-DE"),
        amount: amount.toFixed(2).replace(".", ","),
        rawRow: {},
      },
    });
  }

  // Add 15 edge cases
  const edgeCases = [
    { name: "Large Purchase €9,999", amount: -999900 },
    { name: "Small €0.01", amount: -1 },
    { name: "Refund", amount: 15000 },
    { name: "Name with Ümlaut", amount: -2500 },
    { name: "Very long transaction name that might exceed display limits", amount: -1000 },
  ];

  for (const edge of edgeCases) {
    const id = `test-txn-${String(txnIndex++).padStart(4, "0")}`;
    const date = new Date(now);
    date.setDate(date.getDate() - txnIndex);

    transactions.push({
      id,
      sourceId: TEST_SOURCE_ID,
      date: Timestamp.fromDate(date),
      amount: edge.amount,
      currency: "EUR",
      name: edge.name,
      description: null,
      partner: "Test Partner",
      reference: `REF-${id}`,
      partnerIban: null,
      dedupeHash: crypto.createHash("sha256").update(id).digest("hex"),
      receiptIds: [],
      isComplete: false,
      // Partner fields - explicitly null for Firestore query compatibility
      partnerId: null,
      partnerType: null,
      partnerMatchedBy: null,
      partnerMatchConfidence: null,
      partnerSuggestions: [],
      importJobId: "test-import",
      userId: userId,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      _original: { date: "", amount: "", rawRow: {} },
    });
  }

  return transactions;
}

// Generate test source
function generateTestSource(userId: string) {
  return {
    name: "Test Bank Account",
    iban: "DE89370400440532013000",
    bic: "COBADEFFXXX",
    bankName: "Test Bank",
    type: "csv",
    currency: "EUR",
    isActive: true,
    userId,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
}

// Tool handlers
export async function registerTestDataTools(
  ctx: OperationsContext,
  toolName: string,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> } | null> {
  switch (toolName) {
    case "get_test_data_status": {
      getStatusSchema.parse(args);

      const docRef = doc(ctx.db, SOURCES_COLLECTION, TEST_SOURCE_ID);
      const snapshot = await getDoc(docRef);
      const isActive = snapshot.exists() && snapshot.data()?.isActive === true;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ active: isActive, sourceId: TEST_SOURCE_ID }, null, 2),
          },
        ],
      };
    }

    case "toggle_test_data": {
      const { enable } = toggleTestDataSchema.parse(args);

      // Check current status
      const docRef = doc(ctx.db, SOURCES_COLLECTION, TEST_SOURCE_ID);
      const snapshot = await getDoc(docRef);
      const currentlyActive = snapshot.exists() && snapshot.data()?.isActive === true;

      if (enable && currentlyActive) {
        return {
          content: [{ type: "text", text: "Test data is already enabled" }],
        };
      }

      if (!enable && !currentlyActive) {
        return {
          content: [{ type: "text", text: "Test data is already disabled" }],
        };
      }

      if (enable) {
        // Activate test data
        const testSource = generateTestSource(ctx.userId);
        const testTransactions = generateTestTransactions(ctx.userId);

        const batch = writeBatch(ctx.db);

        // Add test source
        const sourceRef = doc(ctx.db, SOURCES_COLLECTION, TEST_SOURCE_ID);
        batch.set(sourceRef, testSource);

        // Add transactions
        for (const txn of testTransactions) {
          const txnRef = doc(ctx.db, TRANSACTIONS_COLLECTION, txn.id as string);
          batch.set(txnRef, txn);
        }

        await batch.commit();

        return {
          content: [
            {
              type: "text",
              text: `Enabled test data: created Test Bank Account with ${testTransactions.length} transactions`,
            },
          ],
        };
      } else {
        // Deactivate test data
        const q = query(
          collection(ctx.db, TRANSACTIONS_COLLECTION),
          where("sourceId", "==", TEST_SOURCE_ID)
        );
        const txnSnapshot = await getDocs(q);

        let batch = writeBatch(ctx.db);
        let count = 0;
        const BATCH_SIZE = 499;

        for (const docSnap of txnSnapshot.docs) {
          batch.delete(docSnap.ref);
          count++;

          if (count >= BATCH_SIZE) {
            await batch.commit();
            batch = writeBatch(ctx.db);
            count = 0;
          }
        }

        // Delete source
        const sourceRef = doc(ctx.db, SOURCES_COLLECTION, TEST_SOURCE_ID);
        batch.delete(sourceRef);

        await batch.commit();

        return {
          content: [
            {
              type: "text",
              text: `Disabled test data: deleted ${txnSnapshot.size} transactions and Test Bank Account`,
            },
          ],
        };
      }
    }

    default:
      return null;
  }
}
