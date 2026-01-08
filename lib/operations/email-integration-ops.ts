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
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import {
  EmailIntegration,
  CreateEmailIntegrationData,
  EmailSearchPattern,
} from "@/types/email-integration";
import { OperationsContext } from "./types";

const INTEGRATIONS_COLLECTION = "emailIntegrations";

/**
 * List all active email integrations for the current user
 */
export async function listEmailIntegrations(
  ctx: OperationsContext
): Promise<EmailIntegration[]> {
  const q = query(
    collection(ctx.db, INTEGRATIONS_COLLECTION),
    where("userId", "==", ctx.userId),
    where("isActive", "==", true),
    orderBy("createdAt", "desc")
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as EmailIntegration[];
}

/**
 * Get a single email integration by ID
 */
export async function getEmailIntegration(
  ctx: OperationsContext,
  integrationId: string
): Promise<EmailIntegration | null> {
  const docRef = doc(ctx.db, INTEGRATIONS_COLLECTION, integrationId);
  const snapshot = await getDoc(docRef);

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data();
  // Verify ownership
  if (data.userId !== ctx.userId) {
    return null;
  }

  return { id: snapshot.id, ...data } as EmailIntegration;
}

/**
 * Get email integration by email address (to prevent duplicates)
 */
export async function getEmailIntegrationByEmail(
  ctx: OperationsContext,
  email: string
): Promise<EmailIntegration | null> {
  const q = query(
    collection(ctx.db, INTEGRATIONS_COLLECTION),
    where("userId", "==", ctx.userId),
    where("email", "==", email.toLowerCase()),
    where("isActive", "==", true)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() } as EmailIntegration;
}

/**
 * Create a new email integration after successful OAuth
 */
export async function createEmailIntegration(
  ctx: OperationsContext,
  data: CreateEmailIntegrationData
): Promise<string> {
  // Check if this email is already connected
  const existing = await getEmailIntegrationByEmail(ctx, data.email);
  if (existing) {
    throw new Error(`Email ${data.email} is already connected`);
  }

  const now = Timestamp.now();
  const newIntegration = {
    userId: ctx.userId,
    provider: data.provider,
    email: data.email.toLowerCase(),
    displayName: data.displayName || null,
    accountId: data.accountId,
    tokenExpiresAt: Timestamp.fromDate(data.expiresAt),
    lastAccessedAt: null,
    isActive: true,
    needsReauth: false,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };

  const docRef = await addDoc(
    collection(ctx.db, INTEGRATIONS_COLLECTION),
    newIntegration
  );
  return docRef.id;
}

/**
 * Update an email integration
 */
export async function updateEmailIntegration(
  ctx: OperationsContext,
  integrationId: string,
  updates: Partial<
    Pick<
      EmailIntegration,
      | "displayName"
      | "tokenExpiresAt"
      | "lastAccessedAt"
      | "needsReauth"
      | "lastError"
    >
  >
): Promise<void> {
  // Verify ownership first
  const existing = await getEmailIntegration(ctx, integrationId);
  if (!existing) {
    throw new Error("Email integration not found");
  }

  const docRef = doc(ctx.db, INTEGRATIONS_COLLECTION, integrationId);
  await updateDoc(docRef, {
    ...updates,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Mark integration as accessed (updates lastAccessedAt)
 */
export async function markIntegrationAccessed(
  ctx: OperationsContext,
  integrationId: string
): Promise<void> {
  const docRef = doc(ctx.db, INTEGRATIONS_COLLECTION, integrationId);
  await updateDoc(docRef, {
    lastAccessedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

/**
 * Mark integration as needing re-authentication
 */
export async function markIntegrationNeedsReauth(
  ctx: OperationsContext,
  integrationId: string,
  error?: string
): Promise<void> {
  const docRef = doc(ctx.db, INTEGRATIONS_COLLECTION, integrationId);
  await updateDoc(docRef, {
    needsReauth: true,
    lastError: error || "Authentication expired",
    updatedAt: Timestamp.now(),
  });
}

/**
 * Clear re-auth flag after successful token refresh
 */
export async function clearIntegrationReauthFlag(
  ctx: OperationsContext,
  integrationId: string,
  newExpiresAt: Date
): Promise<void> {
  const docRef = doc(ctx.db, INTEGRATIONS_COLLECTION, integrationId);
  await updateDoc(docRef, {
    needsReauth: false,
    lastError: null,
    tokenExpiresAt: Timestamp.fromDate(newExpiresAt),
    updatedAt: Timestamp.now(),
  });
}

/**
 * Soft-delete an email integration
 */
export async function deleteEmailIntegration(
  ctx: OperationsContext,
  integrationId: string
): Promise<void> {
  // Verify ownership first
  const existing = await getEmailIntegration(ctx, integrationId);
  if (!existing) {
    throw new Error("Email integration not found");
  }

  const docRef = doc(ctx.db, INTEGRATIONS_COLLECTION, integrationId);
  await updateDoc(docRef, {
    isActive: false,
    updatedAt: Timestamp.now(),
  });
}

// ============================================================================
// Partner Email Search Pattern Operations
// ============================================================================

const PARTNERS_COLLECTION = "partners";

/**
 * Add an email search pattern to a partner
 */
export async function addEmailPatternToPartner(
  ctx: OperationsContext,
  partnerId: string,
  pattern: Omit<
    EmailSearchPattern,
    "createdAt" | "lastUsedAt" | "usageCount" | "sourceTransactionIds"
  > & {
    sourceTransactionId?: string;
  }
): Promise<void> {
  const partnerRef = doc(ctx.db, PARTNERS_COLLECTION, partnerId);
  const partnerSnap = await getDoc(partnerRef);

  if (!partnerSnap.exists()) {
    throw new Error("Partner not found");
  }

  const partnerData = partnerSnap.data();
  if (partnerData.userId !== ctx.userId) {
    throw new Error("Partner not found");
  }

  const now = Timestamp.now();
  const newPattern: EmailSearchPattern = {
    pattern: pattern.pattern,
    integrationIds: pattern.integrationIds,
    confidence: pattern.confidence,
    usageCount: 1,
    sourceTransactionIds: pattern.sourceTransactionId
      ? [pattern.sourceTransactionId]
      : [],
    createdAt: now,
    lastUsedAt: now,
  };

  // Check if similar pattern already exists
  const existingPatterns =
    (partnerData.emailSearchPatterns as EmailSearchPattern[]) || [];
  const existingIndex = existingPatterns.findIndex(
    (p) => p.pattern.toLowerCase() === pattern.pattern.toLowerCase()
  );

  if (existingIndex >= 0) {
    // Update existing pattern
    const existing = existingPatterns[existingIndex];
    existingPatterns[existingIndex] = {
      ...existing,
      usageCount: existing.usageCount + 1,
      lastUsedAt: now,
      confidence: Math.min(100, existing.confidence + 5), // Boost confidence
      sourceTransactionIds: pattern.sourceTransactionId
        ? [...new Set([...existing.sourceTransactionIds, pattern.sourceTransactionId])]
        : existing.sourceTransactionIds,
      integrationIds: [
        ...new Set([...existing.integrationIds, ...pattern.integrationIds]),
      ],
    };

    await updateDoc(partnerRef, {
      emailSearchPatterns: existingPatterns,
      emailPatternsUpdatedAt: now,
      updatedAt: now,
    });
  } else {
    // Add new pattern
    await updateDoc(partnerRef, {
      emailSearchPatterns: arrayUnion(newPattern),
      emailPatternsUpdatedAt: now,
      updatedAt: now,
    });
  }
}

/**
 * Update usage stats for an email search pattern
 */
export async function updateEmailPatternUsage(
  ctx: OperationsContext,
  partnerId: string,
  patternIndex: number,
  transactionId?: string
): Promise<void> {
  const partnerRef = doc(ctx.db, PARTNERS_COLLECTION, partnerId);
  const partnerSnap = await getDoc(partnerRef);

  if (!partnerSnap.exists()) {
    throw new Error("Partner not found");
  }

  const partnerData = partnerSnap.data();
  if (partnerData.userId !== ctx.userId) {
    throw new Error("Partner not found");
  }

  const patterns =
    (partnerData.emailSearchPatterns as EmailSearchPattern[]) || [];
  if (patternIndex < 0 || patternIndex >= patterns.length) {
    throw new Error("Pattern not found");
  }

  const now = Timestamp.now();
  const pattern = patterns[patternIndex];
  patterns[patternIndex] = {
    ...pattern,
    usageCount: pattern.usageCount + 1,
    lastUsedAt: now,
    confidence: Math.min(100, pattern.confidence + 2),
    sourceTransactionIds: transactionId
      ? [...new Set([...pattern.sourceTransactionIds, transactionId])]
      : pattern.sourceTransactionIds,
  };

  await updateDoc(partnerRef, {
    emailSearchPatterns: patterns,
    emailPatternsUpdatedAt: now,
    updatedAt: now,
  });
}

/**
 * Remove an email search pattern from a partner
 */
export async function removeEmailPatternFromPartner(
  ctx: OperationsContext,
  partnerId: string,
  patternIndex: number
): Promise<void> {
  const partnerRef = doc(ctx.db, PARTNERS_COLLECTION, partnerId);
  const partnerSnap = await getDoc(partnerRef);

  if (!partnerSnap.exists()) {
    throw new Error("Partner not found");
  }

  const partnerData = partnerSnap.data();
  if (partnerData.userId !== ctx.userId) {
    throw new Error("Partner not found");
  }

  const patterns =
    (partnerData.emailSearchPatterns as EmailSearchPattern[]) || [];
  if (patternIndex < 0 || patternIndex >= patterns.length) {
    throw new Error("Pattern not found");
  }

  // Remove the pattern at the specified index
  patterns.splice(patternIndex, 1);

  await updateDoc(partnerRef, {
    emailSearchPatterns: patterns,
    emailPatternsUpdatedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

/**
 * Get email search patterns for a partner
 */
export async function getEmailPatternsForPartner(
  ctx: OperationsContext,
  partnerId: string
): Promise<EmailSearchPattern[]> {
  const partnerRef = doc(ctx.db, PARTNERS_COLLECTION, partnerId);
  const partnerSnap = await getDoc(partnerRef);

  if (!partnerSnap.exists()) {
    return [];
  }

  const partnerData = partnerSnap.data();
  if (partnerData.userId !== ctx.userId) {
    return [];
  }

  return (partnerData.emailSearchPatterns as EmailSearchPattern[]) || [];
}

/**
 * Remove email patterns that reference a specific integration
 * (Called when an integration is disconnected)
 */
export async function removeIntegrationFromPatterns(
  ctx: OperationsContext,
  integrationId: string
): Promise<void> {
  // Get all user's partners with email patterns
  const q = query(
    collection(ctx.db, PARTNERS_COLLECTION),
    where("userId", "==", ctx.userId)
  );

  const snapshot = await getDocs(q);
  const now = Timestamp.now();

  for (const partnerDoc of snapshot.docs) {
    const data = partnerDoc.data();
    const patterns = (data.emailSearchPatterns as EmailSearchPattern[]) || [];

    if (patterns.length === 0) continue;

    // Filter out the integration ID and remove patterns with no integrations left
    const updatedPatterns = patterns
      .map((p) => ({
        ...p,
        integrationIds: p.integrationIds.filter((id) => id !== integrationId),
      }))
      .filter((p) => p.integrationIds.length > 0);

    if (updatedPatterns.length !== patterns.length) {
      await updateDoc(partnerDoc.ref, {
        emailSearchPatterns: updatedPatterns,
        emailPatternsUpdatedAt: now,
        updatedAt: now,
      });
    }
  }
}
