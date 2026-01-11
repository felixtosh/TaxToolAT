/**
 * Automation Definitions
 *
 * This file defines the automation metadata that lives alongside the matching logic.
 * The automation registry imports from here, ensuring a single source of truth.
 *
 * When you add/change matching logic, update the corresponding definition here.
 */

import type { AutomationStep, AutomationPipeline, PipelineId } from "@/types/automation";
import { TRANSACTION_MATCH_CONFIG } from "./transaction-matcher";

// ============================================================================
// PARTNER MATCHING AUTOMATIONS
// ============================================================================

/**
 * Partner matching configuration
 * These values are used by partner-matcher.ts
 */
export const PARTNER_MATCH_CONFIG = {
  /** Threshold for auto-applying partner matches */
  AUTO_APPLY_THRESHOLD: 89,
  /** IBAN match confidence (exact bank account match) */
  IBAN_CONFIDENCE: 100,
  /** VAT ID match confidence */
  VAT_CONFIDENCE: 95,
  /** Website match confidence */
  WEBSITE_CONFIDENCE: 90,
  /** Manual alias/pattern confidence */
  ALIAS_CONFIDENCE: 90,
  /** Fuzzy name match range */
  NAME_CONFIDENCE_MIN: 60,
  NAME_CONFIDENCE_MAX: 90,
  /** AI lookup confidence (Gemini) */
  AI_LOOKUP_CONFIDENCE: 89,
};

export const PARTNER_MATCHING_AUTOMATIONS: AutomationStep[] = [
  {
    id: "partner-iban-match",
    name: "IBAN Match",
    shortDescription: "Match by bank account number",
    longDescription:
      "Matches transactions to partners based on the IBAN (bank account number) in the transaction. This is the most reliable match since IBANs are unique to each bank account.",
    icon: "Building2",
    integrationId: null,
    affectedFields: ["partnerId", "partnerType", "partnerMatchConfidence"],
    confidence: {
      min: PARTNER_MATCH_CONFIG.IBAN_CONFIDENCE,
      max: PARTNER_MATCH_CONFIG.IBAN_CONFIDENCE,
      unit: "percent"
    },
    order: 1,
    trigger: "always", // Highest priority, always checked first
    category: "matching",
  },
  {
    id: "partner-pattern-match",
    name: "Learned Pattern Match",
    shortDescription: "Match using patterns from previous assignments",
    longDescription:
      "Uses glob patterns learned from previous manual partner assignments. When you assign a transaction to a partner, the system learns text patterns from that transaction to recognize similar ones in the future.",
    icon: "Sparkles",
    integrationId: null,
    affectedFields: ["partnerId", "partnerType", "partnerMatchConfidence", "partnerSuggestions"],
    confidence: { min: 50, max: 100, unit: "percent" },
    order: 2,
    trigger: "always", // Always checked, may produce suggestions even if IBAN matched
    category: "matching",
  },
  {
    id: "partner-vat-match",
    name: "VAT ID Match",
    shortDescription: "Match by VAT identification number",
    longDescription:
      "Matches transactions to partners based on their VAT ID. This is highly reliable for business transactions as VAT IDs are unique and verified by tax authorities.",
    icon: "Receipt",
    integrationId: null,
    affectedFields: ["partnerId", "partnerType", "partnerMatchConfidence"],
    confidence: {
      min: PARTNER_MATCH_CONFIG.VAT_CONFIDENCE,
      max: PARTNER_MATCH_CONFIG.VAT_CONFIDENCE,
      unit: "percent"
    },
    order: 3,
    trigger: "always",
    category: "matching",
  },
  {
    id: "partner-website-match",
    name: "Website Match",
    shortDescription: "Match by company website in transaction",
    longDescription:
      "Detects partner websites mentioned in transaction descriptions. When a transaction contains a URL that matches a known partner's website, it suggests that partner.",
    icon: "Globe",
    integrationId: null,
    affectedFields: ["partnerId", "partnerType", "partnerMatchConfidence"],
    confidence: {
      min: PARTNER_MATCH_CONFIG.WEBSITE_CONFIDENCE,
      max: PARTNER_MATCH_CONFIG.WEBSITE_CONFIDENCE,
      unit: "percent"
    },
    order: 4,
    trigger: "always",
    category: "matching",
  },
  {
    id: "partner-alias-match",
    name: "Manual Alias Match",
    shortDescription: "Match using manually defined aliases",
    longDescription:
      "Matches transactions using glob patterns (wildcards like * and ?) that you've manually defined on partners. Useful for catching variations in how a company appears in bank statements.",
    icon: "Tag",
    integrationId: null,
    affectedFields: ["partnerId", "partnerType", "partnerMatchConfidence"],
    confidence: {
      min: PARTNER_MATCH_CONFIG.ALIAS_CONFIDENCE,
      max: PARTNER_MATCH_CONFIG.ALIAS_CONFIDENCE,
      unit: "percent"
    },
    order: 5,
    trigger: "always",
    category: "matching",
  },
  {
    id: "partner-fuzzy-name-match",
    name: "Fuzzy Name Match",
    shortDescription: "Match by similar company name",
    longDescription:
      "Uses fuzzy string matching to find partners with similar names. Even if the transaction text isn't an exact match, similar names (accounting for typos, abbreviations, etc.) will be suggested.",
    icon: "Search",
    integrationId: null,
    affectedFields: ["partnerId", "partnerType", "partnerMatchConfidence", "partnerSuggestions"],
    confidence: {
      min: PARTNER_MATCH_CONFIG.NAME_CONFIDENCE_MIN,
      max: PARTNER_MATCH_CONFIG.NAME_CONFIDENCE_MAX,
      unit: "percent"
    },
    order: 6,
    trigger: "always", // Always runs for suggestions
    category: "matching",
  },
  {
    id: "partner-ai-lookup",
    name: "AI Company Lookup",
    shortDescription: "Search for company info using AI",
    longDescription:
      "When no match is found but the transaction appears to be from a real company, AI searches for company information online. If found, it can automatically create a new partner with verified details.",
    icon: "Bot",
    integrationId: null,
    affectedFields: ["partnerId", "partnerType", "partnerMatchConfidence"],
    confidence: {
      min: PARTNER_MATCH_CONFIG.AI_LOOKUP_CONFIDENCE,
      max: PARTNER_MATCH_CONFIG.AI_LOOKUP_CONFIDENCE,
      unit: "percent"
    },
    order: 7,
    trigger: "if_no_match", // Only runs when no existing partner matched
    canCreateEntities: true,
    category: "ai",
  },
];

