/**
 * GoCardless operations for bank account connections and transaction sync
 */

import {
  collection,
  query,
  orderBy,
  where,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  addDoc,
  deleteDoc,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import { TransactionSource, GoCardlessConnectorConfig } from "@/types/source";
import {
  GoCardlessRequisition,
  GoCardlessInstitution,
  RequisitionStatus,
  SyncJob,
} from "@/types/gocardless";
import { normalizeIban } from "@/lib/import/deduplication";
import { OperationsContext } from "./types";
import { getSourceById, updateSource } from "./source-ops";
import {
  getGoCardlessClient,
  getRedirectUrl,
  transformTransactions,
  filterBookedTransactions,
  getDefaultDateRange,
  ReauthRequiredError,
  GoCardlessClient,
} from "@/lib/gocardless";
import { checkDuplicatesBatch } from "@/lib/import/deduplication";

const REQUISITIONS_COLLECTION = "requisitions";
const TRANSACTIONS_COLLECTION = "transactions";
const SYNC_JOBS_COLLECTION = "syncJobs";

// =========================================
// INSTITUTIONS
// =========================================

/**
 * List available financial institutions for a country
 */
export async function listInstitutions(
  ctx: OperationsContext,
  countryCode: string
): Promise<GoCardlessInstitution[]> {
  const client = getGoCardlessClient();
  return client.listInstitutions(countryCode);
}

/**
 * Get a single institution by ID
 */
export async function getInstitution(
  ctx: OperationsContext,
  institutionId: string
): Promise<GoCardlessInstitution> {
  const client = getGoCardlessClient();
  return client.getInstitution(institutionId);
}

// =========================================
// REQUISITIONS
// =========================================

/**
 * Create a new requisition (bank connection request)
 * Returns the authorization URL for the user to visit
 *
 * @param sourceId - Optional existing source ID to link after auth (for re-auth/connect existing)
 */
export async function createRequisition(
  ctx: OperationsContext,
  institutionId: string,
  sourceId?: string
): Promise<{ requisitionId: string; link: string; expiresAt: Date }> {
  const client = getGoCardlessClient();

  // Get institution info for display
  const institution = await client.getInstitution(institutionId);

  // Create end user agreement (90 days, all scopes)
  const maxHistoricalDays = parseInt(institution.transaction_total_days, 10) || 90;
  const agreement = await client.createAgreement(institutionId, maxHistoricalDays, 90);

  // Generate internal reference
  const reference = `req_${ctx.userId}_${Date.now()}`;

  // Create requisition with redirect
  const redirectUrl = getRedirectUrl();
  const requisition = await client.createRequisition(
    institutionId,
    redirectUrl,
    agreement.id,
    reference
  );

  // Calculate expiration (90 days from now)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 90);

  // Store requisition in Firestore
  const requisitionDoc: Omit<GoCardlessRequisition, "id"> = {
    requisitionId: requisition.id,
    institutionId,
    institutionName: institution.name,
    institutionLogo: institution.logo,
    status: requisition.status,
    link: requisition.link,
    accountIds: [],
    agreementId: agreement.id,
    agreementExpiresAt: Timestamp.fromDate(expiresAt),
    reference,
    userId: ctx.userId,
    linkToSourceId: sourceId,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  const docRef = await addDoc(
    collection(ctx.db, REQUISITIONS_COLLECTION),
    requisitionDoc
  );

  return {
    requisitionId: docRef.id,
    link: requisition.link,
    expiresAt,
  };
}

/**
 * Get a requisition by our internal ID
 */
export async function getRequisition(
  ctx: OperationsContext,
  requisitionId: string
): Promise<GoCardlessRequisition | null> {
  const docRef = doc(ctx.db, REQUISITIONS_COLLECTION, requisitionId);
  const snapshot = await getDoc(docRef);

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data();
  if (data.userId !== ctx.userId) {
    return null;
  }

  return { id: snapshot.id, ...data } as GoCardlessRequisition;
}

/**
 * Get a requisition by GoCardless requisition ID
 */
export async function getRequisitionByGoCardlessId(
  ctx: OperationsContext,
  goCardlessRequisitionId: string
): Promise<GoCardlessRequisition | null> {
  const q = query(
    collection(ctx.db, REQUISITIONS_COLLECTION),
    where("userId", "==", ctx.userId),
    where("requisitionId", "==", goCardlessRequisitionId)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() } as GoCardlessRequisition;
}

/**
 * List all requisitions for the current user
 */
export async function listRequisitions(
  ctx: OperationsContext
): Promise<GoCardlessRequisition[]> {
  const q = query(
    collection(ctx.db, REQUISITIONS_COLLECTION),
    where("userId", "==", ctx.userId),
    orderBy("createdAt", "desc")
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as GoCardlessRequisition[];
}

/**
 * Update requisition status from GoCardless
 */
export async function refreshRequisitionStatus(
  ctx: OperationsContext,
  requisitionId: string
): Promise<GoCardlessRequisition> {
  const requisition = await getRequisition(ctx, requisitionId);
  if (!requisition) {
    throw new Error(`Requisition ${requisitionId} not found`);
  }

  const client = getGoCardlessClient();
  const gcRequisition = await client.getRequisition(requisition.requisitionId);

  // Update stored requisition
  const docRef = doc(ctx.db, REQUISITIONS_COLLECTION, requisitionId);
  await updateDoc(docRef, {
    status: gcRequisition.status,
    accountIds: gcRequisition.accounts || [],
    updatedAt: Timestamp.now(),
  });

  return {
    ...requisition,
    status: gcRequisition.status as RequisitionStatus,
    accountIds: gcRequisition.accounts || [],
  };
}

/**
 * Delete a requisition (also revokes access at GoCardless)
 */
export async function deleteRequisition(
  ctx: OperationsContext,
  requisitionId: string
): Promise<void> {
  const requisition = await getRequisition(ctx, requisitionId);
  if (!requisition) {
    throw new Error(`Requisition ${requisitionId} not found`);
  }

  // Try to revoke at GoCardless (may fail if already expired)
  try {
    const client = getGoCardlessClient();
    await client.deleteRequisition(requisition.requisitionId);
  } catch {
    // Ignore errors - requisition may already be expired
  }

  // Delete from Firestore
  const docRef = doc(ctx.db, REQUISITIONS_COLLECTION, requisitionId);
  await deleteDoc(docRef);
}

// =========================================
// ACCOUNT LINKING
// =========================================

/**
 * Get accounts available in a requisition
 */
export async function getRequisitionAccounts(
  ctx: OperationsContext,
  requisitionId: string
): Promise<
  Array<{
    accountId: string;
    iban: string;
    ownerName?: string;
    status: string;
  }>
> {
  const requisition = await getRequisition(ctx, requisitionId);
  if (!requisition) {
    throw new Error(`Requisition ${requisitionId} not found`);
  }

  if (!GoCardlessClient.isRequisitionLinked(requisition.status)) {
    throw new Error(`Requisition is not linked. Status: ${requisition.status}`);
  }

  const client = getGoCardlessClient();
  const accounts: Array<{
    accountId: string;
    iban: string;
    ownerName?: string;
    status: string;
  }> = [];

  for (const accountId of requisition.accountIds) {
    try {
      const account = await client.getAccount(accountId);
      const details = await client.getAccountDetails(accountId);

      accounts.push({
        accountId,
        iban: details.account.iban || account.iban,
        ownerName: details.account.ownerName,
        status: account.status,
      });
    } catch {
      // Skip accounts that can't be accessed
    }
  }

  return accounts;
}

/**
 * Create a source from a GoCardless account
 */
export async function createSourceFromGoCardless(
  ctx: OperationsContext,
  requisitionId: string,
  accountId: string,
  name: string
): Promise<string> {
  const requisition = await getRequisition(ctx, requisitionId);
  if (!requisition) {
    throw new Error(`Requisition ${requisitionId} not found`);
  }

  if (!requisition.accountIds.includes(accountId)) {
    throw new Error(`Account ${accountId} not found in requisition`);
  }

  const client = getGoCardlessClient();
  const account = await client.getAccount(accountId);
  const details = await client.getAccountDetails(accountId);

  const iban = details.account.iban || account.iban;
  if (!iban) {
    throw new Error("Account does not have an IBAN");
  }

  // Build API config
  const apiConfig: GoCardlessConnectorConfig = {
    provider: "gocardless",
    requisitionId: requisition.requisitionId,
    accountId,
    institutionId: requisition.institutionId,
    institutionName: requisition.institutionName,
    institutionLogo: requisition.institutionLogo,
    agreementExpiresAt: requisition.agreementExpiresAt,
  };

  // Create source
  const now = Timestamp.now();
  const sourceData = {
    name,
    accountKind: "bank_account" as const,
    iban: normalizeIban(iban),
    currency: details.account.currency || "EUR",
    type: "api" as const,
    apiConfig,
    isActive: true,
    userId: ctx.userId,
    createdAt: now,
    updatedAt: now,
  };

  const docRef = await addDoc(collection(ctx.db, "sources"), sourceData);
  return docRef.id;
}

/**
 * Link GoCardless account to an existing source
 * Updates the source to type="api" with GoCardless config
 */
export async function linkGoCardlessToExistingSource(
  ctx: OperationsContext,
  requisitionId: string,
  accountId: string,
  sourceId: string
): Promise<void> {
  const requisition = await getRequisition(ctx, requisitionId);
  if (!requisition) {
    throw new Error(`Requisition ${requisitionId} not found`);
  }

  if (!requisition.accountIds.includes(accountId)) {
    throw new Error(`Account ${accountId} not found in requisition`);
  }

  // Verify source exists and belongs to user
  const source = await getSourceById(ctx, sourceId);
  if (!source) {
    throw new Error(`Source ${sourceId} not found`);
  }

  const client = getGoCardlessClient();
  const account = await client.getAccount(accountId);
  const details = await client.getAccountDetails(accountId);

  // Build API config
  const apiConfig: GoCardlessConnectorConfig = {
    provider: "gocardless",
    requisitionId: requisition.requisitionId,
    accountId,
    institutionId: requisition.institutionId,
    institutionName: requisition.institutionName,
    institutionLogo: requisition.institutionLogo,
    agreementExpiresAt: requisition.agreementExpiresAt,
  };

  // Update source to API type
  await updateSource(ctx, sourceId, {
    type: "api",
    apiConfig,
    // Optionally update IBAN if it's different (shouldn't be for same account)
    ...(details.account.iban ? { iban: normalizeIban(details.account.iban) } : {}),
  });
}

// =========================================
// TRANSACTION SYNC
// =========================================

/**
 * Sync transactions for an API-connected source
 */
export async function syncTransactions(
  ctx: OperationsContext,
  sourceId: string
): Promise<{ imported: number; skipped: number; error?: string }> {
  const source = await getSourceById(ctx, sourceId);
  if (!source) {
    throw new Error(`Source ${sourceId} not found`);
  }

  if (source.type !== "api" || !source.apiConfig) {
    throw new Error("Source is not an API-connected account");
  }

  if (source.apiConfig.provider !== "gocardless") {
    throw new Error(`Unsupported provider: ${source.apiConfig.provider}`);
  }

  const config = source.apiConfig as GoCardlessConnectorConfig;

  // Check if re-auth is required
  const expiresAt = config.agreementExpiresAt.toDate();
  if (expiresAt < new Date()) {
    throw new ReauthRequiredError(sourceId, expiresAt);
  }

  const client = getGoCardlessClient();

  // Calculate date range
  const lastSyncAt = config.lastSyncAt?.toDate();
  const { dateFrom, dateTo } = getDefaultDateRange(lastSyncAt);

  // Fetch transactions from GoCardless
  const response = await client.getTransactions(config.accountId, dateFrom, dateTo);
  const bookedTransactions = filterBookedTransactions(response);

  if (bookedTransactions.length === 0) {
    // Update lastSyncAt even if no transactions
    await updateSource(ctx, sourceId, {
      apiConfig: {
        ...config,
        lastSyncAt: Timestamp.now(),
        lastSyncError: undefined,
      },
    });

    return { imported: 0, skipped: 0 };
  }

  // Transform to our format (use sourceId as identifier fallback for sources without IBAN)
  const syncJobId = `sync_${sourceId}_${Date.now()}`;
  const transactions = await transformTransactions(
    bookedTransactions,
    sourceId,
    source.iban ?? sourceId,
    ctx.userId,
    syncJobId
  );

  // Check for duplicates
  const hashes = transactions.map((t) => t.dedupeHash);
  const existingHashes = await checkDuplicatesBatch(hashes, sourceId);

  // Filter out duplicates
  const newTransactions = transactions.filter(
    (t) => !existingHashes.has(t.dedupeHash)
  );

  // Batch write new transactions
  const BATCH_SIZE = 500;
  let imported = 0;

  for (let i = 0; i < newTransactions.length; i += BATCH_SIZE) {
    const batch = writeBatch(ctx.db);
    const slice = newTransactions.slice(i, i + BATCH_SIZE);

    for (const tx of slice) {
      const docRef = doc(collection(ctx.db, TRANSACTIONS_COLLECTION));
      batch.set(docRef, tx);
      imported++;
    }

    await batch.commit();
  }

  // Update source with sync info
  await updateSource(ctx, sourceId, {
    apiConfig: {
      ...config,
      lastSyncAt: Timestamp.now(),
      lastSyncError: undefined,
    },
  });

  return {
    imported,
    skipped: existingHashes.size,
  };
}

/**
 * Check if a source needs re-authentication
 */
export async function checkReauthRequired(
  ctx: OperationsContext,
  sourceId: string
): Promise<{ required: boolean; expiresAt?: Date; daysRemaining?: number }> {
  const source = await getSourceById(ctx, sourceId);
  if (!source) {
    throw new Error(`Source ${sourceId} not found`);
  }

  if (source.type !== "api" || !source.apiConfig) {
    return { required: false };
  }

  if (source.apiConfig.provider !== "gocardless") {
    return { required: false };
  }

  const config = source.apiConfig as GoCardlessConnectorConfig;
  const expiresAt = config.agreementExpiresAt.toDate();
  const now = new Date();

  const daysRemaining = Math.floor(
    (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    required: daysRemaining <= 0,
    expiresAt,
    daysRemaining: Math.max(0, daysRemaining),
  };
}

/**
 * Get sync status for a source
 */
export async function getSyncStatus(
  ctx: OperationsContext,
  sourceId: string
): Promise<{
  lastSyncAt?: Date;
  lastSyncError?: string;
  needsReauth: boolean;
  reauthExpiresAt?: Date;
  reauthDaysRemaining?: number;
}> {
  const source = await getSourceById(ctx, sourceId);
  if (!source) {
    throw new Error(`Source ${sourceId} not found`);
  }

  if (source.type !== "api" || !source.apiConfig) {
    throw new Error("Source is not an API-connected account");
  }

  const config = source.apiConfig as GoCardlessConnectorConfig;
  const reauthInfo = await checkReauthRequired(ctx, sourceId);

  return {
    lastSyncAt: config.lastSyncAt?.toDate(),
    lastSyncError: config.lastSyncError,
    needsReauth: reauthInfo.required,
    reauthExpiresAt: reauthInfo.expiresAt,
    reauthDaysRemaining: reauthInfo.daysRemaining,
  };
}

// =========================================
// SYNC JOBS (for tracking)
// =========================================

/**
 * Create a sync job record
 */
export async function createSyncJob(
  ctx: OperationsContext,
  sourceId: string
): Promise<string> {
  const job: Omit<SyncJob, "id"> = {
    sourceId,
    userId: ctx.userId,
    status: "pending",
    transactionsImported: 0,
    transactionsSkipped: 0,
    startedAt: Timestamp.now(),
  };

  const docRef = await addDoc(collection(ctx.db, SYNC_JOBS_COLLECTION), job);
  return docRef.id;
}

/**
 * Update sync job status
 */
export async function updateSyncJob(
  ctx: OperationsContext,
  jobId: string,
  data: Partial<SyncJob>
): Promise<void> {
  const docRef = doc(ctx.db, SYNC_JOBS_COLLECTION, jobId);
  await updateDoc(docRef, data);
}

/**
 * List API-connected sources that need syncing
 * Used by scheduled sync function
 */
export async function listSourcesToSync(
  ctx: OperationsContext
): Promise<TransactionSource[]> {
  const q = query(
    collection(ctx.db, "sources"),
    where("userId", "==", ctx.userId),
    where("isActive", "==", true),
    where("type", "==", "api")
  );

  const snapshot = await getDocs(q);
  const sources = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as TransactionSource[];

  // Filter to only GoCardless sources that haven't synced in 6 hours
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

  return sources.filter((source) => {
    if (!source.apiConfig || source.apiConfig.provider !== "gocardless") {
      return false;
    }

    const config = source.apiConfig as GoCardlessConnectorConfig;
    const lastSync = config.lastSyncAt?.toDate();

    // Include if never synced or synced more than 6 hours ago
    return !lastSync || lastSync < sixHoursAgo;
  });
}
