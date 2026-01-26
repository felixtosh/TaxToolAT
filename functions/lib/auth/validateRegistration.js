"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markInviteUsed = exports.validateRegistration = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const db = (0, firestore_1.getFirestore)();
const SUPER_ADMIN_EMAIL = "felix@i7v6.com";
/**
 * Callable function to check if an email is allowed to register
 * This is called BEFORE createUserWithEmailAndPassword
 *
 * Returns { allowed: boolean, reason?: string }
 */
exports.validateRegistration = (0, https_1.onCall)({
    region: "europe-west1",
    cors: [
        "https://fibuki.com",
        "https://taxstudio-f12fb.firebaseapp.com",
        "http://localhost:3000",
    ],
}, async (request) => {
    const { email } = request.data;
    if (!email || typeof email !== "string") {
        throw new https_1.HttpsError("invalid-argument", "Email is required");
    }
    const normalizedEmail = email.toLowerCase().trim();
    // Super admin is always allowed
    if (normalizedEmail === SUPER_ADMIN_EMAIL) {
        return { allowed: true, reason: "Super admin" };
    }
    try {
        // Check allowedEmails collection
        const allowedQuery = await db
            .collection("allowedEmails")
            .where("email", "==", normalizedEmail)
            .limit(1)
            .get();
        if (allowedQuery.empty) {
            return {
                allowed: false,
                reason: "Email not found in invite list. Please request an invite from an admin.",
            };
        }
        const inviteDoc = allowedQuery.docs[0];
        const inviteData = inviteDoc.data();
        // Check if already used
        if (inviteData.usedAt) {
            return {
                allowed: false,
                reason: "This invite has already been used.",
            };
        }
        return { allowed: true };
    }
    catch (error) {
        console.error("Error validating registration:", error);
        throw new https_1.HttpsError("internal", "Failed to validate registration");
    }
});
/**
 * Mark an invite as used after successful registration
 * Called after user creation
 */
exports.markInviteUsed = (0, https_1.onCall)({
    region: "europe-west1",
    cors: [
        "https://fibuki.com",
        "https://taxstudio-f12fb.firebaseapp.com",
        "http://localhost:3000",
    ],
}, async (request) => {
    // This should only be called by authenticated users (just registered)
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be logged in");
    }
    const email = request.auth.token.email;
    if (!email) {
        throw new https_1.HttpsError("invalid-argument", "User has no email");
    }
    const normalizedEmail = email.toLowerCase().trim();
    // Super admin doesn't have an invite to mark
    if (normalizedEmail === SUPER_ADMIN_EMAIL) {
        return { success: true };
    }
    try {
        const allowedQuery = await db
            .collection("allowedEmails")
            .where("email", "==", normalizedEmail)
            .limit(1)
            .get();
        if (!allowedQuery.empty) {
            const inviteDoc = allowedQuery.docs[0];
            await inviteDoc.ref.update({
                usedAt: new Date(),
                registeredUserId: request.auth.uid,
            });
        }
        return { success: true };
    }
    catch (error) {
        console.error("Error marking invite used:", error);
        throw new https_1.HttpsError("internal", "Failed to mark invite used");
    }
});
//# sourceMappingURL=validateRegistration.js.map