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
