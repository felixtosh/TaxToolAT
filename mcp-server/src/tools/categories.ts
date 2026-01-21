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
  Timestamp,
  writeBatch,
  increment,
  arrayUnion,
} from "firebase/firestore";
import { OperationsContext } from "../types.js";
import { Tool } from "@modelcontextprotocol/sdk/types.js";

const CATEGORIES_COLLECTION = "noReceiptCategories";
const TRANSACTIONS_COLLECTION = "transactions";

// Category templates (hardcoded)
const NO_RECEIPT_CATEGORY_TEMPLATES = [
  {
    id: "bank-fees",
    name: "Bank & Payment Fees",
    description: "Fees charged by banks, payment processors, or financial services",
    helperText: "e.g., Account maintenance fees, transfer fees, card fees",
  },
  {
    id: "interest",
    name: "Interest",
    description: "Interest charged or paid by banks and financial institutions",
    helperText: "e.g., Loan interest, overdraft interest, savings interest",
  },
  {
    id: "internal-transfers",
    name: "Internal Transfers",
    description: "Money transfers between your own accounts",
    helperText: "e.g., Account-to-account transfers, wallet movements",
  },
  {
    id: "payment-provider-settlements",
    name: "Payment Provider Settlements",
    description: "Automated payouts and fee settlements from payment providers",
    helperText: "e.g., Stripe payouts, PayPal withdrawals, Adyen settlements",
  },
  {
    id: "taxes-government",
    name: "Taxes & Government Payments",
    description: "Tax payments and fees to public authorities",
    helperText: "e.g., VAT payments, corporate tax, payroll taxes",
  },
  {
    id: "payroll",
    name: "Payroll Payments",
    description: "Salary payments and employment-related contributions",
    helperText: "e.g., Net salaries, employer contributions",
  },
  {
    id: "private-personal",
    name: "Private or Personal Spending",
    description: "Personal expenses paid with the business account",
    helperText: "Not a business expense - will be settled privately",
  },
  {
    id: "zero-value",
    name: "Zero-Value Transactions",
    description: "Transactions with no financial impact",
    helperText: "e.g., Authorizations, reversals, zero-amount entries",
  },
  {
    id: "receipt-lost",
    name: "Receipt Lost",
    description: "Receipt was lost or unavailable - requires documentation",
    helperText: "Creates an Eigenbeleg (self-generated receipt)",
  },
];

// Input schemas
const listCategoriesSchema = z.object({});

const getCategorySchema = z.object({
  categoryId: z.string().describe("The category ID"),
});

const assignCategorySchema = z.object({
  transactionId: z.string().describe("The transaction ID"),
  categoryId: z.string().describe("The category ID to assign"),
});

const removeCategorySchema = z.object({
  transactionId: z.string().describe("The transaction ID"),
});

// Tool definitions
export const categoryToolDefinitions: Tool[] = [
  {
    name: "list_no_receipt_categories",
    description:
      "List all no-receipt categories for the current user. These categories are used for transactions that don't require a receipt (e.g., bank fees, interest, internal transfers).",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_no_receipt_category",
    description: "Get a single no-receipt category by ID",
    inputSchema: {
      type: "object",
      properties: {
        categoryId: { type: "string", description: "The category ID" },
      },
      required: ["categoryId"],
    },
  },
  {
    name: "assign_no_receipt_category",
    description:
      "Assign a no-receipt category to a transaction. This marks the transaction as complete without requiring a receipt. Use this for transactions like bank fees, interest, internal transfers, payroll, etc.",
    inputSchema: {
      type: "object",
      properties: {
        transactionId: { type: "string", description: "The transaction ID" },
        categoryId: { type: "string", description: "The category ID to assign" },
      },
      required: ["transactionId", "categoryId"],
    },
  },
  {
    name: "remove_no_receipt_category",
    description:
      "Remove a no-receipt category from a transaction. This marks the transaction as incomplete again.",
    inputSchema: {
      type: "object",
      properties: {
        transactionId: { type: "string", description: "The transaction ID" },
      },
      required: ["transactionId"],
    },
  },
];

