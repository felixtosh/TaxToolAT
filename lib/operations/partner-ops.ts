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
  deleteDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/config";
import { PRESET_PARTNERS } from "@/lib/data/preset-partners";
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
  data: PartnerFormData,
  options?: { globalPartnerId?: string }
): Promise<string> {
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
  if (options?.globalPartnerId) {
    newPartner.globalPartnerId = options.globalPartnerId;
  }

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

/**
 * Find user partner by global partner ID (for checking if user already has a local copy)
 */
export async function findUserPartnerByGlobalId(
  ctx: OperationsContext,
  globalPartnerId: string
): Promise<UserPartner | null> {
  const q = query(
    collection(ctx.db, PARTNERS_COLLECTION),
    where("userId", "==", ctx.userId),
    where("isActive", "==", true),
    where("globalPartnerId", "==", globalPartnerId)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;

  return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as UserPartner;
}

/**
 * Create a local partner from a global partner (full data copy)
 * Returns existing local partner if one already exists for this global partner
 */
export async function createLocalPartnerFromGlobal(
  ctx: OperationsContext,
  globalPartnerId: string
): Promise<{ localPartnerId: string; wasExisting: boolean }> {
  // Check if user already has a local partner linked to this global partner
  const existing = await findUserPartnerByGlobalId(ctx, globalPartnerId);
  if (existing) {
    return { localPartnerId: existing.id, wasExisting: true };
  }

  // Fetch the global partner
  const globalPartner = await getGlobalPartner(ctx, globalPartnerId);
  if (!globalPartner) {
    throw new Error(`Global partner ${globalPartnerId} not found`);
  }

  // Create local partner with full data copy
  const localPartnerId = await createUserPartner(
    ctx,
    {
      name: globalPartner.name,
      aliases: globalPartner.aliases,
      address: globalPartner.address,
      country: globalPartner.country,
      vatId: globalPartner.vatId,
      ibans: globalPartner.ibans,
      website: globalPartner.website,
      notes: null,
      defaultCategoryId: null,
    },
    { globalPartnerId }
  );

  return { localPartnerId, wasExisting: false };
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

  // If assigning a global partner, create/reuse a local copy instead
  let finalPartnerId = partnerId;
  let finalPartnerType: "global" | "user" = partnerType;

  if (partnerType === "global") {
    const { localPartnerId } = await createLocalPartnerFromGlobal(ctx, partnerId);
    finalPartnerId = localPartnerId;
    finalPartnerType = "user";
  }

  await updateDoc(txDoc, {
    partnerId: finalPartnerId,
    partnerType: finalPartnerType,
    partnerMatchedBy: matchedBy,
    partnerMatchConfidence: confidence || (matchedBy === "manual" ? 100 : null),
    updatedAt: Timestamp.now(),
  });

  // Trigger pattern learning (non-blocking)
  // Learn immediately so patterns improve with each assignment
  if (matchedBy === "manual" || matchedBy === "suggestion") {
    triggerPatternLearning(finalPartnerId).catch((error) => {
      console.error("Failed to trigger pattern learning:", error);
      // Don't throw - pattern learning is non-critical
    });
  }
}

/**
 * Trigger pattern learning for a partner
 * Always learns immediately - simpler and gives instant feedback
 */
async function triggerPatternLearning(partnerId: string): Promise<void> {
  const learnPatterns = httpsCallable<
    { partnerId: string },
    { success: boolean; patternsLearned: number }
  >(functions, "learnPartnerPatterns");

  const result = await learnPatterns({ partnerId });
  console.log(`[Pattern Learning] ${partnerId}: learned ${result.data.patternsLearned} patterns`);
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
    id: doc.id,
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

// ============ Preset Partners (Admin) ============

/**
 * Check if preset partners are currently enabled
 */
export async function getPresetPartnersStatus(
  ctx: OperationsContext
): Promise<{ enabled: boolean; count: number }> {
  const q = query(
    collection(ctx.db, GLOBAL_PARTNERS_COLLECTION),
    where("source", "==", "preset"),
    where("isActive", "==", true),
    limit(1)
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return { enabled: false, count: 0 };
  }

  // Get full count
  const countQuery = query(
    collection(ctx.db, GLOBAL_PARTNERS_COLLECTION),
    where("source", "==", "preset"),
    where("isActive", "==", true)
  );
  const countSnapshot = await getDocs(countQuery);

  return { enabled: true, count: countSnapshot.size };
}

/**
 * Enable preset partners by seeding them into the database
 */
export async function enablePresetPartners(
  ctx: OperationsContext
): Promise<{ created: number }> {
  const now = Timestamp.now();

  // Check if already enabled
  const status = await getPresetPartnersStatus(ctx);
  if (status.enabled) {
    return { created: 0 };
  }

  // Batch write in groups of 500 (Firestore limit)
  const BATCH_SIZE = 500;
  let created = 0;

  for (let i = 0; i < PRESET_PARTNERS.length; i += BATCH_SIZE) {
    const batch = writeBatch(ctx.db);
    const chunk = PRESET_PARTNERS.slice(i, i + BATCH_SIZE);

    for (const partner of chunk) {
      const docRef = doc(collection(ctx.db, GLOBAL_PARTNERS_COLLECTION));
      batch.set(docRef, {
        name: partner.name,
        aliases: partner.aliases,
        address: null,
        country: partner.country,
        vatId: partner.vatId || null,
        ibans: [],
        website: partner.website || null,
        externalIds: null,
        source: "preset",
        sourceDetails: {
          contributingUserIds: ["system"],
          confidence: 100,
          verifiedAt: now,
          verifiedBy: "system",
        },
        patterns: partner.patterns || [],
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      created++;
    }

    await batch.commit();
  }

  return { created };
}

/**
 * Disable preset partners by hard-deleting them
 * (We hard delete because these are system-generated, not user data)
 */
export async function disablePresetPartners(
  ctx: OperationsContext
): Promise<{ deleted: number }> {
  const q = query(
    collection(ctx.db, GLOBAL_PARTNERS_COLLECTION),
    where("source", "==", "preset")
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return { deleted: 0 };
  }

  // Batch delete in groups of 500
  const BATCH_SIZE = 500;
  let deleted = 0;
  const docs = snapshot.docs;

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = writeBatch(ctx.db);
    const chunk = docs.slice(i, i + BATCH_SIZE);

    for (const docSnap of chunk) {
      batch.delete(docSnap.ref);
      deleted++;
    }

    await batch.commit();
  }

  return { deleted };
}

/**
 * Toggle preset partners on/off
 */
export async function togglePresetPartners(
  ctx: OperationsContext,
  enable: boolean
): Promise<{ enabled: boolean; count: number }> {
  if (enable) {
    const result = await enablePresetPartners(ctx);
    return { enabled: true, count: result.created };
  } else {
    const result = await disablePresetPartners(ctx);
    return { enabled: false, count: result.deleted };
  }
}