// ============================================================================
// CATEGORY (NO-RECEIPT) MATCHING CONFIG
// ============================================================================

/**
 * Category matching configuration
 * These values are used by category-matcher.ts (server-side)
 * Category matching steps are included in FILE_MATCHING_AUTOMATIONS below
 */
export const CATEGORY_MATCH_CONFIG = {
  /** Minimum confidence to show as suggestion */
  SUGGESTION_THRESHOLD: 60,
  /** Minimum confidence for auto-assignment */
  AUTO_APPLY_THRESHOLD: 89,
  /** Base confidence for partner-only match */
  PARTNER_MATCH_CONFIDENCE: 85,
  /** Bonus confidence when both partner and pattern match */
  COMBINED_MATCH_BONUS: 15,
};

// ============================================================================
// FILE MATCHING AUTOMATIONS
// ============================================================================

export const FILE_MATCHING_AUTOMATIONS: AutomationStep[] = [
  {
    id: "file-transaction-matching",
    name: "Transaction Matching",
    shortDescription: "Match files to transactions by amount, date, and partner",
    longDescription:
      `Automatically matches uploaded receipts and invoices to transactions using a scoring algorithm. ` +
      `The system considers: invoice amount (exact or close matches), date proximity (within ${TRANSACTION_MATCH_CONFIG.DATE_RANGE_DAYS} days), ` +
      `partner overlap (same company on both), IBAN presence, and reference/invoice numbers. ` +
      `Matches scoring ${TRANSACTION_MATCH_CONFIG.AUTO_MATCH_THRESHOLD}+ points are auto-connected; ` +
      `scores ${TRANSACTION_MATCH_CONFIG.SUGGESTION_THRESHOLD}-${TRANSACTION_MATCH_CONFIG.AUTO_MATCH_THRESHOLD - 1} appear as suggestions.`,
    icon: "FileSearch",
    integrationId: null,
    affectedFields: ["fileIds"],
    confidence: {
      min: TRANSACTION_MATCH_CONFIG.SUGGESTION_THRESHOLD,
      max: 100,
      unit: "percent"
    },
    order: 1,
    trigger: "always",
    category: "matching",
  },
  {
    id: "file-gmail-search",
    name: "Gmail Invoice Search",
    shortDescription: "Search email attachments for invoices",
    longDescription:
      "Searches your connected Gmail account for invoice attachments based on the transaction partner and date. When you need a receipt, this automation can find PDF invoices and images from emails sent by that company around the transaction date.",
    icon: "Mail",
    integrationId: "gmail",
    affectedFields: ["fileIds"],
    order: 2,
    trigger: "if_integration",
    category: "search",
  },
  {
    id: "category-partner-match",
    name: "No-Receipt: Partner Match",
    shortDescription: "Match by previously categorized partner",
    longDescription:
      `When no file is found, checks if the transaction's partner was previously assigned to a no-receipt category ` +
      `(like bank fees, interest, or internal transfers). Useful for recurring charges that never have receipts.`,
    icon: "FolderOpen",
    integrationId: null,
    affectedFields: ["noReceiptCategoryId", "categorySuggestions"],
    confidence: {
      min: CATEGORY_MATCH_CONFIG.PARTNER_MATCH_CONFIDENCE,
      max: CATEGORY_MATCH_CONFIG.PARTNER_MATCH_CONFIDENCE,
      unit: "percent"
    },
    order: 3,
    trigger: "if_no_match", // Only runs if no file was matched
    category: "matching",
  },
  {
    id: "category-pattern-match",
    name: "No-Receipt: Pattern Match",
    shortDescription: "Match using learned patterns for receipt-free transactions",
    longDescription:
      `When no file is found, uses glob patterns learned from previous no-receipt category assignments. ` +
      `Recognizes transaction text patterns like "BANK FEE*" or "INTEREST*" to suggest appropriate categories.`,
    icon: "Sparkles",
    integrationId: null,
    affectedFields: ["noReceiptCategoryId", "categorySuggestions"],
    confidence: {
      min: CATEGORY_MATCH_CONFIG.SUGGESTION_THRESHOLD,
      max: 100,
      unit: "percent"
    },
    order: 4,
    trigger: "if_no_match", // Only runs if no file was matched
    category: "matching",
  },
];

