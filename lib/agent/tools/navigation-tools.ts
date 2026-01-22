/**
 * Navigation Tools
 *
 * Tools for controlling UI state. These don't modify data,
 * they send commands to the frontend to update the view.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";

// ============================================================================
// Navigate To
// ============================================================================

export const navigateToTool = tool(
  async ({ path }) => {
    // Navigation is handled by the frontend via tool result
    return {
      action: "navigate",
      path,
      navigated: true,
    };
  },
  {
    name: "navigateTo",
    description: "Navigate to a page in the application",
    schema: z.object({
      path: z.enum(["/transactions", "/sources"]).describe("The page path"),
    }),
  }
);

// ============================================================================
// Open Transaction Sheet
// ============================================================================

export const openTransactionSheetTool = tool(
  async ({ transactionId }) => {
    // Sheet opening is handled by the frontend via tool result
    return {
      action: "openSheet",
      transactionId,
      opened: true,
    };
  },
  {
    name: "openTransactionSheet",
    description: "Open the detail sheet/sidebar for a specific transaction",
    schema: z.object({
      transactionId: z.string().describe("The transaction ID to show"),
    }),
  }
);

// ============================================================================
// Scroll to Transaction
// ============================================================================

export const scrollToTransactionTool = tool(
  async ({ transactionId }) => {
    // Scrolling is handled by the frontend via tool result
    return {
      action: "scrollTo",
      transactionId,
      scrolled: true,
    };
  },
  {
    name: "scrollToTransaction",
    description: "Scroll to and highlight a transaction in the list",
    schema: z.object({
      transactionId: z.string().describe("The transaction ID to scroll to"),
    }),
  }
);

// ============================================================================
// Export all navigation tools
// ============================================================================

export const NAVIGATION_TOOLS = [
  navigateToTool,
  openTransactionSheetTool,
  scrollToTransactionTool,
];
