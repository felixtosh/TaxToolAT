import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/config";

/**
 * Generate a deduplication hash for a transaction.
 * Uses date (as ISO string) + amount (as string) + source identifier + reference.
 * For sources with IBAN, uses normalized IBAN. For sources without (e.g. credit cards),
 * uses sourceId as fallback.
 */
export async function generateDedupeHash(
  date: Date,
  amount: number,
  sourceIdentifier: string,
  reference: string | null
): Promise<string> {
  // Normalize inputs
  const dateStr = date.toISOString().split("T")[0]; // YYYY-MM-DD
  const amountStr = amount.toString();
  // sourceIdentifier can be IBAN (normalized) or sourceId
  const identifierNormalized = sourceIdentifier.replace(/\s+/g, "").toUpperCase();
  const refNormalized = (reference || "").trim().toUpperCase();

  // Create string to hash
  const input = `${dateStr}|${amountStr}|${identifierNormalized}|${refNormalized}`;

  // Generate SHA-256 hash
  const hash = await sha256(input);

  return hash;
}

/**
 * Normalize IBAN by removing spaces and converting to uppercase
 */
export function normalizeIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}

/**
 * Validate IBAN format (basic check)
 */
export function isValidIban(iban: string): boolean {
  const normalized = normalizeIban(iban);

  // Basic format check: 2 letters + 2 digits + alphanumeric (15-30 chars total)
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,28}$/.test(normalized)) {
    return false;
  }

  // Check length by country (simplified - main European countries)
  const countryLengths: Record<string, number> = {
    AT: 20, // Austria
    DE: 22, // Germany
    CH: 21, // Switzerland
    FR: 27, // France
    IT: 27, // Italy
    ES: 24, // Spain
    NL: 18, // Netherlands
    BE: 16, // Belgium
    GB: 22, // UK
  };

  const country = normalized.slice(0, 2);
  const expectedLength = countryLengths[country];

  if (expectedLength && normalized.length !== expectedLength) {
    return false;
  }

  return true;
}

/**
 * Format IBAN for display (with spaces every 4 characters)
 * Returns "—" if IBAN is not provided
 */
export function formatIban(iban: string | undefined | null): string {
  if (!iban) return "—";
  const normalized = normalizeIban(iban);
  return normalized.replace(/(.{4})/g, "$1 ").trim();
}

/**
 * Generate SHA-256 hash
 */
async function sha256(message: string): Promise<string> {
  // Use Web Crypto API
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}

/**
 * Check if a transaction with the given hash already exists
 */
export async function checkDuplicateExists(
  hash: string,
  sourceId: string
): Promise<boolean> {
  const q = query(
    collection(db, "transactions"),
    where("dedupeHash", "==", hash),
    where("sourceId", "==", sourceId)
  );

  const snapshot = await getDocs(q);
  return !snapshot.empty;
}

/**
 * Batch check for duplicates - returns set of hashes that already exist
 */
export async function checkDuplicatesBatch(
  hashes: string[],
  sourceId: string
): Promise<Set<string>> {
  const existingHashes = new Set<string>();

  // Firestore 'in' queries are limited to 30 items
  const BATCH_SIZE = 30;

  for (let i = 0; i < hashes.length; i += BATCH_SIZE) {
    const batch = hashes.slice(i, i + BATCH_SIZE);

    const q = query(
      collection(db, "transactions"),
      where("sourceId", "==", sourceId),
      where("dedupeHash", "in", batch)
    );

    const snapshot = await getDocs(q);
    snapshot.docs.forEach((doc) => {
      const hash = doc.data().dedupeHash;
      if (hash) existingHashes.add(hash);
    });
  }

  return existingHashes;
}

/**
 * Result of duplicate check for a single transaction
 */
export interface DuplicateCheckResult {
  hash: string;
  isDuplicate: boolean;
  existingTransactionId?: string;
}
