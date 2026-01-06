/**
 * Common countries for partner addresses
 * Sorted by relevance for European tax applications
 */
export const COUNTRIES = [
  // DACH region (primary)
  { code: "AT", name: "Austria" },
  { code: "DE", name: "Germany" },
  { code: "CH", name: "Switzerland" },

  // Other EU countries
  { code: "BE", name: "Belgium" },
  { code: "BG", name: "Bulgaria" },
  { code: "HR", name: "Croatia" },
  { code: "CY", name: "Cyprus" },
  { code: "CZ", name: "Czech Republic" },
  { code: "DK", name: "Denmark" },
  { code: "EE", name: "Estonia" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "GR", name: "Greece" },
  { code: "HU", name: "Hungary" },
  { code: "IE", name: "Ireland" },
  { code: "IT", name: "Italy" },
  { code: "LV", name: "Latvia" },
  { code: "LT", name: "Lithuania" },
  { code: "LU", name: "Luxembourg" },
  { code: "MT", name: "Malta" },
  { code: "NL", name: "Netherlands" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "RO", name: "Romania" },
  { code: "SK", name: "Slovakia" },
  { code: "SI", name: "Slovenia" },
  { code: "ES", name: "Spain" },
  { code: "SE", name: "Sweden" },

  // Other European
  { code: "GB", name: "United Kingdom" },
  { code: "NO", name: "Norway" },
  { code: "LI", name: "Liechtenstein" },

  // Major international
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "JP", name: "Japan" },
  { code: "CN", name: "China" },
  { code: "IN", name: "India" },
  { code: "SG", name: "Singapore" },
  { code: "AE", name: "United Arab Emirates" },
] as const;

export type CountryCode = typeof COUNTRIES[number]["code"];

/**
 * Get country name by code
 */
export function getCountryName(code: string): string | undefined {
  return COUNTRIES.find((c) => c.code === code)?.name;
}

/**
 * Get country by code
 */
export function getCountry(code: string) {
  return COUNTRIES.find((c) => c.code === code);
}

/**
 * Format country for display: "Austria (AT)"
 */
export function formatCountry(code: string): string {
  const country = getCountry(code);
  return country ? `${country.name} (${country.code})` : code;
}
