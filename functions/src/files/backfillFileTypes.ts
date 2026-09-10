/**
 * Backfill File Types
 *
 * One-time callable that sets `fileType` on every file record missing one,
 * sniffed from the stored bytes via the same sniffer extraction already uses
 * (#248). Idempotent — skips files that already have a fileType.
 */

import { FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { createCallable } from "../utils/createCallable";
import { sniffMimeType } from "../extraction/geminiParser";

interface BackfillFileTypesRequest {
  // empty — operates on all files for the calling user
}

interface BackfillFileTypesResponse {
  success: boolean;
  updated: number;
  skipped: number;
}

export const backfillFileTypesCallable = createCallable<
  BackfillFileTypesRequest,
  BackfillFileTypesResponse
>(
  { name: "backfillFileTypes" },
  async (ctx) => {
    const filesSnap = await ctx.db
      .collection("files")
      .where("userId", "==", ctx.userId)
      .get();

    const bucket = getStorage().bucket();
    let updated = 0;
    let skipped = 0;

    for (const fileDoc of filesSnap.docs) {
      const fileData = fileDoc.data();

      if (fileData.fileType) {
        skipped++;
        continue;
      }

      const storagePath = fileData.storagePath as string | undefined;
      if (!storagePath) {
        console.warn(`[backfillFileTypes] File ${fileDoc.id} has no storagePath, skipping`);
        skipped++;
        continue;
      }

      const [buffer] = await bucket.file(storagePath).download();
      const fileType = sniffMimeType(buffer, fileData.fileType as string | undefined);

      await fileDoc.ref.update({
        fileType,
        updatedAt: FieldValue.serverTimestamp(),
      });

      console.log(`[backfillFileTypes] Set fileType=${fileType} on file ${fileDoc.id}`);
      updated++;
    }

    console.log(`[backfillFileTypes] Done: updated=${updated}, skipped=${skipped}`);

    return { success: true, updated, skipped };
  }
);
