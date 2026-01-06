/**
 * Transform GoCardless transactions to our Transaction format
 */

import { Timestamp } from "firebase/firestore";
import { Transaction } from "@/types/transaction";
import { GoCardlessTransaction } from "@/types/gocardless";
import { generateDedupeHash, normalizeIban } from "@/lib/import/deduplication";

/**
 * Transform a single GoCardless transaction to our Transaction format
 */
export async function transformTransaction(
  gcTx: GoCardlessTransaction,
  sourceId: string,
  sourceIban: string,
  userId: string,
  importJobId: string | null = null
): Promise<Omit<Transaction, "id">> {
  // Parse date - prefer bookingDate, fall back to valueDate
  const dateStr = gcTx.bookingDate || gcTx.valueDate || new Date().toISOString().split("T")[0];
  const date = new Date(dateStr);

  // Parse amount - stored as string in GoCardless, we need cents as integer
  const amountFloat = parseFloat(gcTx.transactionAmount.amount);
  const amountCents = Math.round(amountFloat * 100);

  // Get currency
  const currency = gcTx.transactionAmount.currency || "EUR";

  // Build transaction name from remittance information
  const name = buildTransactionName(gcTx);

  // Extract partner (counterparty) - could be creditor or debtor
  const partner = gcTx.creditorName || gcTx.debtorName || null;

  // Extract partner IBAN
  const partnerIban = extractPartnerIban(gcTx);

  // Get reference for deduplication
  const reference = gcTx.transactionId ||
                    gcTx.internalTransactionId ||
                    gcTx.entryReference ||
                    null;

  // Generate deduplication hash
  const dedupeHash = await generateDedupeHash(
    date,
    amountCents,
    sourceIban,
    reference
  );

  // Build original data for backup
  const _original = {
    date: dateStr,
    amount: gcTx.transactionAmount.amount,
    rawRow: buildRawRow(gcTx),
  };

  const now = Timestamp.now();

  return {
    sourceId,
    date: Timestamp.fromDate(date),
    amount: amountCents,
    currency,
    name,
    description: null,
    partner,
    reference,
    partnerIban,
    dedupeHash,
    _original,
    isComplete: false,
    importJobId,
    userId,
    partnerId: null,
    partnerType: null,
    partnerMatchConfidence: null,
    partnerMatchedBy: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Transform multiple GoCardless transactions
 */
export async function transformTransactions(
  gcTransactions: GoCardlessTransaction[],
  sourceId: string,
  sourceIban: string,
  userId: string,
  importJobId: string | null = null
): Promise<Omit<Transaction, "id">[]> {
  const results: Omit<Transaction, "id">[] = [];

  for (const gcTx of gcTransactions) {
    const transaction = await transformTransaction(
      gcTx,
      sourceId,
      sourceIban,
      userId,
      importJobId
    );
    results.push(transaction);
  }

  return results;
}

/**
 * Build transaction name from remittance information
 */
function buildTransactionName(gcTx: GoCardlessTransaction): string {
  // Try structured remittance info first
  if (gcTx.remittanceInformationStructured) {
    return gcTx.remittanceInformationStructured.trim();
  }

  // Try unstructured array (join with space)
  if (gcTx.remittanceInformationUnstructuredArray?.length) {
    return gcTx.remittanceInformationUnstructuredArray.join(" ").trim();
  }

  // Try single unstructured
  if (gcTx.remittanceInformationUnstructured) {
    return gcTx.remittanceInformationUnstructured.trim();
  }

  // Fall back to additional info or partner name
  if (gcTx.additionalInformation) {
    return gcTx.additionalInformation.trim();
  }

  // Last resort: use counterparty name
  return gcTx.creditorName || gcTx.debtorName || "Unknown transaction";
}

/**
 * Extract partner IBAN from transaction
 */
function extractPartnerIban(gcTx: GoCardlessTransaction): string | null {
  // Check creditor account first
  if (gcTx.creditorAccount?.iban) {
    return normalizeIban(gcTx.creditorAccount.iban);
  }

  // Check debtor account
  if (gcTx.debtorAccount?.iban) {
    return normalizeIban(gcTx.debtorAccount.iban);
  }

  return null;
}

/**
 * Build raw row data for backup/debugging
 */
function buildRawRow(gcTx: GoCardlessTransaction): Record<string, string> {
  const row: Record<string, string> = {};

  if (gcTx.transactionId) row.transactionId = gcTx.transactionId;
  if (gcTx.internalTransactionId) row.internalTransactionId = gcTx.internalTransactionId;
  if (gcTx.entryReference) row.entryReference = gcTx.entryReference;
  if (gcTx.bookingDate) row.bookingDate = gcTx.bookingDate;
  if (gcTx.valueDate) row.valueDate = gcTx.valueDate;
  if (gcTx.creditorName) row.creditorName = gcTx.creditorName;
  if (gcTx.debtorName) row.debtorName = gcTx.debtorName;
  if (gcTx.creditorAccount?.iban) row.creditorIban = gcTx.creditorAccount.iban;
  if (gcTx.debtorAccount?.iban) row.debtorIban = gcTx.debtorAccount.iban;
  if (gcTx.remittanceInformationUnstructured) {
    row.remittanceInfo = gcTx.remittanceInformationUnstructured;
  }
  if (gcTx.bankTransactionCode) row.bankTransactionCode = gcTx.bankTransactionCode;
  if (gcTx.additionalInformation) row.additionalInformation = gcTx.additionalInformation;

  row.amount = gcTx.transactionAmount.amount;
  row.currency = gcTx.transactionAmount.currency;

  return row;
}

/**
 * Filter out pending transactions (only return booked)
 */
export function filterBookedTransactions(
  response: { transactions: { booked: GoCardlessTransaction[]; pending?: GoCardlessTransaction[] } }
): GoCardlessTransaction[] {
  return response.transactions.booked || [];
}

/**
 * Calculate date range for transaction fetch
 * Default: last 90 days to now
 */
export function getDefaultDateRange(
  lastSyncAt?: Date
): { dateFrom: string; dateTo: string } {
  const dateTo = new Date();

  // If we have a last sync, start from there (with 2 day overlap for safety)
  // Otherwise, go back 90 days
  const dateFrom = lastSyncAt
    ? new Date(lastSyncAt.getTime() - 2 * 24 * 60 * 60 * 1000)
    : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  return {
    dateFrom: dateFrom.toISOString().split("T")[0],
    dateTo: dateTo.toISOString().split("T")[0],
  };
}
