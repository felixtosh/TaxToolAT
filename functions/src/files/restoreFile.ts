/**
 * Restore a soft-deleted file
 */

import { FieldValue } from "firebase-admin/firestore";
import { createCallable, HttpsError } from "../utils/createCallable";

interface RestoreFileRequest {
  fileId: string;
}

interface RestoreFileResponse {
  success: boolean;
}

export const restoreFileCallable = createCallable<
  RestoreFileRequest,
  RestoreFileResponse
>(
  { name: "restoreFile" },
  async (ctx, request) => {
    const { fileId } = request;

    if (!fileId) {
      throw new HttpsError("invalid-argument", "fileId is required");
    }

    const fileRef = ctx.db.collection("files").doc(fileId);
    const fileSnap = await fileRef.get();

    if (!fileSnap.exists) {
      throw new HttpsError("not-found", "File not found");
    }

    const fileData = fileSnap.data()!;
    if (fileData.userId !== ctx.userId) {
      throw new HttpsError("permission-denied", "Access denied");
    }

    if (!fileData.deletedAt) {
      // File is not deleted, nothing to restore
      return { success: true };
    }

    await fileRef.update({
      deletedAt: null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    console.log(`[restoreFile] Restored file ${fileId}`, {
      userId: ctx.userId,
    });

    return { success: true };
  }
);
