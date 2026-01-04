import { TransactionFilters } from "@/types/transaction";

/**
 * Parse URL search params into TransactionFilters object
 */
export function parseFiltersFromUrl(
  searchParams: URLSearchParams
): TransactionFilters {
  const filters: TransactionFilters = {};

  const importId = searchParams.get("importId");
  if (importId) filters.importId = importId;

  const hasReceipt = searchParams.get("hasReceipt");
  if (hasReceipt === "true") filters.hasReceipt = true;
  if (hasReceipt === "false") filters.hasReceipt = false;

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
  if (filters.hasReceipt !== undefined)
    params.set("hasReceipt", String(filters.hasReceipt));
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
    filters.hasReceipt !== undefined ||
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
  if (filters.hasReceipt !== undefined) count++;
  if (filters.dateFrom || filters.dateTo) count++;
  if (filters.amountType && filters.amountType !== "all") count++;
  if (filters.sourceId) count++;
  return count;
}
