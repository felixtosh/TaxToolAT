"use strict";
/**
 * Scheduled Function: Reset Daily Limits
 *
 * Runs daily at midnight (Europe/Berlin) to reset the todayCount
 * for all inbound email addresses.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetInboundDailyLimits = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("firebase-admin/firestore");
const db = (0, firestore_1.getFirestore)();
const INBOUND_ADDRESSES_COLLECTION = "inboundEmailAddresses";
/**
 * Reset daily email counts for all inbound addresses
 * Runs at 00:05 every day (Europe/Berlin timezone)
 */
exports.resetInboundDailyLimits = (0, scheduler_1.onSchedule)({
    schedule: "5 0 * * *", // 00:05 daily
    timeZone: "Europe/Berlin",
    region: "europe-west1",
}, async () => {
    console.log("[resetInboundDailyLimits] Starting daily reset");
    // Get yesterday's date (since we're running after midnight)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];
    // Find all addresses with yesterday's date (they need to be reset)
    // We could also reset all, but this is more efficient
    const snapshot = await db
        .collection(INBOUND_ADDRESSES_COLLECTION)
        .where("todayDate", "==", yesterdayStr)
        .get();
    if (snapshot.empty) {
        console.log("[resetInboundDailyLimits] No addresses need reset");
        return;
    }
    let resetCount = 0;
    const batch = db.batch();
    for (const doc of snapshot.docs) {
        batch.update(doc.ref, {
            todayCount: 0,
            todayDate: null,
        });
        resetCount++;
    }
    await batch.commit();
    console.log(`[resetInboundDailyLimits] Reset ${resetCount} addresses`);
});
//# sourceMappingURL=resetDailyLimits.js.map