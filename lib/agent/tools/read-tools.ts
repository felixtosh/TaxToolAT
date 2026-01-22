/**
 * Read Tools
 *
 * Tools for fetching data without modifications.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getAdminDb } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

const db = getAdminDb();

// ============================================================================
// List Transactions
// ============================================================================

export const listTransactionsTool = tool(
  async (
    {
      startDate,
      endDate,
      search,
      minAmount,
      maxAmount,
      sourceId,
      partnerId,
      categoryId,
      hasFile,
      limit = 20,
    },
    config
  ) => {
    const userId = config?.configurable?.userId;
    if (!userId) {
      return { error: "User ID not provided" };
    }

    let query = db
      .collection("transactions")
      .where("userId", "==", userId)
      .orderBy("date", "desc");

    if (sourceId) {
      query = query.where("sourceId", "==", sourceId);
    }

    if (partnerId) {
      query = query.where("partnerId", "==", partnerId);
    }

    if (categoryId) {
      query = query.where("categoryId", "==", categoryId);
    }

    if (hasFile !== undefined) {
      if (hasFile) {
        query = query.where("fileIds", "!=", []);
      }
    }

    // When searching, fetch more transactions since we filter client-side
    // This ensures search finds matches across all transactions
    const fetchLimit = search ? 500 : limit;
    const snapshot = await query.limit(fetchLimit).get();

    // Collect all fileIds to check for soft-deleted files
    const allFileIds = new Set<string>();
    snapshot.docs.forEach((doc) => {
      const fileIds = doc.data().fileIds || [];
      fileIds.forEach((id: string) => allFileIds.add(id));
    });

    // Fetch files to check which are soft-deleted
    const deletedFileIds = new Set<string>();
    if (allFileIds.size > 0) {
      const fileChunks = [];
      const fileIdArray = Array.from(allFileIds);
      for (let i = 0; i < fileIdArray.length; i += 10) {
        fileChunks.push(fileIdArray.slice(i, i + 10));
      }
      for (const chunk of fileChunks) {
        const filesSnapshot = await db
          .collection("files")
          .where("__name__", "in", chunk)
          .get();
        filesSnapshot.docs.forEach((fileDoc) => {
          if (fileDoc.data().deletedAt) {
            deletedFileIds.add(fileDoc.id);
          }
        });
      }
    }

    const transactions = snapshot.docs.map((doc) => {
      const data = doc.data();
      // Filter out soft-deleted files from the count
      const activeFileIds = (data.fileIds || []).filter((id: string) => !deletedFileIds.has(id));
      return {
        id: doc.id,
        date: data.date?.toDate?.()?.toISOString() || data.date,
        dateFormatted: data.date?.toDate?.()?.toLocaleDateString("de-DE") || "",
        amount: data.amount,
        amountFormatted: new Intl.NumberFormat("de-DE", {
          style: "currency",
          currency: data.currency || "EUR",
        }).format((data.amount || 0) / 100),
        name: data.name,
        description: data.description,
        partner: data.partner,
        partnerId: data.partnerId,
        sourceId: data.sourceId,
        fileIds: activeFileIds,
        categoryId: data.categoryId,
        isComplete: data.isComplete || false,
      };
    });

    // Apply client-side filters
    let filtered = transactions;

    if (startDate) {
      const start = new Date(startDate);
      filtered = filtered.filter((t) => new Date(t.date) >= start);
    }

    if (endDate) {
      const end = new Date(endDate);
      filtered = filtered.filter((t) => new Date(t.date) <= end);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.name?.toLowerCase().includes(searchLower) ||
          t.description?.toLowerCase().includes(searchLower) ||
          t.partner?.toLowerCase().includes(searchLower)
      );
    }

    if (minAmount !== undefined) {
      filtered = filtered.filter((t) => Math.abs(t.amount) >= minAmount * 100);
    }

    if (maxAmount !== undefined) {
      filtered = filtered.filter((t) => Math.abs(t.amount) <= maxAmount * 100);
    }

    // Apply limit to final results
    const totalMatches = filtered.length;
    const limitedResults = filtered.slice(0, limit);

    return {
      transactions: limitedResults,
      total: totalMatches,
      hasMore: totalMatches > limit,
    };
  },
  {
    name: "listTransactions",
    description:
      "List transactions with optional filters. Returns date, amount, partner, description, etc.",
    schema: z.object({
      startDate: z.string().optional().describe("Start date (ISO format)"),
      endDate: z.string().optional().describe("End date (ISO format)"),
      search: z.string().optional().describe("Search in name/description/partner"),
      minAmount: z.number().optional().describe("Minimum amount in EUR"),
      maxAmount: z.number().optional().describe("Maximum amount in EUR"),
      sourceId: z.string().optional().describe("Filter by bank account ID"),
      partnerId: z.string().optional().describe("Filter by partner ID"),
      categoryId: z.string().optional().describe("Filter by category ID"),
      hasFile: z.boolean().optional().describe("Filter by file attachment status"),
      limit: z.number().optional().describe("Max results (default 20)"),
    }),
  }
);

// ============================================================================
// Get Transaction
// ============================================================================

export const getTransactionTool = tool(
  async ({ transactionId }, config) => {
    const userId = config?.configurable?.userId;
    if (!userId) {
      return { error: "User ID not provided" };
    }

    const doc = await db.collection("transactions").doc(transactionId).get();

    if (!doc.exists) {
      return { error: "Transaction not found" };
    }

    const data = doc.data()!;

    if (data.userId !== userId) {
      return { error: "Transaction not found" };
    }

    return {
      id: doc.id,
      date: data.date?.toDate?.()?.toISOString() || data.date,
      dateFormatted: data.date?.toDate?.()?.toLocaleDateString("de-DE") || "",
      amount: data.amount,
      amountFormatted: new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: data.currency || "EUR",
      }).format((data.amount || 0) / 100),
      name: data.name,
      description: data.description,
      partner: data.partner,
      partnerId: data.partnerId,
      sourceId: data.sourceId,
      fileIds: data.fileIds || [],
      categoryId: data.categoryId,
      isComplete: data.isComplete || false,
      metadata: data.metadata || {},
    };
  },
  {
    name: "getTransaction",
    description: "Get full details of a single transaction by ID",
    schema: z.object({
      transactionId: z.string().describe("The transaction ID"),
    }),
  }
);

// ============================================================================
// List Sources
// ============================================================================

export const listSourcesTool = tool(
  async ({ includeInactive }, config) => {
    const userId = config?.configurable?.userId;
    if (!userId) {
      return { error: "User ID not provided" };
    }

    let query = db.collection("sources").where("userId", "==", userId);

    if (!includeInactive) {
      query = query.where("isActive", "==", true);
    }

    const snapshot = await query.get();
    const sources = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name,
        iban: data.iban,
        currency: data.currency || "EUR",
        isActive: data.isActive !== false,
        transactionCount: data.transactionCount || 0,
        lastSync: data.lastSync?.toDate?.()?.toISOString(),
      };
    });

    return {
      sources,
      total: sources.length,
      activeCount: sources.filter((s) => s.isActive).length,
    };
  },
  {
    name: "listSources",
    description: "List all bank accounts/sources",
    schema: z.object({
      includeInactive: z.boolean().optional().describe("Include inactive sources"),
    }),
  }
);

// ============================================================================
// Get Source
// ============================================================================

export const getSourceTool = tool(
  async ({ sourceId }, config) => {
    const userId = config?.configurable?.userId;
    if (!userId) {
      return { error: "User ID not provided" };
    }

    const doc = await db.collection("sources").doc(sourceId).get();

    if (!doc.exists) {
      return { error: "Source not found" };
    }

    const data = doc.data()!;

    if (data.userId !== userId) {
      return { error: "Source not found" };
    }

    return {
      id: doc.id,
      name: data.name,
      iban: data.iban,
      currency: data.currency || "EUR",
      isActive: data.isActive !== false,
      transactionCount: data.transactionCount || 0,
      lastSync: data.lastSync?.toDate?.()?.toISOString(),
    };
  },
  {
    name: "getSource",
    description: "Get details of a single bank account by ID",
    schema: z.object({
      sourceId: z.string().describe("The source/bank account ID"),
    }),
  }
);

// ============================================================================
// Get Transaction History
// ============================================================================

export const getTransactionHistoryTool = tool(
  async ({ transactionId }, config) => {
    const userId = config?.configurable?.userId;
    if (!userId) {
      return { error: "User ID not provided" };
    }

    // Verify transaction ownership
    const txDoc = await db.collection("transactions").doc(transactionId).get();
    if (!txDoc.exists || txDoc.data()?.userId !== userId) {
      return { error: "Transaction not found" };
    }

    const historySnapshot = await db
      .collection("transactions")
      .doc(transactionId)
      .collection("history")
      .orderBy("changedAt", "desc")
      .limit(10)
      .get();

    const history = historySnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        changedAt: data.changedAt?.toDate?.()?.toISOString(),
        changedBy: data.changedBy,
        previousValues: data.previousValues,
        newValues: data.newValues,
      };
    });

    return {
      history,
      historyCount: history.length,
    };
  },
  {
    name: "getTransactionHistory",
    description: "Get the edit history for a transaction (shows previous changes)",
    schema: z.object({
      transactionId: z.string().describe("The transaction ID"),
    }),
  }
);

// ============================================================================
// List Partners
// ============================================================================

export const listPartnersTool = tool(
  async ({ search, limit = 20 }, config) => {
    const userId = config?.configurable?.userId;
    if (!userId) {
      return { error: "User ID not provided" };
    }

    let query = db
      .collection("partners")
      .where("userId", "==", userId)
      .where("isActive", "==", true)
      .orderBy("name", "asc");

    const snapshot = await query.limit(search ? 100 : limit).get();
    let partners = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name,
        aliases: data.aliases || [],
        vatId: data.vatId || null,
        website: data.website || null,
        country: data.country || null,
        defaultCategoryId: data.defaultCategoryId || null,
      };
    });

    // Client-side search filtering
    if (search) {
      const searchLower = search.toLowerCase();
      partners = partners.filter(
        (p) =>
          p.name?.toLowerCase().includes(searchLower) ||
          p.aliases?.some((a: string) => a.toLowerCase().includes(searchLower)) ||
          p.vatId?.toLowerCase().includes(searchLower)
      );
    }

    // Apply limit after filtering
    const totalMatches = partners.length;
    const limitedResults = partners.slice(0, limit);

    return {
      partners: limitedResults,
      total: totalMatches,
      hasMore: totalMatches > limit,
    };
  },
  {
    name: "listPartners",
    description:
      "List or search partners (vendors/suppliers). Returns name, aliases, VAT ID.",
    schema: z.object({
      search: z.string().optional().describe("Search in name/aliases/VAT ID"),
      limit: z.number().optional().describe("Max results (default 20)"),
    }),
  }
);

// ============================================================================
// Get Partner
// ============================================================================

export const getPartnerTool = tool(
  async ({ partnerId }, config) => {
    const userId = config?.configurable?.userId;
    if (!userId) {
      return { error: "User ID not provided" };
    }

    const doc = await db.collection("partners").doc(partnerId).get();

    if (!doc.exists) {
      return { error: "Partner not found" };
    }

    const data = doc.data()!;

    if (data.userId !== userId) {
      return { error: "Partner not found" };
    }

    return {
      id: doc.id,
      name: data.name,
      aliases: data.aliases || [],
      address: data.address || null,
      country: data.country || null,
      vatId: data.vatId || null,
      ibans: data.ibans || [],
      website: data.website || null,
      defaultCategoryId: data.defaultCategoryId || null,
      emailDomains: data.emailDomains || [],
    };
  },
  {
    name: "getPartner",
    description: "Get full details of a partner by ID",
    schema: z.object({
      partnerId: z.string().describe("The partner ID"),
    }),
  }
);

// ============================================================================
// Export all read tools
// ============================================================================

export const READ_TOOLS = [
  listTransactionsTool,
  getTransactionTool,
  listSourcesTool,
  getSourceTool,
  getTransactionHistoryTool,
  listPartnersTool,
  getPartnerTool,
];