// Tool handlers
export async function registerCategoryTools(
  ctx: OperationsContext,
  toolName: string,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> } | null> {
  switch (toolName) {
    case "list_no_receipt_categories": {
      listCategoriesSchema.parse(args);

      const q = query(
        collection(ctx.db, CATEGORIES_COLLECTION),
        where("userId", "==", ctx.userId),
        where("isActive", "==", true),
        orderBy("name", "asc")
      );

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        // Check ALL categories for this user (including inactive) to prevent duplicates
        const allCategoriesQuery = query(
          collection(ctx.db, CATEGORIES_COLLECTION),
          where("userId", "==", ctx.userId)
        );
        const allSnapshot = await getDocs(allCategoriesQuery);
        const existingTemplateIds = new Set(
          allSnapshot.docs.map((d) => d.data().templateId)
        );

        const now = Timestamp.now();
        const batch = writeBatch(ctx.db);
        let createdCount = 0;

        for (const template of NO_RECEIPT_CATEGORY_TEMPLATES) {
          if (existingTemplateIds.has(template.id)) {
            continue; // Skip - already exists
          }
          const docRef = doc(collection(ctx.db, CATEGORIES_COLLECTION));
          batch.set(docRef, {
            userId: ctx.userId,
            templateId: template.id,
            name: template.name,
            description: template.description,
            helperText: template.helperText,
            matchedPartnerIds: [],
            learnedPatterns: [],
            transactionCount: 0,
            isActive: true,
            createdAt: now,
            updatedAt: now,
          });
          createdCount++;
        }

        if (createdCount > 0) {
          await batch.commit();
        }

        // Re-fetch
        const newSnapshot = await getDocs(q);
        const categories = newSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        return {
          content: [
            {
              type: "text",
              text: `Initialized ${categories.length} no-receipt categories:\n\n${JSON.stringify(categories, null, 2)}`,
            },
          ],
        };
      }

      const categories = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return {
        content: [{ type: "text", text: JSON.stringify(categories, null, 2) }],
      };
    }

    case "get_no_receipt_category": {
      const { categoryId } = getCategorySchema.parse(args);

      const docRef = doc(ctx.db, CATEGORIES_COLLECTION, categoryId);
      const snapshot = await getDoc(docRef);

      if (!snapshot.exists()) {
        return {
          content: [{ type: "text", text: `Category ${categoryId} not found` }],
        };
      }

      const data = snapshot.data();
      if (data.userId !== ctx.userId) {
        return {
          content: [{ type: "text", text: `Category ${categoryId} not found` }],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ id: snapshot.id, ...data }, null, 2),
          },
        ],
      };
    }

    case "assign_no_receipt_category": {
      const { transactionId, categoryId } = assignCategorySchema.parse(args);

      // Verify transaction exists and belongs to user
      const txDoc = doc(ctx.db, TRANSACTIONS_COLLECTION, transactionId);
      const txSnapshot = await getDoc(txDoc);

      if (!txSnapshot.exists() || txSnapshot.data().userId !== ctx.userId) {
        return {
          content: [
            { type: "text", text: `Transaction ${transactionId} not found` },
          ],
        };
      }

      // Verify category exists and belongs to user
      const categoryRef = doc(ctx.db, CATEGORIES_COLLECTION, categoryId);
      const categorySnapshot = await getDoc(categoryRef);

      if (
        !categorySnapshot.exists() ||
        categorySnapshot.data().userId !== ctx.userId
      ) {
        return {
          content: [{ type: "text", text: `Category ${categoryId} not found` }],
        };
      }

      const categoryData = categorySnapshot.data();
      const txData = txSnapshot.data();

      const batch = writeBatch(ctx.db);

      // Update transaction
      batch.update(txDoc, {
        noReceiptCategoryId: categoryId,
        noReceiptCategoryTemplateId: categoryData.templateId,
        noReceiptCategoryMatchedBy: "manual",
        noReceiptCategoryConfidence: 100,
        isComplete: true,
        updatedAt: Timestamp.now(),
      });

      // Increment category transaction count
      batch.update(categoryRef, {
        transactionCount: increment(1),
        updatedAt: Timestamp.now(),
      });

      // Add partner to category if transaction has one
      if (
        txData.partnerId &&
        !categoryData.matchedPartnerIds.includes(txData.partnerId)
      ) {
        batch.update(categoryRef, {
          matchedPartnerIds: arrayUnion(txData.partnerId),
        });
      }

      await batch.commit();

      return {
        content: [
          {
            type: "text",
            text: `Assigned category "${categoryData.name}" to transaction ${transactionId}. Transaction is now marked as complete.`,
          },
        ],
      };
    }

    case "remove_no_receipt_category": {
      const { transactionId } = removeCategorySchema.parse(args);

      const txDoc = doc(ctx.db, TRANSACTIONS_COLLECTION, transactionId);
      const txSnapshot = await getDoc(txDoc);

      if (!txSnapshot.exists() || txSnapshot.data().userId !== ctx.userId) {
        return {
          content: [
            { type: "text", text: `Transaction ${transactionId} not found` },
          ],
        };
      }

      const txData = txSnapshot.data();
      const categoryId = txData.noReceiptCategoryId;

      if (!categoryId) {
        return {
          content: [
            {
              type: "text",
              text: `Transaction ${transactionId} has no no-receipt category assigned`,
            },
          ],
        };
      }

      const batch = writeBatch(ctx.db);

      // Check if transaction has files (if so, it's still complete)
      const hasFiles = txData.fileIds && txData.fileIds.length > 0;

      // Clear category fields
      batch.update(txDoc, {
        noReceiptCategoryId: null,
        noReceiptCategoryTemplateId: null,
        noReceiptCategoryMatchedBy: null,
        noReceiptCategoryConfidence: null,
        receiptLostEntry: null,
        isComplete: hasFiles,
        updatedAt: Timestamp.now(),
      });

      // Decrement category transaction count
      const categoryRef = doc(ctx.db, CATEGORIES_COLLECTION, categoryId);
      batch.update(categoryRef, {
        transactionCount: increment(-1),
        updatedAt: Timestamp.now(),
      });

      await batch.commit();

      return {
        content: [
          {
            type: "text",
            text: `Removed no-receipt category from transaction ${transactionId}. Transaction is now marked as ${hasFiles ? "complete" : "incomplete"}.`,
          },
        ],
      };
    }

    default:
      return null;
  }
}
