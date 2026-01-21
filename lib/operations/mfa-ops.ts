import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  onSnapshot,
  Unsubscribe,
} from "firebase/firestore";
import {
  MfaSettings,
  MfaStatusResponse,
  PasskeyCredential,
} from "@/types/mfa";
import { OperationsContext } from "./types";

// Collection paths (subcollections under users/{userId})
const getMfaSettingsPath = (userId: string) =>
  `users/${userId}/mfaSettings`;
const getPasskeysPath = (userId: string) =>
  `users/${userId}/passkeys`;
const getBackupCodesPath = (userId: string) =>
  `users/${userId}/backupCodes`;

// ============ MFA Settings ============

/**
 * Get MFA settings for the current user
 */
export async function getMfaSettings(
  ctx: OperationsContext
): Promise<MfaSettings | null> {
  const docRef = doc(ctx.db, getMfaSettingsPath(ctx.userId), "config");
  const snapshot = await getDoc(docRef);

  if (!snapshot.exists()) return null;

  return { ...snapshot.data() } as MfaSettings;
}

/**
 * Subscribe to MFA settings changes (realtime)
 */
export function subscribeMfaSettings(
  ctx: OperationsContext,
  callback: (settings: MfaSettings | null) => void
): Unsubscribe {
  const docRef = doc(ctx.db, getMfaSettingsPath(ctx.userId), "config");

  return onSnapshot(docRef, (snapshot) => {
    if (!snapshot.exists()) {
      callback(null);
      return;
    }
    callback({ ...snapshot.data() } as MfaSettings);
  });
}

/**
 * Initialize MFA settings for a user (creates default settings if none exist)
 */
export async function initializeMfaSettings(
  ctx: OperationsContext
): Promise<MfaSettings> {
  const existing = await getMfaSettings(ctx);
  if (existing) return existing;

  const now = Timestamp.now();
  const settings: MfaSettings = {
    userId: ctx.userId,
    totpEnabled: false,
    passkeysEnabled: false,
    backupCodesGenerated: false,
    backupCodesRemaining: 0,
    createdAt: now,
    updatedAt: now,
  };

  const docRef = doc(ctx.db, getMfaSettingsPath(ctx.userId), "config");
  await setDoc(docRef, settings);

  return settings;
}

/**
 * Update MFA settings
 */
