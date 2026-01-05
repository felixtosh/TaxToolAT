/**
 * Tools that require user confirmation before execution
 */
export const TOOLS_REQUIRING_CONFIRMATION = [
  "updateTransaction",
  "bulkCategorize",
  "createSource",
  "updateSource",
  "deleteSource",
  "rollbackTransaction",
] as const;

export type ConfirmableToolName = (typeof TOOLS_REQUIRING_CONFIRMATION)[number];

/**
 * Check if a tool requires confirmation
 */
export function requiresConfirmation(toolName: string): boolean {
  return TOOLS_REQUIRING_CONFIRMATION.includes(toolName as ConfirmableToolName);
}

/**
 * Impact level for confirmation UI styling
 */
export type ImpactLevel = "low" | "medium" | "high";

/**
 * Details for rendering a confirmation card
 */
export interface ConfirmationDetails {
  title: string;
  description: string;
  impact: ImpactLevel;
  previewData?: Record<string, unknown>;
}

/**
 * Get confirmation details for a tool call
 */
export function getConfirmationDetails(
  toolName: ConfirmableToolName,
  args: Record<string, unknown>
): ConfirmationDetails {
  switch (toolName) {
    case "updateTransaction":
      return {
        title: "Update Transaction",
        description: "This will update the transaction with the following changes:",
        impact: "low",
        previewData: filterUndefined({
          description: args.description,
          categoryId: args.categoryId,
          isComplete: args.isComplete,
        }),
      };

    case "bulkCategorize": {
      const count = (args.transactionIds as string[])?.length ?? 0;
      return {
        title: "Bulk Categorize Transactions",
        description: `This will assign a category to ${count} transaction${count !== 1 ? "s" : ""}.`,
        impact: count > 10 ? "high" : "medium",
        previewData: {
          transactionCount: count,
          categoryId: args.categoryId,
        },
      };
    }

    case "createSource":
      return {
        title: "Create Bank Account",
        description: "This will create a new bank account for importing transactions.",
        impact: "medium",
        previewData: filterUndefined({
          name: args.name,
          iban: args.iban,
          currency: args.currency,
        }),
      };

    case "updateSource":
      return {
        title: "Update Bank Account",
        description: "This will update the bank account details.",
        impact: "low",
        previewData: filterUndefined({
          name: args.name,
          bankName: args.bankName,
        }),
      };

    case "deleteSource":
      return {
        title: "Delete Bank Account",
        description:
          "This will mark the bank account as inactive. Associated transactions will remain but won't be visible in filters.",
        impact: "high",
        previewData: {
          sourceId: args.sourceId,
        },
      };

    case "rollbackTransaction":
      return {
        title: "Rollback Transaction",
        description:
          "This will restore the transaction to a previous state. A history entry will be created for this change.",
        impact: "medium",
        previewData: {
          transactionId: args.transactionId,
          historyId: args.historyId,
        },
      };

    default:
      return {
        title: "Confirm Action",
        description: "This action will modify data.",
        impact: "medium",
      };
  }
}

/**
 * Helper to filter out undefined values from an object
 */
function filterUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}
