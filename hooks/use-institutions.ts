"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * Generic institution type (works with TrueLayer, GoCardless, etc.)
 */
export interface Institution {
  id: string;
  name: string;
  logo: string;
  countries: string[];
  bic?: string;
  transaction_total_days?: string;
}

interface UseInstitutionsOptions {
  countryCode: string | null;
}

interface UseInstitutionsReturn {
  institutions: Institution[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch and manage available financial institutions for a country
 * Uses TrueLayer as the provider
 */
export function useInstitutions({ countryCode }: UseInstitutionsOptions): UseInstitutionsReturn {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInstitutions = useCallback(async () => {
    if (!countryCode) {
      setInstitutions([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Use TrueLayer API
      const response = await fetch(`/api/truelayer/providers?country=${countryCode}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch institutions");
      }

      setInstitutions(data.institutions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch institutions");
      setInstitutions([]);
    } finally {
      setLoading(false);
    }
  }, [countryCode]);

  useEffect(() => {
    fetchInstitutions();
  }, [fetchInstitutions]);

  return {
    institutions,
    loading,
    error,
    refetch: fetchInstitutions,
  };
}

/**
 * Filter institutions by search query
 */
export function filterInstitutions(
  institutions: Institution[],
  searchQuery: string
): Institution[] {
  if (!searchQuery.trim()) {
    return institutions;
  }

  const query = searchQuery.toLowerCase();
  return institutions.filter(
    (inst) =>
      inst.name.toLowerCase().includes(query) ||
      inst.bic?.toLowerCase().includes(query)
  );
}