export async function updateMfaSettings(
  ctx: OperationsContext,
  updates: Partial<
    Pick<
      MfaSettings,
      | "totpEnabled"
      | "totpFactorId"
      | "totpEnrolledAt"
      | "passkeysEnabled"
      | "backupCodesGenerated"
      | "backupCodesGeneratedAt"
      | "backupCodesRemaining"
    >
  >
): Promise<void> {
  const docRef = doc(ctx.db, getMfaSettingsPath(ctx.userId), "config");

  await updateDoc(docRef, {
    ...updates,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Check if user has any MFA enabled
 */
export async function hasMfaEnabled(ctx: OperationsContext): Promise<boolean> {
  const settings = await getMfaSettings(ctx);
  if (!settings) return false;

  return settings.totpEnabled || settings.passkeysEnabled;
}

// ============ Passkeys ============

/**
 * List all passkeys for the current user
 */
export async function listPasskeys(
  ctx: OperationsContext
): Promise<PasskeyCredential[]> {
  const q = query(
    collection(ctx.db, getPasskeysPath(ctx.userId)),
    where("userId", "==", ctx.userId)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as PasskeyCredential[];
}

/**
 * Subscribe to passkeys changes (realtime)
 */
export function subscribePasskeys(
  ctx: OperationsContext,
  callback: (passkeys: PasskeyCredential[]) => void
): Unsubscribe {
  const q = query(
    collection(ctx.db, getPasskeysPath(ctx.userId)),
    where("userId", "==", ctx.userId)
  );

  return onSnapshot(q, (snapshot) => {
    const passkeys = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as PasskeyCredential[];
    callback(passkeys);
  });
}

/**
 * Get a passkey by credential ID
 */
export async function getPasskeyByCredentialId(
  ctx: OperationsContext,
  credentialId: string
): Promise<PasskeyCredential | null> {
  const q = query(
    collection(ctx.db, getPasskeysPath(ctx.userId)),
    where("credentialId", "==", credentialId)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;

  return {
    id: snapshot.docs[0].id,
    ...snapshot.docs[0].data(),
  } as PasskeyCredential;
}

/**
 * Update passkey last used timestamp
 */
export async function updatePasskeyLastUsed(
  ctx: OperationsContext,
  passkeyId: string,
  counter: number
): Promise<void> {
  const docRef = doc(ctx.db, getPasskeysPath(ctx.userId), passkeyId);

  await updateDoc(docRef, {
    lastUsedAt: Timestamp.now(),
    counter,
  });
}

/**
 * Delete a passkey
 * Note: This is exposed for client-side operations. The Cloud Function
 * handles the actual deletion with proper validation.
 */
export async function deletePasskey(
  ctx: OperationsContext,
  passkeyId: string
): Promise<void> {
  const docRef = doc(ctx.db, getPasskeysPath(ctx.userId), passkeyId);
  await deleteDoc(docRef);

  // Check if any passkeys remain and update settings
  const remaining = await listPasskeys(ctx);
  if (remaining.length === 0) {
    await updateMfaSettings(ctx, { passkeysEnabled: false });
  }
}

// ============ Backup Codes ============

/**
 * Get count of remaining (unused) backup codes
 */
export async function getBackupCodesRemaining(
  ctx: OperationsContext
): Promise<number> {
  const q = query(
    collection(ctx.db, getBackupCodesPath(ctx.userId)),
    where("userId", "==", ctx.userId),
    where("used", "==", false)
  );

  const snapshot = await getDocs(q);
  return snapshot.size;
}

// ============ MFA Status (Composite) ============

/**
 * Get comprehensive MFA status for current user
 * Combines settings, passkeys, and backup codes info
 */
export async function getMfaStatus(
  ctx: OperationsContext
): Promise<MfaStatusResponse> {
  const [settings, passkeys, backupCodesRemaining] = await Promise.all([
    getMfaSettings(ctx),
    listPasskeys(ctx),
    getBackupCodesRemaining(ctx),
  ]);

  return {
    totpEnabled: settings?.totpEnabled ?? false,
    passkeysEnabled: settings?.passkeysEnabled ?? false,
    passkeyCount: passkeys.length,
    passkeys: passkeys.map((p) => ({
      id: p.id,
      deviceName: p.deviceName,
      createdAt: p.createdAt,
      lastUsedAt: p.lastUsedAt,
    })),
    backupCodesRemaining,
    hasAnyMfa:
      (settings?.totpEnabled ?? false) ||
      (settings?.passkeysEnabled ?? false) ||
      passkeys.length > 0,
  };
}

// ============ Admin Operations ============

/**
 * Reset MFA for a user (admin only)
 * This should be called through a Cloud Function that validates admin permissions.
 * The operations layer provides the data access logic.
 */
export async function adminResetMfaData(
  ctx: OperationsContext,
  targetUserId: string
): Promise<void> {
  // Delete all passkeys
  const passkeysQuery = query(
    collection(ctx.db, getPasskeysPath(targetUserId)),
    where("userId", "==", targetUserId)
  );
  const passkeysSnapshot = await getDocs(passkeysQuery);
  for (const passkey of passkeysSnapshot.docs) {
    await deleteDoc(passkey.ref);
  }

  // Delete all backup codes
  const codesQuery = query(
    collection(ctx.db, getBackupCodesPath(targetUserId)),
    where("userId", "==", targetUserId)
  );
  const codesSnapshot = await getDocs(codesQuery);
  for (const code of codesSnapshot.docs) {
    await deleteDoc(code.ref);
  }

  // Reset MFA settings
  const settingsRef = doc(ctx.db, getMfaSettingsPath(targetUserId), "config");
  await updateDoc(settingsRef, {
    totpEnabled: false,
    totpFactorId: null,
    totpEnrolledAt: null,
    passkeysEnabled: false,
    backupCodesGenerated: false,
    backupCodesGeneratedAt: null,
    backupCodesRemaining: 0,
    updatedAt: Timestamp.now(),
  });
}
