/**
 * Update a user partner
 */

import { FieldValue } from "firebase-admin/firestore";
import { createCallable, HttpsError } from "../utils/createCallable";

interface PartnerUpdateData {
  name?: string;
  aliases?: string[];
  address?: string | null;
  country?: string | null;
  vatId?: string | null;
  ibans?: string[];
  website?: string | null;
  notes?: string | null;
  defaultCategoryId?: string | null;
  isMyCompany?: boolean;
}

interface UpdateUserPartnerRequest {
  partnerId: string;
  data: PartnerUpdateData;
}

interface UpdateUserPartnerResponse {
  success: boolean;
}

function normalizeIban(iban: string): string {
  return iban.replace(/\s/g, "").toUpperCase();
}

function normalizeUrl(url: string): string {
  let normalized = url.trim().toLowerCase();
  if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
    normalized = "https://" + normalized;
  }
  return normalized.replace(/\/+$/, "");
}

export const updateUserPartnerCallable = createCallable<
  UpdateUserPartnerRequest,
  UpdateUserPartnerResponse
>(
  { name: "updateUserPartner" },
  async (ctx, request) => {
    const { partnerId, data } = request;

    if (!partnerId) {
      throw new HttpsError("invalid-argument", "partnerId is required");
    }

    // Verify ownership
    const partnerRef = ctx.db.collection("partners").doc(partnerId);
    const partnerSnap = await partnerRef.get();

    if (!partnerSnap.exists) {
      throw new HttpsError("not-found", "Partner not found");
    }

    if (partnerSnap.data()!.userId !== ctx.userId) {
      throw new HttpsError("permission-denied", "Access denied");
    }

    // Build update object
    const updates: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (data.name !== undefined) {
      updates.name = data.name.trim();
    }
    if (data.aliases !== undefined) {
      updates.aliases = data.aliases.map((a) => a.trim()).filter(Boolean);
    }
    if (data.address !== undefined) {
      updates.address = data.address;
    }
    if (data.country !== undefined) {
      updates.country = data.country;
    }
    if (data.vatId !== undefined) {
      updates.vatId = data.vatId?.toUpperCase().replace(/\s/g, "") || null;
    }
    if (data.ibans !== undefined) {
      updates.ibans = data.ibans.map(normalizeIban).filter(Boolean);
    }
    if (data.website !== undefined) {
      updates.website = data.website ? normalizeUrl(data.website) : null;
    }
    if (data.notes !== undefined) {
      updates.notes = data.notes;
    }
    if (data.defaultCategoryId !== undefined) {
      updates.defaultCategoryId = data.defaultCategoryId;
    }
    if (data.isMyCompany !== undefined) {
      updates.isMyCompany = data.isMyCompany;
    }

    await partnerRef.update(updates);

    console.log(`[updateUserPartner] Updated partner ${partnerId}`, {
      userId: ctx.userId,
      fields: Object.keys(updates),
    });

    return { success: true };
  }
);
