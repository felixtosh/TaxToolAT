/**
 * What the Files already sitting on a Transaction explain (#239).
 *
 * The Firestore read behind Coverage, kept out of `coverage.ts` so that module
 * stays dependency-free for the detail panels. Both scorers that work from a
 * candidate set — the trigger that scores a File against Transactions, and the
 * callable behind the Connect dialog — resolve their Remainders through here,
 * so a pair cannot be judged against the full amount in one and against the
 * Remainder in the other.
 */

import { getFirestore } from "firebase-admin/firestore";
import { documentedAmountOf, filePaymentTotal } from "./coverage";

const db = getFirestore();

/**
 * Documented amount per transaction, for the candidates that hold any Files.
 * Transactions with no Files are absent from the map, which callers read as
 * zero — nothing connected, score against the full amount.
 *
 * `excludeFileId` is the File being matched: it may already be connected to a
 * candidate, and a File cannot count towards the Remainder it is being scored
 * against.
 *
 * **Reads the `fileConnections` collection, not the transaction's `fileIds`.**
 * `fileConnections` is what `isTransactionCovered` read before this was
 * extracted (#239) and it stays the record of truth for "which Files sit on
 * this Transaction". `fileIds` is a denormalised copy maintained alongside it;
 * scoring off the copy would silently answer differently wherever the two
 * drift, and picking a new source of truth is not this ticket's decision to
 * make. The batching below exists because that read was per-candidate before.
 */
export async function loadDocumentedAmounts(
  transactionIds: string[],
  excludeFileId?: string
): Promise<Map<string, number>> {
  const fileIdsByTransaction = new Map<string, string[]>();
  const wantedFileIds = new Set<string>();

  // Firestore 'in' takes at most 30 values, so the candidates are chunked. One
  // query per 30 candidates, rather than the one query per candidate this read
  // used to cost.
  for (let i = 0; i < transactionIds.length; i += 30) {
    const chunk = transactionIds.slice(i, i + 30);
    const connections = await db
      .collection("fileConnections")
      .where("transactionId", "in", chunk)
      .get();

    for (const connection of connections.docs) {
      const { transactionId, fileId } = connection.data();
      // The File being scored cannot document the Remainder it is scored against.
      if (!transactionId || !fileId || fileId === excludeFileId) continue;
      const forTransaction = fileIdsByTransaction.get(transactionId) ?? [];
      if (forTransaction.includes(fileId)) continue; // duplicate connection rows
      forTransaction.push(fileId);
      fileIdsByTransaction.set(transactionId, forTransaction);
      wantedFileIds.add(fileId);
    }
  }

  const documented = new Map<string, number>();
  if (wantedFileIds.size === 0) return documented;

  // Firestore 'in' queries have a limit of 30, batch if needed
  const paymentByFileId = new Map<string, number | null>();
  const allFileIds = Array.from(wantedFileIds);
  for (let i = 0; i < allFileIds.length; i += 30) {
    const batch = allFileIds.slice(i, i + 30);
    const filesSnapshot = await db
      .collection("files")
      .where("__name__", "in", batch)
      .get();

    for (const fileDoc of filesSnapshot.docs) {
      const fileData = fileDoc.data();
      // Against the bank line, so a printed Trinkgeld counts (#172).
      paymentByFileId.set(
        fileDoc.id,
        filePaymentTotal(fileData.extractedAmount, fileData.extractedTipAmount)
      );
    }
  }

  for (const [transactionId, fileIds] of fileIdsByTransaction) {
    const total = documentedAmountOf(fileIds.map((id) => paymentByFileId.get(id)));
    if (total > 0) documented.set(transactionId, total);
  }

  return documented;
}
