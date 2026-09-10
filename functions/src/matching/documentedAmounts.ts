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
 * `excludeFileId` is the File being matched: it may already appear in a
 * candidate's `fileIds`, and a File cannot count towards the Remainder it is
 * being scored against.
 *
 * `fileIds` on the transaction is the same list both detail panels render, so
 * the scorers and the display count the same Files.
 */
export async function loadDocumentedAmounts(
  transactionDocs: Array<{ id: string; data: () => FirebaseFirestore.DocumentData }>,
  excludeFileId?: string
): Promise<Map<string, number>> {
  const fileIdsByTransaction = new Map<string, string[]>();
  const wantedFileIds = new Set<string>();

  for (const doc of transactionDocs) {
    const fileIds: string[] = (doc.data().fileIds || []).filter(
      (id: string) => id && id !== excludeFileId
    );
    if (fileIds.length === 0) continue;
    fileIdsByTransaction.set(doc.id, fileIds);
    for (const id of fileIds) wantedFileIds.add(id);
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
