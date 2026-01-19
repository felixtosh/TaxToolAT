import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  Timestamp,
  collectionGroup,
} from "firebase/firestore";
import {
  UserPartner,
  InvoiceSource,
  InvoiceSourceType,
  InvoiceSourceStatus,
  FrequencySource,
} from "@/types/partner";
import { TaxFile } from "@/types/file";
import { OperationsContext } from "./types";

const PARTNERS_COLLECTION = "partners";
const FILES_COLLECTION = "files";

/**
 * Generate a unique ID for an invoice source
 */
function generateSourceId(): string {
  return `src_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Extract domain from a URL
 */
function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Calculate the next expected fetch date based on last fetch and frequency
 */
function calculateNextExpected(
  lastFetchedAt: Timestamp | undefined,
  frequencyDays: number | undefined
): Timestamp | undefined {
  if (!lastFetchedAt || !frequencyDays) return undefined;

  const lastDate = lastFetchedAt.toDate();
  const nextDate = new Date(lastDate);
  nextDate.setDate(nextDate.getDate() + frequencyDays);

  return Timestamp.fromDate(nextDate);
}

// ============ Invoice Source CRUD ============

/**
 * Get all invoice sources for a partner
 */
export async function listInvoiceSources(
  ctx: OperationsContext,
  partnerId: string
): Promise<InvoiceSource[]> {
  const partnerRef = doc(ctx.db, PARTNERS_COLLECTION, partnerId);
  const partnerSnap = await getDoc(partnerRef);

  if (!partnerSnap.exists()) {
    throw new Error(`Partner not found: ${partnerId}`);
  }

  const partner = partnerSnap.data() as UserPartner;

  // Verify ownership
  if (partner.userId !== ctx.userId) {
    throw new Error("Access denied: Partner belongs to another user");
  }

  return partner.invoiceSources || [];
}

/**
 * Data required to add a new invoice source
 */
export interface AddInvoiceSourceData {
  url: string;
  label?: string;
  sourceType?: InvoiceSourceType;
  fromInvoiceLinkMessageId?: string;
}

/**
 * Remove undefined values from an object (Firestore doesn't accept undefined)
 */
function removeUndefined<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") return obj;
  const result = {} as T;
  for (const key of Object.keys(obj) as (keyof T)[]) {
    const value = obj[key];
    if (value !== undefined) {
      (result as Record<string, unknown>)[key as string] = value;
    }
  }
  return result;
}

/**
 * Add a new invoice source to a partner
 */
export async function addInvoiceSource(
  ctx: OperationsContext,
  partnerId: string,
  data: AddInvoiceSourceData
): Promise<string> {
  const partnerRef = doc(ctx.db, PARTNERS_COLLECTION, partnerId);
  const partnerSnap = await getDoc(partnerRef);

  if (!partnerSnap.exists()) {
    throw new Error(`Partner not found: ${partnerId}`);
  }

  const partner = partnerSnap.data() as UserPartner;

  // Verify ownership
  if (partner.userId !== ctx.userId) {
    throw new Error("Access denied: Partner belongs to another user");
  }

  const now = Timestamp.now();
  const sourceId = generateSourceId();
  const domain = extractDomain(data.url);

  // Build source object, filtering out undefined values
  const newSource = removeUndefined<InvoiceSource>({
    id: sourceId,
    url: data.url,
    domain,
    label: data.label,
    discoveredAt: now,
    sourceType: data.sourceType || "manual",
    fromInvoiceLinkMessageId: data.fromInvoiceLinkMessageId,
    successfulFetches: 0,
    failedFetches: 0,
    status: "active",
    statusChangedAt: now,
  });

  const existingSources = partner.invoiceSources || [];

  // Check for duplicate URL
  const isDuplicate = existingSources.some(
    (s) => s.url === data.url || s.domain === domain
  );
  if (isDuplicate) {
    throw new Error(`Invoice source already exists for this URL or domain`);
  }

  await updateDoc(partnerRef, {
    invoiceSources: [...existingSources, newSource],
    invoiceSourcesUpdatedAt: now,
    updatedAt: now,
  });

  return sourceId;
}

/**
 * Data for updating an invoice source
 */
export interface UpdateInvoiceSourceData {
  label?: string;
  url?: string;
  status?: InvoiceSourceStatus;
  inferredFrequencyDays?: number;
  frequencySource?: FrequencySource;
  frequencyDataPoints?: number;
  lastFetchedAt?: Timestamp;
  nextExpectedAt?: Timestamp;
  lastError?: string;
}

/**
 * Update an invoice source on a partner
 */
export async function updateInvoiceSource(
  ctx: OperationsContext,
  partnerId: string,
  sourceId: string,
  data: UpdateInvoiceSourceData
): Promise<void> {
  const partnerRef = doc(ctx.db, PARTNERS_COLLECTION, partnerId);
  const partnerSnap = await getDoc(partnerRef);

  if (!partnerSnap.exists()) {
    throw new Error(`Partner not found: ${partnerId}`);
  }

  const partner = partnerSnap.data() as UserPartner;

  // Verify ownership
  if (partner.userId !== ctx.userId) {
    throw new Error("Access denied: Partner belongs to another user");
  }

  const existingSources = partner.invoiceSources || [];
  const sourceIndex = existingSources.findIndex((s) => s.id === sourceId);

  if (sourceIndex === -1) {
    throw new Error(`Invoice source not found: ${sourceId}`);
  }

  const now = Timestamp.now();
  const updatedSource = { ...existingSources[sourceIndex] };

  // Apply updates
  if (data.label !== undefined) updatedSource.label = data.label;
  if (data.url !== undefined) {
    updatedSource.url = data.url;
    updatedSource.domain = extractDomain(data.url);
  }
  if (data.status !== undefined) {
    updatedSource.status = data.status;
    updatedSource.statusChangedAt = now;
  }
  if (data.inferredFrequencyDays !== undefined) {
    updatedSource.inferredFrequencyDays = data.inferredFrequencyDays;
  }
  if (data.frequencySource !== undefined) {
    updatedSource.frequencySource = data.frequencySource;
  }
  if (data.frequencyDataPoints !== undefined) {
    updatedSource.frequencyDataPoints = data.frequencyDataPoints;
  }
  if (data.lastFetchedAt !== undefined) {
    updatedSource.lastFetchedAt = data.lastFetchedAt;
  }
  if (data.nextExpectedAt !== undefined) {
    updatedSource.nextExpectedAt = data.nextExpectedAt;
  }
  if (data.lastError !== undefined) {
    updatedSource.lastError = data.lastError;
  }

  const updatedSources = [...existingSources];
  updatedSources[sourceIndex] = removeUndefined(updatedSource);

  await updateDoc(partnerRef, {
    invoiceSources: updatedSources,
    invoiceSourcesUpdatedAt: now,
    updatedAt: now,
  });
}

/**
 * Remove an invoice source from a partner
 */
export async function removeInvoiceSource(
  ctx: OperationsContext,
  partnerId: string,
  sourceId: string
): Promise<void> {
  const partnerRef = doc(ctx.db, PARTNERS_COLLECTION, partnerId);
  const partnerSnap = await getDoc(partnerRef);

  if (!partnerSnap.exists()) {
    throw new Error(`Partner not found: ${partnerId}`);
  }

  const partner = partnerSnap.data() as UserPartner;

  // Verify ownership
  if (partner.userId !== ctx.userId) {
    throw new Error("Access denied: Partner belongs to another user");
  }

  const existingSources = partner.invoiceSources || [];
  const filteredSources = existingSources.filter((s) => s.id !== sourceId);

  if (filteredSources.length === existingSources.length) {
    throw new Error(`Invoice source not found: ${sourceId}`);
  }

  const now = Timestamp.now();

  await updateDoc(partnerRef, {
    invoiceSources: filteredSources,
    invoiceSourcesUpdatedAt: now,
    updatedAt: now,
  });
}

// ============ Invoice Link Promotion ============

/**
 * Convert a discovered invoice link to an invoice source
 */
export async function promoteInvoiceLinkToSource(
  ctx: OperationsContext,
  partnerId: string,
  invoiceLinkIndex: number
): Promise<string> {
  const partnerRef = doc(ctx.db, PARTNERS_COLLECTION, partnerId);
  const partnerSnap = await getDoc(partnerRef);

  if (!partnerSnap.exists()) {
    throw new Error(`Partner not found: ${partnerId}`);
  }

  const partner = partnerSnap.data() as UserPartner;

  // Verify ownership
  if (partner.userId !== ctx.userId) {
    throw new Error("Access denied: Partner belongs to another user");
  }

  const invoiceLinks = partner.invoiceLinks || [];
  if (invoiceLinkIndex < 0 || invoiceLinkIndex >= invoiceLinks.length) {
    throw new Error(`Invoice link not found at index: ${invoiceLinkIndex}`);
  }

  const invoiceLink = invoiceLinks[invoiceLinkIndex];

  // Add as a new source
  const sourceId = await addInvoiceSource(ctx, partnerId, {
    url: invoiceLink.url,
    label: invoiceLink.anchorText || undefined,
    sourceType: "email_link",
    fromInvoiceLinkMessageId: invoiceLink.emailMessageId,
  });

  return sourceId;
}

// ============ Frequency Inference ============

/**
 * Standard frequency periods in days
 */
const FREQUENCY_PERIODS = [
  { days: 7, label: "weekly" },
  { days: 14, label: "bi-weekly" },
  { days: 30, label: "monthly" },
  { days: 90, label: "quarterly" },
  { days: 180, label: "semi-annually" },
  { days: 365, label: "yearly" },
];

/**
 * Round a number of days to the nearest standard frequency period
 */
function roundToStandardFrequency(days: number): number {
  let closest = FREQUENCY_PERIODS[0];
  let minDiff = Math.abs(days - closest.days);

  for (const period of FREQUENCY_PERIODS) {
    const diff = Math.abs(days - period.days);
    if (diff < minDiff) {
      minDiff = diff;
      closest = period;
    }
  }

  return closest.days;
}

/**
 * Get human-readable label for a frequency in days
 */
export function getFrequencyLabel(days: number): string {
  const period = FREQUENCY_PERIODS.find((p) => p.days === days);
  return period?.label || `every ${days} days`;
}

/**
 * Infer invoice frequency from historical files connected to this partner
 * from the same domain as the invoice source.
 *
 * Algorithm:
 * 1. Get files for this partner from the same domain
 * 2. Sort by extracted date (or createdAt fallback)
 * 3. Calculate intervals between consecutive invoices
 * 4. Find median interval and round to standard period
 * 5. Require at least 3 invoices (2 intervals) for confidence
 */
export async function inferInvoiceFrequency(
  ctx: OperationsContext,
  partnerId: string,
  sourceId: string
): Promise<{ frequencyDays: number; dataPoints: number } | null> {
  // Get the partner and source
  const partnerRef = doc(ctx.db, PARTNERS_COLLECTION, partnerId);
  const partnerSnap = await getDoc(partnerRef);

  if (!partnerSnap.exists()) {
    throw new Error(`Partner not found: ${partnerId}`);
  }

  const partner = partnerSnap.data() as UserPartner;

  // Verify ownership
  if (partner.userId !== ctx.userId) {
    throw new Error("Access denied: Partner belongs to another user");
  }

  const sources = partner.invoiceSources || [];
  const source = sources.find((s) => s.id === sourceId);

  if (!source) {
    throw new Error(`Invoice source not found: ${sourceId}`);
  }

  // Get files for this partner
  const filesQuery = query(
    collection(ctx.db, FILES_COLLECTION),
    where("userId", "==", ctx.userId),
    where("partnerId", "==", partnerId)
  );

  const filesSnap = await getDocs(filesQuery);
  const files = filesSnap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as TaxFile[];

  // Filter to files from the same domain (browser source)
  const domainFiles = files.filter((f) => {
    if (f.sourceType !== "browser") return false;
    if (!f.sourceDomain) return false;
    return (
      f.sourceDomain === source.domain ||
      f.sourceDomain.endsWith(`.${source.domain}`) ||
      source.domain.endsWith(`.${f.sourceDomain}`)
    );
  });

  // Need at least 3 files for meaningful inference
  if (domainFiles.length < 3) {
    return null;
  }

  // Extract dates and sort
  const dates = domainFiles
    .map((f) => {
      // Prefer extracted date, fall back to created date
      if (f.extractedDate) {
        // extractedDate is a Timestamp
        return f.extractedDate.toDate();
      }
      if (f.createdAt) {
        return f.createdAt.toDate();
      }
      return null;
    })
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());

  // Need at least 3 dates
  if (dates.length < 3) {
    return null;
  }

  // Calculate intervals between consecutive dates
  const intervals: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    const diffMs = dates[i].getTime() - dates[i - 1].getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    // Only include reasonable intervals (1 day to 2 years)
    if (diffDays >= 1 && diffDays <= 730) {
      intervals.push(diffDays);
    }
  }

  // Need at least 2 valid intervals
  if (intervals.length < 2) {
    return null;
  }

  // Find median interval
  intervals.sort((a, b) => a - b);
  const midIndex = Math.floor(intervals.length / 2);
  const medianDays =
    intervals.length % 2 === 0
      ? (intervals[midIndex - 1] + intervals[midIndex]) / 2
      : intervals[midIndex];

  // Round to standard frequency
  const frequencyDays = roundToStandardFrequency(medianDays);

  return {
    frequencyDays,
    dataPoints: dates.length,
  };
}

/**
 * Infer and update the frequency for an invoice source
 */
export async function inferAndUpdateInvoiceFrequency(
  ctx: OperationsContext,
  partnerId: string,
  sourceId: string
): Promise<{ frequencyDays: number; dataPoints: number } | null> {
  const result = await inferInvoiceFrequency(ctx, partnerId, sourceId);

  if (result) {
    await updateInvoiceSource(ctx, partnerId, sourceId, {
      inferredFrequencyDays: result.frequencyDays,
      frequencySource: "inferred",
      frequencyDataPoints: result.dataPoints,
    });
  }

  return result;
}

// ============ Fetch Tracking ============

/**
 * Mark an invoice source as successfully fetched
 */
export async function markSourceFetchSuccess(
  ctx: OperationsContext,
  partnerId: string,
  sourceId: string
): Promise<void> {
  const partnerRef = doc(ctx.db, PARTNERS_COLLECTION, partnerId);
  const partnerSnap = await getDoc(partnerRef);

  if (!partnerSnap.exists()) {
    throw new Error(`Partner not found: ${partnerId}`);
  }

  const partner = partnerSnap.data() as UserPartner;

  // Verify ownership
  if (partner.userId !== ctx.userId) {
    throw new Error("Access denied: Partner belongs to another user");
  }

  const existingSources = partner.invoiceSources || [];
  const sourceIndex = existingSources.findIndex((s) => s.id === sourceId);

  if (sourceIndex === -1) {
    throw new Error(`Invoice source not found: ${sourceId}`);
  }

  const now = Timestamp.now();
  const updatedSource = { ...existingSources[sourceIndex] };

  updatedSource.lastFetchedAt = now;
  updatedSource.successfulFetches = (updatedSource.successfulFetches || 0) + 1;
  updatedSource.status = "active";
  updatedSource.statusChangedAt = now;
  // Clear lastError by deleting the property (Firestore doesn't accept undefined)
  delete updatedSource.lastError;

  // Calculate next expected fetch
  if (updatedSource.inferredFrequencyDays) {
    updatedSource.nextExpectedAt = calculateNextExpected(
      now,
      updatedSource.inferredFrequencyDays
    );
  }

  const updatedSources = [...existingSources];
  updatedSources[sourceIndex] = removeUndefined(updatedSource);

  await updateDoc(partnerRef, {
    invoiceSources: updatedSources,
    invoiceSourcesUpdatedAt: now,
    updatedAt: now,
  });
}

/**
 * Mark an invoice source fetch as failed
 */
export async function markSourceFetchFailure(
  ctx: OperationsContext,
  partnerId: string,
  sourceId: string,
  error: string,
  needsLogin: boolean = false
): Promise<void> {
  const partnerRef = doc(ctx.db, PARTNERS_COLLECTION, partnerId);
  const partnerSnap = await getDoc(partnerRef);

  if (!partnerSnap.exists()) {
    throw new Error(`Partner not found: ${partnerId}`);
  }

  const partner = partnerSnap.data() as UserPartner;

  // Verify ownership
  if (partner.userId !== ctx.userId) {
    throw new Error("Access denied: Partner belongs to another user");
  }

  const existingSources = partner.invoiceSources || [];
  const sourceIndex = existingSources.findIndex((s) => s.id === sourceId);

  if (sourceIndex === -1) {
    throw new Error(`Invoice source not found: ${sourceId}`);
  }

  const now = Timestamp.now();
  const updatedSource = { ...existingSources[sourceIndex] };

  updatedSource.failedFetches = (updatedSource.failedFetches || 0) + 1;
  updatedSource.status = needsLogin ? "needs_login" : "error";
  updatedSource.statusChangedAt = now;
  updatedSource.lastError = error;

  const updatedSources = [...existingSources];
  updatedSources[sourceIndex] = removeUndefined(updatedSource);

  await updateDoc(partnerRef, {
    invoiceSources: updatedSources,
    invoiceSourcesUpdatedAt: now,
    updatedAt: now,
  });
}

// ============ Scheduled Fetch Queries ============

/**
 * Get all invoice sources that are due for fetching.
 * Returns sources where:
 * - status is "active"
 * - nextExpectedAt is set and <= now
 *
 * Note: This queries ALL partners for the user, so use sparingly (e.g., daily scheduled function)
 */
export async function getSourcesDueForFetch(
  ctx: OperationsContext
): Promise<Array<{ partnerId: string; partnerName: string; source: InvoiceSource }>> {
  const partnersQuery = query(
    collection(ctx.db, PARTNERS_COLLECTION),
    where("userId", "==", ctx.userId),
    where("isActive", "==", true)
  );

  const partnersSnap = await getDocs(partnersQuery);
  const now = Timestamp.now();
  const results: Array<{
    partnerId: string;
    partnerName: string;
    source: InvoiceSource;
  }> = [];

  for (const partnerDoc of partnersSnap.docs) {
    const partner = partnerDoc.data() as UserPartner;
    const sources = partner.invoiceSources || [];

    for (const source of sources) {
      if (
        source.status === "active" &&
        source.nextExpectedAt &&
        source.nextExpectedAt.toMillis() <= now.toMillis()
      ) {
        results.push({
          partnerId: partnerDoc.id,
          partnerName: partner.name,
          source,
        });
      }
    }
  }

  return results;
}

/**
 * Get partners with invoice sources (for display purposes)
 */
export async function getPartnersWithInvoiceSources(
  ctx: OperationsContext
): Promise<Array<{ partner: UserPartner; sourceCount: number }>> {
  const partnersQuery = query(
    collection(ctx.db, PARTNERS_COLLECTION),
    where("userId", "==", ctx.userId),
    where("isActive", "==", true)
  );

  const partnersSnap = await getDocs(partnersQuery);
  const results: Array<{ partner: UserPartner; sourceCount: number }> = [];

  for (const partnerDoc of partnersSnap.docs) {
    const partner = {
      id: partnerDoc.id,
      ...partnerDoc.data(),
    } as UserPartner;

    const sourceCount = partner.invoiceSources?.length || 0;
    if (sourceCount > 0) {
      results.push({ partner, sourceCount });
    }
  }

  return results.sort((a, b) => b.sourceCount - a.sourceCount);
}
