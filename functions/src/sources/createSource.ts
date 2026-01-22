/**
 * Create a new source (bank account)
 */

import { Timestamp } from "firebase-admin/firestore";
import { createCallable, HttpsError } from "../utils/createCallable";

interface SourceFormData {
  name: string;
  accountKind: "checking" | "savings" | "creditCard" | "other";
  iban?: string | null;
  linkedSourceId?: string | null;
  cardLast4?: string | null;
  cardBrand?: string | null;
  currency: string;
  type: "manual" | "api";
}

interface CreateSourceRequest {
  data: SourceFormData;
}

interface CreateSourceResponse {
  success: boolean;
  sourceId: string;
}

/**
 * Normalize IBAN by removing spaces and converting to uppercase
 */
function normalizeIban(iban: string): string {
  return iban.replace(/\s/g, "").toUpperCase();
}

export const createSourceCallable = createCallable<
  CreateSourceRequest,
  CreateSourceResponse
>(
  { name: "createSource" },
  async (ctx, request) => {
    const { data } = request;

    if (!data?.name?.trim()) {
      throw new HttpsError("invalid-argument", "Source name is required");
    }

    if (!data.currency) {
      throw new HttpsError("invalid-argument", "Currency is required");
    }

    const now = Timestamp.now();

    const newSource = {
      name: data.name.trim(),
      accountKind: data.accountKind || "checking",
      iban: data.iban ? normalizeIban(data.iban) : null,
      linkedSourceId: data.linkedSourceId || null,
      cardLast4: data.cardLast4 || null,
      cardBrand: data.cardBrand || null,
      currency: data.currency,
      type: data.type || "manual",
      isActive: true,
      userId: ctx.userId,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await ctx.db.collection("sources").add(newSource);

    console.log(`[createSource] Created source ${docRef.id}`, {
      userId: ctx.userId,
      name: data.name,
      type: data.type,
    });

    return {
      success: true,
      sourceId: docRef.id,
    };
  }
);
