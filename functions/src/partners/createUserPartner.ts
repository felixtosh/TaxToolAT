/**
 * Create a new user partner
 */

import { Timestamp } from "firebase-admin/firestore";
import { createCallable, HttpsError } from "../utils/createCallable";

interface PartnerFormData {
  name: string;
  aliases?: string[];
  address?: string | null;
  country?: string | null;
  vatId?: string | null;
  ibans?: string[];
  website?: string | null;
  notes?: string | null;
  defaultCategoryId?: string | null;
  /** Link to global partner if creating from suggestion */
  globalPartnerId?: string;
  /** Mark this partner as "my company" for counterparty extraction */
  isMyCompany?: boolean;
}

interface CreateUserPartnerRequest {
  data: PartnerFormData;
}

interface CreateUserPartnerResponse {
  success: boolean;
  partnerId: string;
}

/**
 * Normalize IBAN by removing spaces and converting to uppercase
 */
function normalizeIban(iban: string): string {
  return iban.replace(/\s/g, "").toUpperCase();
}

/**
 * Normalize URL by ensuring protocol and lowercasing
 */
function normalizeUrl(url: string): string {
  let normalized = url.trim().toLowerCase();
  if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
    normalized = "https://" + normalized;
  }
  // Remove trailing slash
  return normalized.replace(/\/+$/, "");
}

export const createUserPartnerCallable = createCallable<
  CreateUserPartnerRequest,
  CreateUserPartnerResponse
>(
  { name: "createUserPartner" },
  async (ctx, request) => {
    const { data } = request;

    if (!data?.name?.trim()) {
      throw new HttpsError("invalid-argument", "Partner name is required");
    }

    const now = Timestamp.now();

    const newPartner: Record<string, unknown> = {
      userId: ctx.userId,
      name: data.name.trim(),
      aliases: (data.aliases || []).map((a) => a.trim()).filter(Boolean),
      address: data.address || null,
      country: data.country || null,
      vatId: data.vatId?.toUpperCase().replace(/\s/g, "") || null,
      ibans: (data.ibans || []).map(normalizeIban).filter(Boolean),
      website: data.website ? normalizeUrl(data.website) : null,
      notes: data.notes || null,
      defaultCategoryId: data.defaultCategoryId || null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    // Link to global partner if creating from a global suggestion
    if (data.globalPartnerId) {
      newPartner.globalPartnerId = data.globalPartnerId;
    }

    // Mark as "my company" if specified
    if (data.isMyCompany) {
      newPartner.isMyCompany = true;
    }

    const docRef = await ctx.db.collection("partners").add(newPartner);

    console.log(`[createUserPartner] Created partner ${docRef.id}`, {
      userId: ctx.userId,
      name: data.name,
    });

    return {
      success: true,
      partnerId: docRef.id,
    };
  }
);
