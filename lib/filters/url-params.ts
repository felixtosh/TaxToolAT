import { TransactionFilters } from "@/types/transaction";

const FILTERS_STORAGE_KEY = "transactionFilters";
const SEARCH_STORAGE_KEY = "transactionSearch";

/**
 * Serializable version of filters for localStorage
 */
interface StoredFilters {
  importId?: string;
  hasFile?: boolean;
  dateFrom?: string; // ISO string
  dateTo?: string; // ISO string
  amountType?: "income" | "expense" | "all";
  sourceId?: string;
}

/**
 * Save filters and search to localStorage
 */
export function saveFiltersToStorage(
  filters: TransactionFilters,
  search: string
): void {
  const stored: StoredFilters = {};
  if (filters.importId) stored.importId = filters.importId;
  if (filters.hasFile !== undefined) stored.hasFile = filters.hasFile;
  if (filters.dateFrom) stored.dateFrom = filters.dateFrom.toISOString();
  if (filters.dateTo) stored.dateTo = filters.dateTo.toISOString();
  if (filters.amountType && filters.amountType !== "all")
    stored.amountType = filters.amountType;
  if (filters.sourceId) stored.sourceId = filters.sourceId;

  localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(stored));
  localStorage.setItem(SEARCH_STORAGE_KEY, search);
}

/**
 * Load filters and search from localStorage
 */
export function loadFiltersFromStorage(): {
  filters: TransactionFilters;
  search: string;
} {
  const filters: TransactionFilters = {};
  const search = localStorage.getItem(SEARCH_STORAGE_KEY) || "";

  try {
    const stored = localStorage.getItem(FILTERS_STORAGE_KEY);
    if (stored) {
      const parsed: StoredFilters = JSON.parse(stored);
      if (parsed.importId) filters.importId = parsed.importId;
      if (parsed.hasFile !== undefined) filters.hasFile = parsed.hasFile;
      if (parsed.dateFrom) filters.dateFrom = new Date(parsed.dateFrom);
      if (parsed.dateTo) filters.dateTo = new Date(parsed.dateTo);
      if (parsed.amountType) filters.amountType = parsed.amountType;
      if (parsed.sourceId) filters.sourceId = parsed.sourceId;
    }
  } catch {
    // Ignore parse errors
  }

  return { filters, search };
}

/**
 * Build URL search params string from filters and search
 */
export function buildSearchParamsString(
  filters: TransactionFilters,
  search: string
): string {
  const params = new URLSearchParams();

  if (search) params.set("search", search);
  if (filters.importId) params.set("importId", filters.importId);
  if (filters.hasFile !== undefined)
    params.set("hasFile", String(filters.hasFile));
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom.toISOString());
  if (filters.dateTo) params.set("dateTo", filters.dateTo.toISOString());
  if (filters.amountType && filters.amountType !== "all")
    params.set("amountType", filters.amountType);
  if (filters.sourceId) params.set("sourceId", filters.sourceId);

  return params.toString();
}

/**
 * Check if URL has any filter or search params
 */
export function hasUrlParams(searchParams: URLSearchParams): boolean {
  return (
    searchParams.has("search") ||
    searchParams.has("importId") ||
    searchParams.has("hasFile") ||
    searchParams.has("dateFrom") ||
    searchParams.has("dateTo") ||
    searchParams.has("amountType") ||
    searchParams.has("sourceId")
  );
}

/**
 * Parse URL search params into TransactionFilters object
 */
export function parseFiltersFromUrl(
  searchParams: URLSearchParams
): TransactionFilters {
  const filters: TransactionFilters = {};

  const importId = searchParams.get("importId");
  if (importId) filters.importId = importId;

  const hasFile = searchParams.get("hasFile");
  if (hasFile === "true") filters.hasFile = true;
  if (hasFile === "false") filters.hasFile = false;

  const dateFrom = searchParams.get("dateFrom");
  if (dateFrom) filters.dateFrom = new Date(dateFrom);

  const dateTo = searchParams.get("dateTo");
  if (dateTo) filters.dateTo = new Date(dateTo);

  const amountType = searchParams.get("amountType");
  if (amountType === "income" || amountType === "expense") {
    filters.amountType = amountType;
  }

  const sourceId = searchParams.get("sourceId");
  if (sourceId) filters.sourceId = sourceId;

  return filters;
}

/**
 * Build URL with filter params from TransactionFilters object
 */
export function buildFilterUrl(
  basePath: string,
  filters: TransactionFilters
): string {
  const params = new URLSearchParams();

  if (filters.importId) params.set("importId", filters.importId);
  if (filters.hasFile !== undefined)
    params.set("hasFile", String(filters.hasFile));
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom.toISOString());
  if (filters.dateTo) params.set("dateTo", filters.dateTo.toISOString());
  if (filters.amountType && filters.amountType !== "all")
    params.set("amountType", filters.amountType);
  if (filters.sourceId) params.set("sourceId", filters.sourceId);

  const queryString = params.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
}

/**
 * Check if any filters are active (excluding search)
 */
export function hasActiveFilters(filters: TransactionFilters): boolean {
  return !!(
    filters.importId ||
    filters.hasFile !== undefined ||
    filters.dateFrom ||
    filters.dateTo ||
    (filters.amountType && filters.amountType !== "all") ||
    filters.sourceId
  );
}

/**
 * Count number of active filters
 */
export function countActiveFilters(filters: TransactionFilters): number {
  let count = 0;
  if (filters.importId) count++;
  if (filters.hasFile !== undefined) count++;
  if (filters.dateFrom || filters.dateTo) count++;
  if (filters.amountType && filters.amountType !== "all") count++;
  if (filters.sourceId) count++;
  return count;
}
