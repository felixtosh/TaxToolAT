/**
 * Write Tools
 *
 * Tools that modify data. Some require user confirmation.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getAdminDb } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { lookupCompany, lookupByVatId } from "@/lib/api/firebase-callable";

const db = getAdminDb();

// ============================================================================
// Update Transaction
// ============================================================================

export const updateTransactionTool = tool(
  async ({ transactionId, description, isComplete }, config) => {
    const userId = config?.configurable?.userId;
    if (!userId) {
      return { error: "User ID not provided" };
    }

    const txRef = db.collection("transactions").doc(transactionId);
    const txDoc = await txRef.get();

    if (!txDoc.exists) {
      return { error: "Transaction not found" };
    }

    const txData = txDoc.data()!;
    if (txData.userId !== userId) {
      return { error: "Transaction not found" };
    }

    // Build update object
    const updates: Record<string, unknown> = {
      updatedAt: Timestamp.now(),
    };

    const previousValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};

    if (description !== undefined && description !== txData.description) {
      previousValues.description = txData.description;
      newValues.description = description;
      updates.description = description;
    }

    if (isComplete !== undefined && isComplete !== txData.isComplete) {
      previousValues.isComplete = txData.isComplete;
      newValues.isComplete = isComplete;
      updates.isComplete = isComplete;
    }

    if (Object.keys(newValues).length === 0) {
      return {
        success: true,
        message: "No changes to apply",
        transactionId,
      };
    }

    // Create history entry
    const historyRef = txRef.collection("history").doc();
    await historyRef.set({
      changedAt: Timestamp.now(),
      changedBy: userId,
      previousValues,
      newValues,
    });

    // Apply updates
    await txRef.update(updates);

    return {
      success: true,
      transactionId,
      historyId: historyRef.id,
      changes: newValues,
    };
  },
  {
    name: "updateTransaction",
    description:
      "Update a transaction's description or completion status. REQUIRES USER CONFIRMATION.",
    schema: z.object({
      transactionId: z.string().describe("The transaction ID"),
      description: z.string().optional().describe("New description"),
      isComplete: z.boolean().optional().describe("Mark as complete/incomplete"),
    }),
  }
);

// ============================================================================
// Create Source
// ============================================================================

export const createSourceTool = tool(
  async ({ name, iban, currency }, config) => {
    const userId = config?.configurable?.userId;
    if (!userId) {
      return { error: "User ID not provided" };
    }

    const sourceRef = await db.collection("sources").add({
      userId,
      name,
      iban,
      currency: currency || "EUR",
      isActive: true,
      transactionCount: 0,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    return {
      success: true,
      sourceId: sourceRef.id,
      name,
      iban,
    };
  },
  {
    name: "createSource",
    description: "Create a new bank account/source. REQUIRES USER CONFIRMATION.",
    schema: z.object({
      name: z.string().describe("Display name for the account"),
      iban: z.string().describe("IBAN of the account"),
      currency: z.string().optional().describe("Currency code (default EUR)"),
    }),
  }
);

// ============================================================================
// Rollback Transaction
// ============================================================================

export const rollbackTransactionTool = tool(
  async ({ transactionId, historyId }, config) => {
    const userId = config?.configurable?.userId;
    if (!userId) {
      return { error: "User ID not provided" };
    }

    const txRef = db.collection("transactions").doc(transactionId);
    const txDoc = await txRef.get();

    if (!txDoc.exists) {
      return { error: "Transaction not found" };
    }

    const txData = txDoc.data()!;
    if (txData.userId !== userId) {
      return { error: "Transaction not found" };
    }

    // Get the history entry
    const historyRef = txRef.collection("history").doc(historyId);
    const historyDoc = await historyRef.get();

    if (!historyDoc.exists) {
      return { error: "History entry not found" };
    }

    const historyData = historyDoc.data()!;
    const { previousValues } = historyData;

    if (!previousValues || Object.keys(previousValues).length === 0) {
      return { error: "No previous values to restore" };
    }

    // Create a new history entry for the rollback
    const rollbackHistoryRef = txRef.collection("history").doc();
    await rollbackHistoryRef.set({
      changedAt: Timestamp.now(),
      changedBy: userId,
      previousValues: Object.fromEntries(
        Object.keys(previousValues).map((key) => [key, txData[key]])
      ),
      newValues: previousValues,
      rollbackFrom: historyId,
    });

    // Apply the rollback
    await txRef.update({
      ...previousValues,
      updatedAt: Timestamp.now(),
    });

    return {
      success: true,
      transactionId,
      restoredValues: previousValues,
      historyId: rollbackHistoryRef.id,
    };
  },
  {
    name: "rollbackTransaction",
    description:
      "Rollback a transaction to a previous state from its history. REQUIRES USER CONFIRMATION.",
    schema: z.object({
      transactionId: z.string().describe("The transaction ID"),
      historyId: z.string().describe("The history entry ID to rollback to"),
    }),
  }
);

// ============================================================================
// Assign Partner to Transaction
// ============================================================================

export const assignPartnerToTransactionTool = tool(
  async ({ transactionId, partnerId }, config) => {
    const userId = config?.configurable?.userId;
    if (!userId) {
      return { error: "User ID not provided" };
    }

    // Verify transaction ownership
    const txRef = db.collection("transactions").doc(transactionId);
    const txDoc = await txRef.get();

    if (!txDoc.exists) {
      return { error: "Transaction not found" };
    }

    const txData = txDoc.data()!;
    if (txData.userId !== userId) {
      return { error: "Transaction not found" };
    }

    // Verify partner ownership
    const partnerRef = db.collection("partners").doc(partnerId);
    const partnerDoc = await partnerRef.get();

    if (!partnerDoc.exists) {
      return { error: "Partner not found" };
    }

    const partnerData = partnerDoc.data()!;
    if (partnerData.userId !== userId) {
      return { error: "Partner not found" };
    }

    // Update transaction with partner assignment (AI-assigned)
    await txRef.update({
      partnerId: partnerId,
      partnerType: "user",
      partnerMatchedBy: "ai",
      partnerMatchConfidence: 100,
      updatedAt: Timestamp.now(),
    });

    return {
      success: true,
      transactionId,
      partnerId,
      partnerName: partnerData.name,
      message: `Assigned partner "${partnerData.name}" to transaction`,
    };
  },
  {
    name: "assignPartnerToTransaction",
    description:
      "Assign a partner (vendor/supplier) to a transaction. Use after finding/creating the partner.",
    schema: z.object({
      transactionId: z.string().describe("The transaction ID"),
      partnerId: z.string().describe("The partner ID to assign"),
    }),
  }
);

// ============================================================================
// Create Partner
// ============================================================================

export const createPartnerTool = tool(
  async ({ name, aliases, vatId, website, country }, config) => {
    const userId = config?.configurable?.userId;
    if (!userId) {
      return { error: "User ID not provided" };
    }

    const now = Timestamp.now();

    const newPartner: Record<string, unknown> = {
      userId,
      name: name.trim(),
      aliases: (aliases || []).map((a: string) => a.trim()).filter(Boolean),
      address: null,
      country: country || null,
      vatId: vatId?.toUpperCase().replace(/\s/g, "") || null,
      ibans: [],
      website: website || null,
      notes: null,
      defaultCategoryId: null,
      emailDomains: [],
      fileSourcePatterns: [],
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await db.collection("partners").add(newPartner);

    return {
      success: true,
      partnerId: docRef.id,
      name: name.trim(),
      message: `Created partner "${name.trim()}"`,
    };
  },
  {
    name: "createPartner",
    description:
      "Create a new partner (vendor/supplier). Include VAT ID and website if known.",
    schema: z.object({
      name: z.string().describe("Partner name"),
      aliases: z.array(z.string()).optional().describe("Alternative names"),
      vatId: z.string().optional().describe("VAT ID (e.g., DE123456789)"),
      website: z.string().optional().describe("Website URL"),
      country: z.string().optional().describe("Country code (e.g., DE, AT)"),
    }),
  }
);

// ============================================================================
// Update Partner
// ============================================================================

export const updatePartnerTool = tool(
  async ({ partnerId, name, aliases, vatId, website, country }, config) => {
    const userId = config?.configurable?.userId;
    const authHeader = config?.configurable?.authHeader;
    if (!userId) {
      return { error: "User ID not provided" };
    }

    const partnerRef = db.collection("partners").doc(partnerId);
    const partnerDoc = await partnerRef.get();

    if (!partnerDoc.exists) {
      return { error: "Partner not found" };
    }

    const partnerData = partnerDoc.data()!;
    if (partnerData.userId !== userId) {
      return { error: "Partner not found" };
    }

    // Build update object with only provided fields
    const updates: Record<string, unknown> = {
      updatedAt: Timestamp.now(),
    };

    const changes: string[] = [];

    if (name !== undefined && name !== partnerData.name) {
      updates.name = name.trim();
      changes.push(`name: "${partnerData.name}" → "${name.trim()}"`);
    }

    if (aliases !== undefined) {
      const newAliases = aliases.map((a: string) => a.trim()).filter(Boolean);
      updates.aliases = newAliases;
      changes.push(`aliases updated`);
    }

    if (vatId !== undefined && vatId !== partnerData.vatId) {
      // Validate VAT if provided
      const normalizedVat = vatId ? vatId.toUpperCase().replace(/\s/g, "") : null;

      if (normalizedVat) {
        try {
          const validation = await lookupByVatId(normalizedVat, authHeader);
          if (validation.viesValid) {
            updates.vatId = normalizedVat;
            changes.push(`vatId: "${partnerData.vatId || "none"}" → "${normalizedVat}" (✓ valid)`);

            // Also update name from VIES if we got one and name wasn't explicitly set
            if (validation.name && name === undefined && !partnerData.name) {
              updates.name = validation.name;
              changes.push(`name set from VIES: "${validation.name}"`);
            }
          } else {
            changes.push(`vatId: "${normalizedVat}" (⚠ invalid: ${validation.viesError})`);
            // Still update it but note it's invalid
            updates.vatId = normalizedVat;
          }
        } catch (error) {
          console.error("[updatePartner] VAT validation failed:", error);
          updates.vatId = normalizedVat;
          changes.push(`vatId: "${normalizedVat}" (validation failed)`);
        }
      } else {
        updates.vatId = null;
        changes.push(`vatId removed`);
      }
    }

    if (website !== undefined && website !== partnerData.website) {
      const normalizedWebsite = website
        ? website.trim().replace(/^https?:\/\//, "").split("/")[0]
        : null;
      updates.website = normalizedWebsite;
      changes.push(`website: "${partnerData.website || "none"}" → "${normalizedWebsite || "none"}"`);
    }

    if (country !== undefined && country !== partnerData.country) {
      updates.country = country || null;
      changes.push(`country: "${partnerData.country || "none"}" → "${country || "none"}"`);
    }

    if (changes.length === 0) {
      return {
        success: true,
        partnerId,
        partnerName: partnerData.name,
        message: "No changes to apply",
      };
    }

    await partnerRef.update(updates);

    return {
      success: true,
      partnerId,
      partnerName: updates.name || partnerData.name,
      changes,
      message: `Updated partner "${updates.name || partnerData.name}"`,
    };
  },
  {
    name: "updatePartner",
    description: `Update an existing partner's details. VAT IDs are automatically validated via EU VIES.
Use this to correct partner information like name, VAT ID, website, or country.`,
    schema: z.object({
      partnerId: z.string().describe("The partner ID to update"),
      name: z.string().optional().describe("New partner name"),
      aliases: z.array(z.string()).optional().describe("New list of aliases/patterns"),
      vatId: z.string().optional().describe("New VAT ID (will be validated via VIES)"),
      website: z.string().optional().describe("New website URL"),
      country: z.string().optional().describe("New country code (e.g., AT, DE)"),
    }),
  }
);

// ============================================================================
// Bulk Assign Partner to Transactions
// ============================================================================

export const bulkAssignPartnerToTransactionsTool = tool(
  async ({ transactionIds, partnerId }, config) => {
    const userId = config?.configurable?.userId;
    if (!userId) {
      return { error: "User ID not provided" };
    }

    if (!transactionIds || transactionIds.length === 0) {
      return { error: "No transaction IDs provided" };
    }

    // Verify partner ownership
    const partnerRef = db.collection("partners").doc(partnerId);
    const partnerDoc = await partnerRef.get();

    if (!partnerDoc.exists) {
      return { error: "Partner not found" };
    }

    const partnerData = partnerDoc.data()!;
    if (partnerData.userId !== userId) {
      return { error: "Partner not found" };
    }

    // Process all transactions in batches of 500 (Firestore limit)
    const results = {
      success: [] as string[],
      failed: [] as { id: string; reason: string }[],
    };

    const batchSize = 500;
    const now = Timestamp.now();

    for (let i = 0; i < transactionIds.length; i += batchSize) {
      const batchIds = transactionIds.slice(i, i + batchSize);
      const batch = db.batch();

      for (const txId of batchIds) {
        const txRef = db.collection("transactions").doc(txId);
        const txDoc = await txRef.get();

        if (!txDoc.exists) {
          results.failed.push({ id: txId, reason: "not found" });
          continue;
        }

        const txData = txDoc.data()!;
        if (txData.userId !== userId) {
          results.failed.push({ id: txId, reason: "not found" });
          continue;
        }

        batch.update(txRef, {
          partnerId: partnerId,
          partnerType: "user",
          partnerMatchedBy: "ai",
          partnerMatchConfidence: 100,
          updatedAt: now,
        });
        results.success.push(txId);
      }

      await batch.commit();
    }

    return {
      success: true,
      partnerId,
      partnerName: partnerData.name,
      assignedCount: results.success.length,
      failedCount: results.failed.length,
      failed: results.failed.length > 0 ? results.failed : undefined,
      message: `Assigned partner "${partnerData.name}" to ${results.success.length} transaction(s)`,
    };
  },
  {
    name: "bulkAssignPartnerToTransactions",
    description:
      "Assign a partner to multiple transactions at once. Use this instead of calling assignPartnerToTransaction multiple times.",
    schema: z.object({
      transactionIds: z.array(z.string()).describe("Array of transaction IDs to assign"),
      partnerId: z.string().describe("The partner ID to assign to all transactions"),
    }),
  }
);

// ============================================================================
// Find or Create Partner (with AI lookup and VAT validation)
// ============================================================================

export const findOrCreatePartnerTool = tool(
  async ({ nameOrUrl, transactionId }, config) => {
    const userId = config?.configurable?.userId;
    const authHeader = config?.configurable?.authHeader;
    if (!userId) {
      return { error: "User ID not provided" };
    }

    const searchTerm = nameOrUrl.trim();
    const isUrl = searchTerm.includes(".") && !searchTerm.includes(" ");

    console.log(`[findOrCreatePartner] Searching for: ${searchTerm} (isUrl: ${isUrl})`);

    // Step 1: Search existing partners first
    const searchLower = searchTerm.toLowerCase();
    const domain = isUrl ? searchTerm.replace(/^https?:\/\//, "").split("/")[0] : null;

    const partnersSnapshot = await db
      .collection("partners")
      .where("userId", "==", userId)
      .where("isActive", "==", true)
      .get();

    // Check for existing partner by name, alias, website, or VAT
    for (const doc of partnersSnapshot.docs) {
      const p = doc.data();
      const nameMatch = p.name?.toLowerCase().includes(searchLower);
      const aliasMatch = p.aliases?.some((a: string) => a.toLowerCase().includes(searchLower));
      const websiteMatch = domain && p.website?.toLowerCase().includes(domain.toLowerCase());
      const vatMatch = p.vatId?.toLowerCase().replace(/\s/g, "") === searchLower.toUpperCase().replace(/\s/g, "");

      if (nameMatch || aliasMatch || websiteMatch || vatMatch) {
        console.log(`[findOrCreatePartner] Found existing partner: ${p.name}`);

        // Optionally assign to transaction
        if (transactionId) {
          const txRef = db.collection("transactions").doc(transactionId);
          const txDoc = await txRef.get();

          if (txDoc.exists && txDoc.data()?.userId === userId) {
            await txRef.update({
              partnerId: doc.id,
              partnerType: "user",
              partnerMatchedBy: "ai",
              partnerMatchConfidence: 100,
              updatedAt: Timestamp.now(),
            });

            return {
              success: true,
              action: "found_and_assigned",
              partnerId: doc.id,
              partnerName: p.name,
              transactionId,
              message: `Found existing partner "${p.name}" and assigned to transaction`,
            };
          }
        }

        return {
          success: true,
          action: "found_existing",
          partnerId: doc.id,
          partnerName: p.name,
          vatId: p.vatId,
          website: p.website,
          country: p.country,
          message: `Found existing partner "${p.name}"`,
        };
      }
    }

    // Step 2: Look up company info via AI (Gemini with Google Search grounding)
    console.log(`[findOrCreatePartner] No existing partner found, looking up via AI...`);

    let companyInfo;
    try {
      if (isUrl) {
        companyInfo = await lookupCompany({ url: searchTerm }, authHeader);
      } else {
        companyInfo = await lookupCompany({ name: searchTerm }, authHeader);
      }
      console.log(`[findOrCreatePartner] AI lookup result:`, companyInfo);
    } catch (error) {
      console.error(`[findOrCreatePartner] AI lookup failed:`, error);
      // Continue with just the name if lookup fails
      companyInfo = { name: searchTerm };
    }

    // Step 3: Validate VAT if we have one
    let vatValidation;
    const vatId = companyInfo.vatId;
    if (vatId) {
      try {
        console.log(`[findOrCreatePartner] Validating VAT: ${vatId}`);
        vatValidation = await lookupByVatId(vatId, authHeader);
        console.log(`[findOrCreatePartner] VAT validation result:`, vatValidation);

        // Merge VIES data if valid (VIES is authoritative)
        if (vatValidation.viesValid) {
          if (vatValidation.name && !companyInfo.name) {
            companyInfo.name = vatValidation.name;
          }
          if (vatValidation.address && !companyInfo.address) {
            companyInfo.address = vatValidation.address;
          }
          if (vatValidation.country && !companyInfo.country) {
            companyInfo.country = vatValidation.country;
          }
        }
      } catch (error) {
        console.error(`[findOrCreatePartner] VAT validation failed:`, error);
      }
    }

    // Step 4: Create the partner
    const partnerName = companyInfo.name || searchTerm;
    const now = Timestamp.now();

    const newPartner: Record<string, unknown> = {
      userId,
      name: partnerName.trim(),
      aliases: companyInfo.aliases || [],
      address: companyInfo.address || null,
      country: companyInfo.country || null,
      vatId: companyInfo.vatId?.toUpperCase().replace(/\s/g, "") || null,
      ibans: [],
      website: companyInfo.website || (isUrl ? domain : null),
      notes: null,
      defaultCategoryId: null,
      emailDomains: [],
      fileSourcePatterns: [],
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    const partnerRef = await db.collection("partners").add(newPartner);
    console.log(`[findOrCreatePartner] Created partner: ${partnerName} (${partnerRef.id})`);

    // Step 5: Optionally assign to transaction
    if (transactionId) {
      const txRef = db.collection("transactions").doc(transactionId);
      const txDoc = await txRef.get();

      if (txDoc.exists && txDoc.data()?.userId === userId) {
        await txRef.update({
          partnerId: partnerRef.id,
          partnerType: "user",
          partnerMatchedBy: "ai",
          partnerMatchConfidence: 100,
          updatedAt: Timestamp.now(),
        });

        return {
          success: true,
          action: "created_and_assigned",
          partnerId: partnerRef.id,
          partnerName: partnerName.trim(),
          vatId: newPartner.vatId || null,
          vatValid: vatValidation?.viesValid || null,
          website: newPartner.website || null,
          country: newPartner.country || null,
          transactionId,
          message: `Created partner "${partnerName.trim()}" and assigned to transaction`,
        };
      }
    }

    return {
      success: true,
      action: "created",
      partnerId: partnerRef.id,
      partnerName: partnerName.trim(),
      vatId: newPartner.vatId || null,
      vatValid: vatValidation?.viesValid || null,
      website: newPartner.website || null,
      country: newPartner.country || null,
      message: `Created partner "${partnerName.trim()}"`,
    };
  },
  {
    name: "findOrCreatePartner",
    description: `Find an existing partner or create a new one with AI-powered company lookup and VAT validation.

This tool:
1. Searches your existing partners by name, website, or VAT ID
2. If not found, looks up company info via AI (Google Search grounding)
3. Validates VAT IDs with the official EU VIES service
4. Creates the partner with verified information
5. Optionally assigns the partner to a transaction

Use this when a user asks to "find", "create", or "identify" a partner for a transaction.
Accepts company names (e.g., "Netflix") or website URLs (e.g., "wienerlinien.at").`,
    schema: z.object({
      nameOrUrl: z
        .string()
        .describe("Company name (e.g., 'Netflix', 'Wiener Linien') or website URL (e.g., 'wienerlinien.at')"),
      transactionId: z
        .string()
        .optional()
        .describe("Transaction ID to assign the partner to (if provided)"),
    }),
  }
);

// ============================================================================
// Export all write tools
// ============================================================================

export const WRITE_TOOLS = [
  updateTransactionTool,
  createSourceTool,
  rollbackTransactionTool,
  assignPartnerToTransactionTool,
  bulkAssignPartnerToTransactionsTool,
  createPartnerTool,
  updatePartnerTool,
  findOrCreatePartnerTool,
];
