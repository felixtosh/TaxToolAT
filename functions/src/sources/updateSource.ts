/**
 * Update a source (bank account)
 */

import { FieldValue } from "firebase-admin/firestore";
import { createCallable, HttpsError } from "../utils/createCallable";

interface SourceUpdateData {
  name?: string;
  accountKind?: "checking" | "savings" | "creditCard" | "other";
  iban?: string | null;
  linkedSourceId?: string | null;
  cardLast4?: string | null;
  cardBrand?: string | null;
  currency?: string;
  fieldMappings?: {
    mappings: Record<string, string>;
    formats?: Record<string, string>;
    updatedAt: string;
  } | null;
}

interface UpdateSourceRequest {
  sourceId: string;
  data: SourceUpdateData;
}

interface UpdateSourceResponse {
  success: boolean;
}

function normalizeIban(iban: string): string {
  return iban.replace(/\s/g, "").toUpperCase();
}

export const updateSourceCallable = createCallable<
  UpdateSourceRequest,
  UpdateSourceResponse
>(
  { name: "updateSource" },
  async (ctx, request) => {
    const { sourceId, data } = request;

    if (!sourceId) {
      throw new HttpsError("invalid-argument", "sourceId is required");
    }

    // Verify ownership
    const sourceRef = ctx.db.collection("sources").doc(sourceId);
    const sourceSnap = await sourceRef.get();

    if (!sourceSnap.exists) {
      throw new HttpsError("not-found", "Source not found");
    }

    if (sourceSnap.data()!.userId !== ctx.userId) {
      throw new HttpsError("permission-denied", "Access denied");
    }

    // Build update object
    const updates: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (data.name !== undefined) {
      updates.name = data.name.trim();
    }
    if (data.accountKind !== undefined) {
      updates.accountKind = data.accountKind;
    }
    if (data.iban !== undefined) {
      updates.iban = data.iban ? normalizeIban(data.iban) : null;
    }
    if (data.linkedSourceId !== undefined) {
      updates.linkedSourceId = data.linkedSourceId;
    }
    if (data.cardLast4 !== undefined) {
      updates.cardLast4 = data.cardLast4;
    }
    if (data.cardBrand !== undefined) {
      updates.cardBrand = data.cardBrand;
    }
    if (data.currency !== undefined) {
      updates.currency = data.currency;
    }
    if (data.fieldMappings !== undefined) {
      updates.fieldMappings = data.fieldMappings;
    }

    await sourceRef.update(updates);

    console.log(`[updateSource] Updated source ${sourceId}`, {
      userId: ctx.userId,
      fields: Object.keys(updates),
    });

    return { success: true };
  }
);
