/**
 * Banking Provider Registry
 *
 * Manages registration and lookup of banking providers.
 * Provides factory methods for creating provider instances.
 */

import { BankingProviderId, BankingProviderInfo, BankingInstitution } from "./types";
import { BankingProvider } from "./provider";

/**
 * Registry of all available banking providers
 */
class BankingProviderRegistry {
  private providers: Map<BankingProviderId, BankingProvider> = new Map();

  /**
   * Register a banking provider
   */
  register(provider: BankingProvider): void {
    this.providers.set(provider.id, provider);
  }

  /**
   * Get a provider by ID
   */
  get(providerId: BankingProviderId): BankingProvider | undefined {
    return this.providers.get(providerId);
  }

  /**
   * Get a provider by ID, throwing if not found
   */
  getOrThrow(providerId: BankingProviderId): BankingProvider {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Banking provider '${providerId}' not found. Available: ${this.listIds().join(", ")}`);
    }
    return provider;
  }

  /**
   * Check if a provider is registered
   */
  has(providerId: BankingProviderId): boolean {
    return this.providers.has(providerId);
  }

  /**
   * List all registered provider IDs
   */
  listIds(): BankingProviderId[] {
    return Array.from(this.providers.keys());
  }

  /**
   * List all registered providers
   */
  listProviders(): BankingProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get info for all registered providers
   */
  listProviderInfo(): BankingProviderInfo[] {
    return this.listProviders().map((p) => p.getInfo());
  }

  /**
   * Get all enabled providers
   */
  getEnabledProviders(): BankingProvider[] {
    return this.listProviders().filter((p) => p.isConfigured());
  }

  /**
   * Get providers available for a specific country
   */
  getProvidersForCountry(countryCode: string): BankingProvider[] {
    return this.listProviders().filter((p) => {
      const info = p.getInfo();
      return info.isEnabled && info.supportedCountries.includes(countryCode.toUpperCase());
    });
  }

  /**
   * List institutions across all enabled providers for a country
   */
  async listAllInstitutions(countryCode: string): Promise<BankingInstitution[]> {
    const providers = this.getProvidersForCountry(countryCode);
    const results = await Promise.allSettled(
      providers.map((p) => p.listInstitutions(countryCode))
    );

    const institutions: BankingInstitution[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        institutions.push(...result.value);
      }
    }

    // Sort by name
    return institutions.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Clear all registered providers (for testing)
   */
  clear(): void {
    this.providers.clear();
  }
}

/**
 * Singleton registry instance
 */
export const bankingRegistry = new BankingProviderRegistry();

/**
 * Helper function to get a provider
 */
export function getBankingProvider(providerId: BankingProviderId): BankingProvider {
  return bankingRegistry.getOrThrow(providerId);
}

/**
 * Helper function to list enabled providers
 */
export function getEnabledBankingProviders(): BankingProvider[] {
  return bankingRegistry.getEnabledProviders();
}

/**
 * Helper function to get provider info
 */
export function getBankingProviderInfo(): BankingProviderInfo[] {
  return bankingRegistry.listProviderInfo();
}