// ============================================================================
// PIPELINES
// ============================================================================

export const FIND_PARTNER_PIPELINE: AutomationPipeline = {
  id: "find-partner",
  name: "Find Partner for Transaction",
  description:
    `Automatically identifies which company or person a transaction belongs to. ` +
    `Matches with ${PARTNER_MATCH_CONFIG.AUTO_APPLY_THRESHOLD}%+ confidence are auto-applied; lower scores appear as suggestions.`,
  icon: "Building2",
  triggers: [
    {
      type: "on_import",
      description: "Runs when new transactions are imported from a bank account",
    },
    {
      type: "on_partner_create",
      description: "Re-evaluates unmatched transactions when a new partner is created",
    },
  ],
  steps: PARTNER_MATCHING_AUTOMATIONS,
};

export const FIND_FILE_PIPELINE: AutomationPipeline = {
  id: "find-file",
  name: "Find Receipt for Transaction",
  description:
    `Matches receipts/invoices to transactions, or suggests no-receipt categories when appropriate. ` +
    `Files auto-connect at ${TRANSACTION_MATCH_CONFIG.AUTO_MATCH_THRESHOLD}+ points; ` +
    `categories auto-apply at ${CATEGORY_MATCH_CONFIG.AUTO_APPLY_THRESHOLD}%+ confidence.`,
  icon: "FileText",
  triggers: [
    {
      type: "on_file_upload",
      description: "Runs when a new file is uploaded to find matching transactions",
    },
    {
      type: "on_extraction_complete",
      description: "Runs after AI extracts invoice details (amount, date, partner)",
    },
    {
      type: "chained",
      description: "Re-runs after partner is assigned to a transaction",
    },
  ],
  steps: FILE_MATCHING_AUTOMATIONS,
};

export const ALL_PIPELINES: AutomationPipeline[] = [
  FIND_PARTNER_PIPELINE,
  FIND_FILE_PIPELINE,
];
