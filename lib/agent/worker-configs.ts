/**
 * Worker Configurations
 *
 * Defines the configuration for each worker type including
 * allowed tools, prompts, and execution limits.
 */

import { WorkerConfig, WorkerType } from "@/types/worker";

/**
 * Worker configurations by type
 */
export const WORKER_CONFIGS: Record<WorkerType, WorkerConfig> = {
  file_matching: {
    type: "file_matching",
    name: "File Matcher",
    description: "Searches for and connects receipts/invoices to transactions",
    toolNames: [
      // Search tools
      "generateSearchSuggestions",
      "searchLocalFiles",
      "searchGmailAttachments",
      "searchGmailEmails",
      "analyzeEmail",
      // Connection tool
      "connectFileToTransaction",
      // Download tools
      "downloadGmailAttachment",
      "convertEmailToPdf",
      // Read tools (for context)
      "getTransaction",
      "listTransactions",
      "listFiles",
      "getFile",
    ],
    systemPromptKey: "file_matching",
    maxMessages: 20,
    timeoutSeconds: 120,
  },

  partner_matching: {
    type: "partner_matching",
    name: "Partner Matcher",
    description: "Identifies and assigns partners to transactions or files",
    toolNames: [
      // Read tools (for context)
      "getTransaction",
      "getFile",
      "listPartners",
      "getPartner",
      // Search user's own data for clues (bank names are often cryptic)
      "searchGmailEmails", // Emails have full company names, domains
      "listFiles", // Invoices have proper company names
      "listTransactions", // Similar transactions may have partners
      // Lookup tools (read-only, for web search)
      "lookupCompanyInfo",
      "validateVatId",
      // Write tools (separate concerns)
      "createPartner",
      "assignPartnerToTransaction",
    ],
    systemPromptKey: "partner_matching",
    maxMessages: 25, // More messages needed for multi-source search
    timeoutSeconds: 120,
  },

  receipt_search: {
    type: "receipt_search",
    name: "Receipt Finder",
    description: "Searches for receipts/invoices for transactions",
    toolNames: [
      // AI-generated search queries
      "generateSearchSuggestions",
      // Search tools
      "searchLocalFiles",
      "searchGmailAttachments",
      "searchGmailEmails",
      "analyzeEmail",
      // Connection tool
      "connectFileToTransaction",
      // Download tools
      "downloadGmailAttachment",
      "convertEmailToPdf",
      // Read tools (for context)
      "getTransaction",
      "listFiles",
      "getFile",
      "waitForFileExtraction",
    ],
    systemPromptKey: "receipt_search",
    maxMessages: 30, // Increased - needs room for search, download, wait, verify cycles
    timeoutSeconds: 120,
  },
};

/**
 * Get worker config by type
 */
export function getWorkerConfig(type: WorkerType): WorkerConfig {
  const config = WORKER_CONFIGS[type];
  if (!config) {
    throw new Error(`Unknown worker type: ${type}`);
  }
  return config;
}

/**
 * Get all worker types
 */
export function getAllWorkerTypes(): WorkerType[] {
  return Object.keys(WORKER_CONFIGS) as WorkerType[];
}
