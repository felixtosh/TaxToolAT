"use strict";
/**
 * Create a new source (bank account)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSourceCallable = void 0;
const firestore_1 = require("firebase-admin/firestore");
const createCallable_1 = require("../utils/createCallable");
/**
 * Normalize IBAN by removing spaces and converting to uppercase
 */
function normalizeIban(iban) {
    return iban.replace(/\s/g, "").toUpperCase();
}
exports.createSourceCallable = (0, createCallable_1.createCallable)({ name: "createSource" }, async (ctx, request) => {
    const { data } = request;
    if (!data?.name?.trim()) {
        throw new createCallable_1.HttpsError("invalid-argument", "Source name is required");
    }
    if (!data.currency) {
        throw new createCallable_1.HttpsError("invalid-argument", "Currency is required");
    }
    const now = firestore_1.Timestamp.now();
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
});
//# sourceMappingURL=createSource.js.map