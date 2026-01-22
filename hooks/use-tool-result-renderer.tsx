"use client";

import { ReactNode, useCallback, useMemo } from "react";
import {
  LocalFilesResult,
  GmailAttachmentsResult,
  SearchSuggestionsResult,
  TransactionListResult,
  LocalFilesSearchResult,
  GmailAttachmentsSearchResult,
  SearchSuggestionsResultData,
  TransactionResult,
  ToolResultUIActions,
} from "@/design-system/tool-results";
import { ToolCall } from "@/types/chat";

/**
 * Registry of tool result renderers.
 * Maps tool names to their result component renderers.
 */
type ToolResultRenderer = (
  result: unknown,
  uiActions?: ToolResultUIActions,
  toolArgs?: Record<string, unknown>
) => ReactNode | null;

interface UseToolResultRendererOptions {
  uiActions?: ToolResultUIActions;
}

/**
 * Hook for rendering tool call results using the design system components.
 *
 * @example
 * ```tsx
 * const { renderToolResult, hasRenderer } = useToolResultRenderer({
 *   uiActions: {
 *     scrollToTransaction: (id) => ...,
 *     openTransactionSheet: (id) => ...,
 *   }
 * });
 *
 * if (hasRenderer(toolCall.name)) {
 *   return renderToolResult(toolCall);
 * }
 * ```
 */
export function useToolResultRenderer(options: UseToolResultRendererOptions = {}) {
  const { uiActions } = options;

  /**
   * Registry of all supported tool result renderers.
   * Add new tool renderers here when adding new GenUI components.
   */
  const renderers = useMemo<Record<string, ToolResultRenderer>>(() => ({
    // Transaction list
    listTransactions: (result, actions, toolArgs) => {
      // Handle both formats: {transactions: [...], total: N} or direct array
      let transactions: TransactionResult[];
      let totalCount: number | undefined;
      if (Array.isArray(result)) {
        transactions = result;
      } else if (result && typeof result === "object" && "transactions" in result) {
        const typedResult = result as { transactions: TransactionResult[]; total?: number };
        transactions = typedResult.transactions;
        totalCount = typedResult.total;
      } else {
        return null;
      }
      if (!Array.isArray(transactions) || transactions.length === 0) return null;

      // Extract search query from tool args if available
      const searchQuery = toolArgs?.search as string | undefined;

      return (
        <TransactionListResult
          transactions={transactions}
          uiActions={actions}
          searchQuery={searchQuery}
          totalCount={totalCount}
        />
      );
    },

    // Local files search
    searchLocalFiles: (result, actions) => {
      const typedResult = result as LocalFilesSearchResult;
      if (typedResult?.searchType !== "local_files") return null;
      return (
        <LocalFilesResult
          result={typedResult}
          uiActions={actions}
        />
      );
    },

    // Gmail attachments search
    searchGmailAttachments: (result, actions) => {
      const typedResult = result as GmailAttachmentsSearchResult;
      if (typedResult?.searchType !== "gmail_attachments") return null;
      return (
        <GmailAttachmentsResult
          result={typedResult}
          uiActions={actions}
        />
      );
    },

    // Search suggestions
    generateSearchSuggestions: (result) => {
      const typedResult = result as SearchSuggestionsResultData;
      // Add searchType for validation
      if (!typedResult?.suggestions && !typedResult?.queries) return null;
      return (
        <SearchSuggestionsResult
          result={{ ...typedResult, searchType: "search_suggestions" }}
        />
      );
    },
  }), []);

  /**
   * Check if a tool has a registered result renderer.
   */
  const hasRenderer = useCallback(
    (toolName: string): boolean => {
      return toolName in renderers;
    },
    [renderers]
  );

  /**
   * Get list of all supported tool names with renderers.
   */
  const supportedTools = useMemo(() => Object.keys(renderers), [renderers]);

  /**
   * Render a tool call's result using the appropriate GenUI component.
   * Returns null if no renderer is registered or if result is empty.
   */
  const renderToolResult = useCallback(
    (toolCall: ToolCall): ReactNode | null => {
      if (toolCall.status !== "executed" || !toolCall.result) {
        return null;
      }

      const renderer = renderers[toolCall.name];
      if (!renderer) {
        return null;
      }

      return renderer(toolCall.result, uiActions, toolCall.args);
    },
    [renderers, uiActions]
  );

  /**
   * Render a result directly by tool name (without a ToolCall wrapper).
   * Useful for previewing results or testing.
   */
  const renderResult = useCallback(
    (toolName: string, result: unknown): ReactNode | null => {
      const renderer = renderers[toolName];
      if (!renderer) {
        return null;
      }
      return renderer(result, uiActions);
    },
    [renderers, uiActions]
  );

  return {
    renderToolResult,
    renderResult,
    hasRenderer,
    supportedTools,
  };
}
