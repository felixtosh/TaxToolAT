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
  Timestamp,
  writeBatch,
  limit,
} from "firebase/firestore";
import {
  UserPartner,
  GlobalPartner,
  PartnerFormData,
  GlobalPartnerFormData,
  PartnerFilters,
  PromotionCandidate,
} from "@/types/partner";
import { normalizeIban } from "@/lib/import/deduplication";
import { normalizeUrl } from "@/lib/matching/url-normalizer";
import { OperationsContext } from "./types";

const PARTNERS_COLLECTION = "partners";
const GLOBAL_PARTNERS_COLLECTION = "globalPartners";
const TRANSACTIONS_COLLECTION = "transactions";
const PROMOTION_CANDIDATES_COLLECTION = "promotionCandidates";

// ============ User Partners ============

/**
 * List all active partners for the current user
 */
export async function listUserPartners(
  ctx: OperationsContext,
  filters?: PartnerFilters
): Promise<UserPartner[]> {
  const q = query(
    collection(ctx.db, PARTNERS_COLLECTION),
    where("userId", "==", ctx.userId),
    where("isActive", "==", true),
    orderBy("name", "asc")
  );

  const snapshot = await getDocs(q);

  let partners = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as UserPartner[];

  // Client-side filtering for search
  if (filters?.search) {
    const searchLower = filters.search.toLowerCase();
    partners = partners.filter(
      (p) =>
        p.name.toLowerCase().includes(searchLower) ||
        p.aliases.some((a) => a.toLowerCase().includes(searchLower)) ||
        p.vatId?.toLowerCase().includes(searchLower) ||
        p.ibans.some((i) => i.toLowerCase().includes(searchLower))
    );
  }

  if (filters?.country) {
    partners = partners.filter((p) => p.country === filters.country);
  }

  if (filters?.hasVatId !== undefined) {
    partners = partners.filter((p) =>
      filters.hasVatId ? !!p.vatId : !p.vatId
    );
  }

  if (filters?.hasIban !== undefined) {
    partners = partners.filter((p) =>
      filters.hasIban ? p.ibans.length > 0 : p.ibans.length === 0
    );
  }

  return partners;
}

/**
 * Get a user partner by ID
 */
export async function getUserPartner(
  ctx: OperationsContext,
  partnerId: string
): Promise<UserPartner | null> {
  const docRef = doc(ctx.db, PARTNERS_COLLECTION, partnerId);
  const snapshot = await getDoc(docRef);

  if (!snapshot.exists()) return null;

  const data = snapshot.data();
  if (data.userId !== ctx.userId) return null;

  return { id: snapshot.id, ...data } as UserPartner;
}

/**
 * Create a new user partner
 */
