/**
 * Banking Provider Abstraction Layer
 *
 * Provides a unified interface for multiple Open Banking providers:
 * - GoCardless (formerly Nordigen)
 * - TrueLayer
 * - Plaid (future)
 *
 * Usage:
 * ```typescript
 * import { getBankingProvider, getEnabledBankingProviders } from '@/lib/banking';
 *
 * // Get a specific provider
 * const provider = getBankingProvider('truelayer');
 *
 * // List institutions for a country
 * const banks = await provider.listInstitutions('GB');
 *
 * // Create a connection
 * const { authUrl } = await provider.createConnection({
 *   institutionId: 'ob-barclays',
 *   redirectUrl: 'https://app.example.com/callback',
 * });
 * ```
 */

// Export types
export * from "./types";

// Export provider interface
export * from "./provider";

// Export registry
export {
  bankingRegistry,
  getBankingProvider,
  getEnabledBankingProviders,
  getBankingProviderInfo,
} from "./registry";

// Import providers for registration
import { bankingRegistry } from "./registry";
import { getGoCardlessProvider } from "./providers/gocardless";
import { getTrueLayerProvider } from "./providers/truelayer";

/**
 * Initialize and register all banking providers
 *
 * This should be called once at app startup
 */
export function initializeBankingProviders(): void {
  // Register GoCardless
  try {
    const goCardless = getGoCardlessProvider();
    bankingRegistry.register(goCardless);
  } catch (error) {
    console.warn("[Banking] Failed to initialize GoCardless provider:", error);
  }

  // Register TrueLayer
  try {
    const trueLayer = getTrueLayerProvider();
    bankingRegistry.register(trueLayer);
  } catch (error) {
    console.warn("[Banking] Failed to initialize TrueLayer provider:", error);
  }

  // Log registered providers
  const providers = bankingRegistry.listIds();
  console.log(`[Banking] Registered providers: ${providers.join(", ") || "none"}`);

  const enabled = bankingRegistry.getEnabledProviders();
  console.log(`[Banking] Enabled providers: ${enabled.map((p) => p.id).join(", ") || "none"}`);
}

/**
 * Get provider-agnostic institution list for a country
 * Combines results from all enabled providers
 */
export async function listAllInstitutions(countryCode: string) {
  return bankingRegistry.listAllInstitutions(countryCode);
}

// Auto-initialize if running on server
if (typeof window === "undefined") {
  initializeBankingProviders();
}
