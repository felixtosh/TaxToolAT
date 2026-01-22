/**
 * Design System - Tool Result Types
 *
 * Shared types for GenUI tool result previews in chat interface.
 */

/**
 * Base transaction context shown in search results
 */
export interface SearchedTransactionContext {
  id: string;
  name: string;
  partner?: string;
  amount: number;
  date: string;
}

/**
 * Local file search candidate
 */
export interface LocalFileCandidate {
  id: string;
  fileId?: string;
  fileName?: string;
  score: number;
  scoreLabel?: "Strong" | "Likely" | null;
  scoreReasons?: string[];
  extractedAmount?: number;
  extractedDate?: string;
  extractedPartner?: string;
  scoreDetails?: string;
}

/**
 * Gmail attachment search candidate
 */
export interface GmailAttachmentCandidate {
  id: string;
  messageId?: string;
  attachmentId?: string;
  attachmentFilename?: string;
  attachmentMimeType?: string;
  attachmentSize?: number;
  emailSubject?: string;
  emailFrom?: string;
  emailDate?: string;
  emailSnippet?: string;
  integrationId?: string;
  integrationEmail?: string;
  score: number;
  scoreLabel?: "Strong" | "Likely" | null;
  scoreReasons?: string[];
  scoreDetails?: string;
  alreadyDownloaded?: boolean;
  existingFileId?: string | null;
}

/**
 * Result from searchLocalFiles tool
 */
export interface LocalFilesSearchResult {
  searchType: "local_files";
  strategy?: "partner_files" | "amount_files" | "both";
  searchedTransaction: SearchedTransactionContext;
  summary: string;
  candidates: LocalFileCandidate[];
  totalFound: number;
}

/**
 * Integration that needs reconnection
 */
export interface IntegrationNeedingReauth {
  integrationId: string;
  email: string;
  needsReauth: boolean;
}

/**
 * Result from searchGmailAttachments tool
 */
export interface GmailAttachmentsSearchResult {
  searchType: "gmail_attachments";
  searchedTransaction?: SearchedTransactionContext;
  queriesUsed: string[];
  summary?: string;
  candidates: GmailAttachmentCandidate[];
  totalFound: number;
  integrationCount: number;
  /** True when user has no Gmail integrations connected */
  gmailNotConnected?: boolean;
  /** Integrations that need reauth or are paused */
  integrationsNeedingReauth?: IntegrationNeedingReauth[];
  error?: string;
}

/**
 * Transaction result from listTransactions tool
 */
export interface TransactionResult {
  id: string;
  date: string;
  dateFormatted?: string;
  amount: number;
  amountFormatted: string;
  name: string;
  description: string | null;
  partner: string;
  isComplete: boolean;
  hasReceipts: boolean;
}

/**
 * Search suggestion from generateSearchSuggestions tool
 */
export interface SearchSuggestion {
  query: string;
  type: "invoice_number" | "company_name" | "email_domain" | "vat_id" | "iban" | "pattern" | "fallback";
  typeLabel: string;
  score: number;
}

/**
 * Result from generateSearchSuggestions tool
 */
export interface SearchSuggestionsResultData {
  searchType: "search_suggestions";
  transaction: {
    id: string;
    name: string;
    partner?: string;
    amountFormatted: string;
    dateFormatted: string;
  };
  suggestions: SearchSuggestion[];
  queries: string[];
  summary: string;
}

/**
 * Props for tool result UI actions
 */
export interface ToolResultUIActions {
  scrollToTransaction?: (id: string) => void;
  openTransactionSheet?: (id: string) => void;
  openFile?: (fileId: string) => void;
  previewFile?: (fileId: string) => void;
}