export async function createUserPartner(
  ctx: OperationsContext,
  data: PartnerFormData
): Promise<string> {
  const now = Timestamp.now();

  const newPartner = {
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

  const docRef = await addDoc(collection(ctx.db, PARTNERS_COLLECTION), newPartner);
  return docRef.id;
}

/**
 * Update a user partner
 */
export async function updateUserPartner(
  ctx: OperationsContext,
  partnerId: string,
  data: Partial<PartnerFormData>
): Promise<void> {
  const existing = await getUserPartner(ctx, partnerId);
  if (!existing) {
    throw new Error(`Partner ${partnerId} not found or access denied`);
  }

  const updates: Record<string, unknown> = {
    updatedAt: Timestamp.now(),
  };

  if (data.name !== undefined) updates.name = data.name.trim();
  if (data.aliases !== undefined) {
    updates.aliases = data.aliases.map((a) => a.trim()).filter(Boolean);
  }
  if (data.address !== undefined) updates.address = data.address;
  if (data.country !== undefined) updates.country = data.country;
  if (data.vatId !== undefined) {
    updates.vatId = data.vatId?.toUpperCase().replace(/\s/g, "") || null;
  }
  if (data.ibans !== undefined) {
    updates.ibans = data.ibans.map(normalizeIban).filter(Boolean);
  }
  if (data.website !== undefined) {
    updates.website = data.website ? normalizeUrl(data.website) : null;
  }
  if (data.notes !== undefined) updates.notes = data.notes;
  if (data.defaultCategoryId !== undefined) {
    updates.defaultCategoryId = data.defaultCategoryId;
  }

  const docRef = doc(ctx.db, PARTNERS_COLLECTION, partnerId);
  await updateDoc(docRef, updates);
}

/**
 * Soft-delete a user partner
 */
export async function deleteUserPartner(
  ctx: OperationsContext,
  partnerId: string
): Promise<void> {
  const existing = await getUserPartner(ctx, partnerId);
  if (!existing) {
    throw new Error(`Partner ${partnerId} not found or access denied`);
  }

  const docRef = doc(ctx.db, PARTNERS_COLLECTION, partnerId);
  await updateDoc(docRef, {
    isActive: false,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Find user partner by IBAN
 */
export async function findUserPartnerByIban(
  ctx: OperationsContext,
  iban: string
): Promise<UserPartner | null> {
  const normalizedIban = normalizeIban(iban);

  const q = query(
    collection(ctx.db, PARTNERS_COLLECTION),
    where("userId", "==", ctx.userId),
    where("isActive", "==", true),
    where("ibans", "array-contains", normalizedIban)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;

  return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as UserPartner;
}

// ============ Global Partners ============

/**
 * List global partners
 */
export async function listGlobalPartners(
  ctx: OperationsContext,
  filters?: PartnerFilters
): Promise<GlobalPartner[]> {
  const q = query(
    collection(ctx.db, GLOBAL_PARTNERS_COLLECTION),
    where("isActive", "==", true),
    orderBy("name", "asc")
  );

  const snapshot = await getDocs(q);

  let partners = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as GlobalPartner[];

  // Client-side filtering
  if (filters?.search) {
    const searchLower = filters.search.toLowerCase();
    partners = partners.filter(
      (p) =>
        p.name.toLowerCase().includes(searchLower) ||
        p.aliases.some((a) => a.toLowerCase().includes(searchLower)) ||
        p.vatId?.toLowerCase().includes(searchLower) ||
        p.ibans.some((i) => i.toLowerCase().includes(searchLower))
    );
  }

  if (filters?.country) {
    partners = partners.filter((p) => p.country === filters.country);
  }

  return partners;
}

/**
 * Get a global partner by ID
 */
export async function getGlobalPartner(
  ctx: OperationsContext,
  partnerId: string
): Promise<GlobalPartner | null> {
  const docRef = doc(ctx.db, GLOBAL_PARTNERS_COLLECTION, partnerId);
  const snapshot = await getDoc(docRef);

  if (!snapshot.exists()) return null;

  return { id: snapshot.id, ...snapshot.data() } as GlobalPartner;
}

/**
 * Create a global partner (admin only)
 */
export async function createGlobalPartner(
  ctx: OperationsContext,
  data: GlobalPartnerFormData
): Promise<string> {
  const now = Timestamp.now();

  const newPartner = {
    name: data.name.trim(),
    aliases: (data.aliases || []).map((a) => a.trim()).filter(Boolean),
    address: data.address || null,
    country: data.country || null,
    vatId: data.vatId?.toUpperCase().replace(/\s/g, "") || null,
    ibans: (data.ibans || []).map(normalizeIban).filter(Boolean),
    website: data.website ? normalizeUrl(data.website) : null,
    externalIds: data.externalIds || null,
    source: data.source || "manual",
    sourceDetails: {
      contributingUserIds: [ctx.userId],
      confidence: 100,
      verifiedAt: now,
      verifiedBy: ctx.userId,
    },
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  const docRef = await addDoc(collection(ctx.db, GLOBAL_PARTNERS_COLLECTION), newPartner);
  return docRef.id;
}

/**
 * Update a global partner (admin only)
 */
export async function updateGlobalPartner(
  ctx: OperationsContext,
  partnerId: string,
  data: Partial<GlobalPartnerFormData>
): Promise<void> {
  const existing = await getGlobalPartner(ctx, partnerId);
  if (!existing) {
    throw new Error(`Global partner ${partnerId} not found`);
  }

  const updates: Record<string, unknown> = {
    updatedAt: Timestamp.now(),
  };

  if (data.name !== undefined) updates.name = data.name.trim();
  if (data.aliases !== undefined) {
    updates.aliases = data.aliases.map((a) => a.trim()).filter(Boolean);
  }
  if (data.address !== undefined) updates.address = data.address;
  if (data.country !== undefined) updates.country = data.country;
  if (data.vatId !== undefined) {
    updates.vatId = data.vatId?.toUpperCase().replace(/\s/g, "") || null;
  }
  if (data.ibans !== undefined) {
    updates.ibans = data.ibans.map(normalizeIban).filter(Boolean);
  }
  if (data.website !== undefined) {
    updates.website = data.website ? normalizeUrl(data.website) : null;
  }
  if (data.externalIds !== undefined) {
    updates.externalIds = data.externalIds;
  }

  const docRef = doc(ctx.db, GLOBAL_PARTNERS_COLLECTION, partnerId);
  await updateDoc(docRef, updates);
}

/**
 * Soft-delete a global partner (admin only)
 */
export async function deleteGlobalPartner(
  ctx: OperationsContext,
  partnerId: string
): Promise<void> {
  const existing = await getGlobalPartner(ctx, partnerId);
  if (!existing) {
    throw new Error(`Global partner ${partnerId} not found`);
  }

  const docRef = doc(ctx.db, GLOBAL_PARTNERS_COLLECTION, partnerId);
  await updateDoc(docRef, {
    isActive: false,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Find global partner by IBAN
 */
export async function findGlobalPartnerByIban(
  ctx: OperationsContext,
  iban: string
): Promise<GlobalPartner | null> {
  const normalizedIban = normalizeIban(iban);

  const q = query(
    collection(ctx.db, GLOBAL_PARTNERS_COLLECTION),
    where("isActive", "==", true),
    where("ibans", "array-contains", normalizedIban)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;

  return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as GlobalPartner;
}

// ============ Transaction Partner Assignment ============

/**
 * Assign a partner to a transaction
 */
export async function assignPartnerToTransaction(
  ctx: OperationsContext,
  transactionId: string,
  partnerId: string,
  partnerType: "global" | "user",
  matchedBy: "manual" | "suggestion",
  confidence?: number
): Promise<void> {
  // Verify transaction ownership
  const txDoc = doc(ctx.db, TRANSACTIONS_COLLECTION, transactionId);
  const txSnapshot = await getDoc(txDoc);

  if (!txSnapshot.exists() || txSnapshot.data().userId !== ctx.userId) {
    throw new Error(`Transaction ${transactionId} not found or access denied`);
  }

  await updateDoc(txDoc, {
    partnerId,
    partnerType,
    partnerMatchedBy: matchedBy,
    partnerMatchConfidence: confidence || (matchedBy === "manual" ? 100 : null),
    updatedAt: Timestamp.now(),
  });
}

/**
 * Remove partner assignment from transaction
 */
export async function removePartnerFromTransaction(
  ctx: OperationsContext,
  transactionId: string
): Promise<void> {
  const txDoc = doc(ctx.db, TRANSACTIONS_COLLECTION, transactionId);
  const txSnapshot = await getDoc(txDoc);

  if (!txSnapshot.exists() || txSnapshot.data().userId !== ctx.userId) {
    throw new Error(`Transaction ${transactionId} not found or access denied`);
  }

  await updateDoc(txDoc, {
    partnerId: null,
    partnerType: null,
    partnerMatchedBy: null,
    partnerMatchConfidence: null,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Get unmatched transactions for the current user
 */
export async function getUnmatchedTransactions(
  ctx: OperationsContext,
  limitCount: number = 100
): Promise<Array<{ id: string; partner: string | null; partnerIban: string | null; name: string }>> {
  const q = query(
    collection(ctx.db, TRANSACTIONS_COLLECTION),
    where("userId", "==", ctx.userId),
    where("partnerId", "==", null),
    limit(limitCount)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      partner: data.partner || null,
      partnerIban: data.partnerIban || null,
      name: data.name || "",
    };
  });
}

// ============ Promotion Candidates (Admin) ============

/**
 * List pending promotion candidates
 */
export async function listPromotionCandidates(
  ctx: OperationsContext
): Promise<PromotionCandidate[]> {
  const q = query(
    collection(ctx.db, PROMOTION_CANDIDATES_COLLECTION),
    where("status", "==", "pending"),
    orderBy("confidence", "desc")
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    ...doc.data(),
  })) as PromotionCandidate[];
}

/**
 * Approve a promotion candidate (promotes user partner to global)
 */
export async function approvePromotionCandidate(
  ctx: OperationsContext,
  candidateId: string
): Promise<string> {
  const candidateDoc = doc(ctx.db, PROMOTION_CANDIDATES_COLLECTION, candidateId);
  const candidateSnapshot = await getDoc(candidateDoc);

  if (!candidateSnapshot.exists()) {
    throw new Error(`Promotion candidate ${candidateId} not found`);
  }

  const candidate = candidateSnapshot.data() as PromotionCandidate;
  const userPartner = candidate.userPartner;

  // Create global partner from user partner
  const globalPartnerId = await createGlobalPartner(ctx, {
    name: userPartner.name,
    aliases: userPartner.aliases,
    address: userPartner.address,
    country: userPartner.country,
    vatId: userPartner.vatId,
    ibans: userPartner.ibans,
    website: userPartner.website,
    source: "user_promoted",
  });

  // Update the promotion candidate as approved
  await updateDoc(candidateDoc, {
    status: "approved",
    reviewedAt: Timestamp.now(),
    reviewedBy: ctx.userId,
  });

  return globalPartnerId;
}

/**
 * Reject a promotion candidate
 */
export async function rejectPromotionCandidate(
  ctx: OperationsContext,
  candidateId: string
): Promise<void> {
  const candidateDoc = doc(ctx.db, PROMOTION_CANDIDATES_COLLECTION, candidateId);

  await updateDoc(candidateDoc, {
    status: "rejected",
    reviewedAt: Timestamp.now(),
    reviewedBy: ctx.userId,
  });
}
