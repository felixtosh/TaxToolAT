/**
 * Scheduled Function: Process Orphaned Files
 *
 * Runs every 5 minutes to catch files that got stuck in the matching pipeline.
 * This provides a safety net for cases where Firestore triggers are delayed or fail.
 *
 * Pipeline stages:
 *   1. extractionComplete: true (extraction done)
 *   2. partnerMatchComplete: true (partner matching done)
 *   3. transactionMatchComplete: true (transaction matching done)
 *
 * This function finds files stuck between stages and manually triggers the next step.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { runPartnerMatching } from "./matchFilePartner";
import { runTransactionMatching } from "./matchFileTransactions";

const db = getFirestore();

// Files must be stale for at least 3 minutes before we process them
// This avoids processing files that are currently being handled by triggers
const STALE_THRESHOLD_MINUTES = 3;

// Process max 20 files per run to avoid timeout
const BATCH_SIZE = 20;

/**
 * Process files stuck after extraction (partner matching didn't run)
 */
async function processStuckAfterExtraction(staleTime: Date): Promise<number> {
  // Query for files where extraction completed
  // We filter by updatedAt to only get stale files
  // Then check partnerMatchComplete in code (handles undefined/null/false)
  const snapshot = await db
    .collection("files")
    .where("extractionComplete", "==", true)
    .where("updatedAt", "<", Timestamp.fromDate(staleTime))
    .orderBy("updatedAt", "asc")
    .limit(BATCH_SIZE * 2) // Fetch extra since we filter in code
    .get();

  let processed = 0;

  for (const doc of snapshot.docs) {
    if (processed >= BATCH_SIZE) break;

    const data = doc.data();

    // Skip if partner matching already completed
    if (data.partnerMatchComplete === true) {
      continue;
    }

    // Skip if there was an extraction error
    if (data.extractionError) {
      continue;
    }

    // Skip files marked as not invoices (no partner matching needed)
    if (data.isNotInvoice === true) {
      continue;
    }

    try {
      console.log(`[Orphan] Processing partner matching for file: ${doc.id}`);
      await runPartnerMatching(doc.id, data);
      processed++;
      console.log(`[Orphan] Completed partner matching for file: ${doc.id}`);
    } catch (error) {
      console.error(`[Orphan] Failed partner matching for file ${doc.id}:`, error);
    }
  }

  return processed;
}

/**
 * Process files stuck after partner matching (transaction matching didn't run)
 */
async function processStuckAfterPartnerMatch(staleTime: Date): Promise<number> {
  // Query for files where partner matching completed
  // Then check transactionMatchComplete in code
  const snapshot = await db
    .collection("files")
    .where("partnerMatchComplete", "==", true)
    .where("updatedAt", "<", Timestamp.fromDate(staleTime))
    .orderBy("updatedAt", "asc")
    .limit(BATCH_SIZE * 2)
    .get();

  let processed = 0;

  for (const doc of snapshot.docs) {
    if (processed >= BATCH_SIZE) break;

    const data = doc.data();

    // Skip if transaction matching already completed
    if (data.transactionMatchComplete === true) {
      continue;
    }

    // Skip if there was an extraction error
    if (data.extractionError) {
      continue;
    }

    // Skip files marked as not invoices
    if (data.isNotInvoice === true) {
      continue;
    }

    try {
      console.log(`[Orphan] Processing transaction matching for file: ${doc.id}`);
      await runTransactionMatching(doc.id, data);
      processed++;
      console.log(`[Orphan] Completed transaction matching for file: ${doc.id}`);
    } catch (error) {
      console.error(`[Orphan] Failed transaction matching for file ${doc.id}:`, error);
    }
  }

  return processed;
}

/**
 * Scheduled function that runs every 5 minutes
 */
export const processOrphanedFiles = onSchedule(
  {
    schedule: "every 5 minutes",
    region: "europe-west1",
    timeoutSeconds: 120,
    memory: "256MiB",
  },
  async () => {
    const startTime = Date.now();
    const staleTime = new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000);

    console.log(`[Orphan] Starting orphaned file processing. Stale threshold: ${staleTime.toISOString()}`);

    // Process files stuck after extraction
    const partnerProcessed = await processStuckAfterExtraction(staleTime);
    console.log(`[Orphan] Processed ${partnerProcessed} files stuck after extraction`);

    // Process files stuck after partner matching
    const transactionProcessed = await processStuckAfterPartnerMatch(staleTime);
    console.log(`[Orphan] Processed ${transactionProcessed} files stuck after partner matching`);

    const elapsed = Date.now() - startTime;
    console.log(
      `[Orphan] Completed. Partner: ${partnerProcessed}, Transaction: ${transactionProcessed}. Elapsed: ${elapsed}ms`
    );
  }
);
