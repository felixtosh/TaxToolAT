import { PartnerFilters } from "@/types/partner";

/**
 * Parse URL search params into PartnerFilters object
 */
export function parsePartnerFiltersFromUrl(
  searchParams: URLSearchParams
): PartnerFilters {
  const filters: PartnerFilters = {};

  const hasVatId = searchParams.get("hasVatId");
  if (hasVatId === "true") filters.hasVatId = true;
  if (hasVatId === "false") filters.hasVatId = false;

  const hasIban = searchParams.get("hasIban");
  if (hasIban === "true") filters.hasIban = true;
  if (hasIban === "false") filters.hasIban = false;

  const country = searchParams.get("country");
  if (country) filters.country = country;

  return filters;
}

/**
 * Build URL search params from PartnerFilters and search string
 */
export function buildPartnerSearchParams(
  filters: PartnerFilters,
  search: string,
  selectedId?: string | null
): URLSearchParams {
  const params = new URLSearchParams();

  if (search) params.set("search", search);
  if (selectedId) params.set("id", selectedId);

  if (filters.hasVatId === true) {
    params.set("hasVatId", "true");
  } else if (filters.hasVatId === false) {
    params.set("hasVatId", "false");
  }

  if (filters.hasIban === true) {
    params.set("hasIban", "true");
  } else if (filters.hasIban === false) {
    params.set("hasIban", "false");
  }

  if (filters.country) {
    params.set("country", filters.country);
  }

  return params;
}

/**
 * Build full URL for partners page with filters
 */
export function buildPartnerFilterUrl(
  filters: PartnerFilters,
  search?: string,
  selectedId?: string | null
): string {
  const params = buildPartnerSearchParams(filters, search || "", selectedId);
  const queryString = params.toString();
  return queryString ? `/partners?${queryString}` : "/partners";
}

/**
 * Check if any filters are active (excluding search)
 */
export function hasActivePartnerFilters(filters: PartnerFilters): boolean {
  return !!(
    filters.hasVatId !== undefined ||
    filters.hasIban !== undefined ||
    filters.country
  );
}
