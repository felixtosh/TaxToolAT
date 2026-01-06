/**
 * Partner matching utilities
 */

export {
  normalizeUrl,
  extractDomain,
  extractRootDomain,
  urlsMatch,
  rootDomainsMatch,
  isValidUrl,
} from "./url-normalizer";

export {
  calculateSimilarity,
  normalizeCompanyName,
  calculateCompanyNameSimilarity,
  findBestNameMatch,
  vatIdsMatch,
} from "./fuzzy-match";

export {
  matchTransaction,
  matchTransactionsBatch,
  matchTransactionByPattern,
  matchAllTransactionsByPattern,
  globMatch,
  shouldAutoApply,
  getConfidenceTier,
  getConfidenceColor,
  getSourceLabel,
} from "./partner-matcher";

/**
 * Transaction matching utilities (file to transaction)
 */
export {
  TRANSACTION_MATCH_CONFIG,
  scoreTransactionMatch,
  findTransactionMatches,
  toTransactionSuggestion,
  resolvePartnerConflict,
  shouldAutoMatchTransaction,
  getTransactionMatchConfidenceTier,
  getTransactionMatchConfidenceColor,
  getTransactionMatchSourceLabel,
  getTransactionMatchSourceIcon,
} from "./transaction-matcher";

export type { TransactionMatchScore } from "./transaction-matcher";
