"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listAdmins = exports.beforeUserCreatedHandler = exports.setAdminClaim = void 0;
const https_1 = require("firebase-functions/v2/https");
const identity_1 = require("firebase-functions/v2/identity");
const auth_1 = require("firebase-admin/auth");
const SUPER_ADMIN_EMAIL = "felix@i7v6.com";
/**
 * Callable function to set admin claim on a user
 * Only callable by existing admins or the super admin
 */
exports.setAdminClaim = (0, https_1.onCall)({
    region: "europe-west1",
}, async (request) => {
    const { targetUid, isAdmin } = request.data;
    // Verify caller is authenticated
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be logged in");
    }
    // Verify caller is admin or super admin
    const callerEmail = request.auth.token.email;
    const callerIsAdmin = request.auth.token.admin === true;
    if (!callerIsAdmin && callerEmail !== SUPER_ADMIN_EMAIL) {
        throw new https_1.HttpsError("permission-denied", "Only admins can modify admin claims");
    }
    if (!targetUid || typeof isAdmin !== "boolean") {
        throw new https_1.HttpsError("invalid-argument", "targetUid and isAdmin are required");
    }
    try {
        const auth = (0, auth_1.getAuth)();
        await auth.setCustomUserClaims(targetUid, { admin: isAdmin });
        // Get the user to return their email
        const targetUser = await auth.getUser(targetUid);
        console.log(`Admin claim set to ${isAdmin} for user ${targetUser.email} by ${callerEmail}`);
        return {
            success: true,
            targetEmail: targetUser.email,
            isAdmin,
        };
    }
    catch (error) {
        console.error("Error setting admin claim:", error);
        throw new https_1.HttpsError("internal", "Failed to set admin claim");
    }
});
/**
 * Blocking function that runs before user creation
 * Auto-sets admin claim for super admin
 */
exports.beforeUserCreatedHandler = (0, identity_1.beforeUserCreated)({
    region: "europe-west1",
}, async (event) => {
    const user = event.data;
    // Auto-set admin for super admin email
    if (user?.email === SUPER_ADMIN_EMAIL) {
        console.log(`Setting admin claim for super admin: ${user.email}`);
        return {
            customClaims: {
                admin: true,
            },
        };
    }
    return {};
});
/**
 * Get list of all admin users
 * Only callable by admins
 */
exports.listAdmins = (0, https_1.onCall)({
    region: "europe-west1",
}, async (request) => {
    // Verify caller is admin
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be logged in");
    }
    const callerEmail = request.auth.token.email;
    const callerIsAdmin = request.auth.token.admin === true;
    if (!callerIsAdmin && callerEmail !== SUPER_ADMIN_EMAIL) {
        throw new https_1.HttpsError("permission-denied", "Only admins can list admins");
    }
    try {
        const auth = (0, auth_1.getAuth)();
        const listResult = await auth.listUsers(1000);
        const admins = listResult.users
            .filter((user) => user.customClaims?.admin === true)
            .map((user) => ({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            isSuperAdmin: user.email === SUPER_ADMIN_EMAIL,
        }));
        return { admins };
    }
    catch (error) {
        console.error("Error listing admins:", error);
        throw new https_1.HttpsError("internal", "Failed to list admins");
    }
});
//# sourceMappingURL=setAdminClaim.js.map