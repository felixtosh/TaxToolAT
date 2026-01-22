/**
 * Design System - Tool Result Components
 *
 * Consolidated GenUI components for rendering tool call results
 * in the chat interface. Import from this index for all tool result previews.
 *
 * @example
 * import {
 *   LocalFilesResult,
 *   GmailAttachmentsResult,
 *   TransactionListResult,
 * } from "@/design-system/tool-results";
 */

// Types
export type {
  SearchedTransactionContext,
  LocalFileCandidate,
  GmailAttachmentCandidate,
  LocalFilesSearchResult,
  GmailAttachmentsSearchResult,
  SearchSuggestion,
  SearchSuggestionsResultData,
  TransactionResult,
  ToolResultUIActions,
} from "./types";

// Components
export { LocalFilesResult } from "./local-files-result";
export { GmailAttachmentsResult } from "./gmail-attachments-result";
export { SearchSuggestionsResult } from "./search-suggestions-result";
export { TransactionListResult } from "./transaction-list-result";
