"use strict";
/**
 * Update a user partner
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateUserPartnerCallable = void 0;
const firestore_1 = require("firebase-admin/firestore");
const createCallable_1 = require("../utils/createCallable");
function normalizeIban(iban) {
    return iban.replace(/\s/g, "").toUpperCase();
}
function normalizeUrl(url) {
    let normalized = url.trim().toLowerCase();
    if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
        normalized = "https://" + normalized;
    }
    return normalized.replace(/\/+$/, "");
}
exports.updateUserPartnerCallable = (0, createCallable_1.createCallable)({ name: "updateUserPartner" }, async (ctx, request) => {
    const { partnerId, data } = request;
    if (!partnerId) {
        throw new createCallable_1.HttpsError("invalid-argument", "partnerId is required");
    }
    // Verify ownership
    const partnerRef = ctx.db.collection("partners").doc(partnerId);
    const partnerSnap = await partnerRef.get();
    if (!partnerSnap.exists) {
        throw new createCallable_1.HttpsError("not-found", "Partner not found");
    }
    if (partnerSnap.data().userId !== ctx.userId) {
        throw new createCallable_1.HttpsError("permission-denied", "Access denied");
    }
    // Build update object
    const updates = {
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
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
});
//# sourceMappingURL=updateUserPartner.js.map