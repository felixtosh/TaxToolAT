"use strict";
/**
 * Cloud Function: On User Data Update
 *
 * Triggered when user data (settings/userData) is updated.
 * Re-calculates invoice direction and counterparty for files that have
 * extractedIssuer or extractedRecipient entities.
 *
 * This ensures that when a user adds/changes their:
 * - name, companyName, aliases
 * - vatIds
 * - ibans
 * - ownEmails
 *
 * All their files are re-evaluated to correctly determine:
 * - Invoice direction (incoming vs outgoing)
 * - Which party is the counterparty (extractedPartner)
 * - Which user account was matched (matchedUserAccount)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.onUserDataUpdate = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const firestore_2 = require("firebase-admin/firestore");
const db = (0, firestore_2.getFirestore)();
// === Configuration ===
const CONFIG = {
    /** Maximum files to process per update */
    MAX_FILES_PER_UPDATE: 500,
    /** Region for the function */
    REGION: "europe-west1",
};
// === Helper Functions ===
/**
 * Check if user data matching-relevant fields changed
 */
function hasMatchingFieldsChanged(before, after) {
    // Name changed
    if (before.name !== after.name)
        return true;
    // Company name changed
    if (before.companyName !== after.companyName)
        return true;
    // Aliases changed
    if (JSON.stringify(before.aliases || []) !== JSON.stringify(after.aliases || []))
        return true;
    // VAT IDs changed
    if (JSON.stringify(before.vatIds || []) !== JSON.stringify(after.vatIds || []))
        return true;
    // IBANs changed
    if (JSON.stringify(before.ibans || []) !== JSON.stringify(after.ibans || []))
        return true;
    // Own emails changed
    if (JSON.stringify(before.ownEmails || []) !== JSON.stringify(after.ownEmails || []))
        return true;
    return false;
}
/**
 * Fetch IBANs from user's connected bank accounts (sources)
 */
async function getSourceIbans(userId) {
    try {
        const sourcesSnapshot = await db
            .collection("sources")
            .where("userId", "==", userId)
            .where("isActive", "==", true)
            .get();
        return sourcesSnapshot.docs
            .map((doc) => doc.data().iban)
            .filter((iban) => !!iban)
            .map((iban) => iban.toUpperCase().replace(/\s/g, ""));
    }
    catch (error) {
        console.warn("[SourceIbans] Failed to fetch source IBANs:", error);
        return [];
    }
}
/**
 * Check if an entity matches user data (by VAT ID, IBAN, or name/aliases)
 */
function entityMatchesUserData(entity, userData, sourceIbans) {
    if (!entity)
        return false;
    // Check VAT ID match (strongest signal)
    if (entity.vatId && userData.vatIds?.length) {
        const normalizedEntityVat = entity.vatId.toUpperCase().replace(/[^A-Z0-9]/g, "");
        for (const userVat of userData.vatIds) {
            if (userVat.toUpperCase().replace(/[^A-Z0-9]/g, "") === normalizedEntityVat) {
                return true;
            }
        }
    }
    // Check IBAN match against user's manual IBANs
    if (entity.iban && userData.ibans?.length) {
        const normalizedEntityIban = entity.iban.toUpperCase().replace(/\s/g, "");
        for (const userIban of userData.ibans) {
            if (userIban.toUpperCase().replace(/\s/g, "") === normalizedEntityIban) {
                return true;
            }
        }
    }
    // Check IBAN match against connected bank account IBANs
    if (entity.iban && sourceIbans.length) {
        const normalizedEntityIban = entity.iban.toUpperCase().replace(/\s/g, "");
        for (const sourceIban of sourceIbans) {
            if (sourceIban === normalizedEntityIban) {
                return true;
            }
        }
    }
    // Check name match (weakest signal)
    if (entity.name) {
        const entityNameLower = entity.name.toLowerCase().trim();
        if (userData.companyName) {
            const companyLower = userData.companyName.toLowerCase();
            if (entityNameLower.includes(companyLower) || companyLower.includes(entityNameLower)) {
                return true;
            }
        }
        if (userData.name) {
            const nameLower = userData.name.toLowerCase();
            if (entityNameLower.includes(nameLower) || nameLower.includes(entityNameLower)) {
                return true;
            }
        }
        for (const alias of userData.aliases || []) {
            if (alias) {
                const aliasLower = alias.toLowerCase();
                if (entityNameLower.includes(aliasLower) || aliasLower.includes(entityNameLower)) {
                    return true;
                }
            }
        }
    }
    return false;
}
/**
 * Determine the counterparty from extracted entities.
 */
function determineCounterparty(issuer, recipient, userData, sourceIbans) {
    // Check if issuer matches user data
    const issuerMatchesUser = entityMatchesUserData(issuer, userData, sourceIbans);
    // Check if recipient matches user data
    const recipientMatchesUser = entityMatchesUserData(recipient, userData, sourceIbans);
    if (issuerMatchesUser && !recipientMatchesUser) {
        // User is the issuer → outgoing invoice → recipient is counterparty
        return {
            counterparty: recipient,
            matchedUserAccount: "issuer",
            invoiceDirection: "outgoing",
        };
    }
    if (recipientMatchesUser && !issuerMatchesUser) {
        // User is the recipient → incoming invoice → issuer is counterparty
        return {
            counterparty: issuer,
            matchedUserAccount: "recipient",
            invoiceDirection: "incoming",
        };
    }
    if (issuerMatchesUser && recipientMatchesUser) {
        // Both match - internal transfer/self-invoice
        return {
            counterparty: recipient,
            matchedUserAccount: "issuer",
            invoiceDirection: "outgoing",
        };
    }
    // Neither matches - default to issuer
    return {
        counterparty: issuer,
        matchedUserAccount: null,
        invoiceDirection: "unknown",
    };
}
// === Main Function ===
exports.onUserDataUpdate = (0, firestore_1.onDocumentUpdated)({
    document: "users/{userId}/settings/userData",
    region: CONFIG.REGION,
    memory: "512MiB",
    timeoutSeconds: 300,
}, async (event) => {
    const userId = event.params.userId;
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    if (!beforeData || !afterData) {
        console.log(`[onUserDataUpdate] No data for user ${userId}`);
        return;
    }
    // Check if matching-relevant fields changed
    if (!hasMatchingFieldsChanged(beforeData, afterData)) {
        console.log(`[onUserDataUpdate] No matching-relevant fields changed for user ${userId}`);
        return;
    }
    console.log(`[onUserDataUpdate] User data changed for ${userId}, re-calculating files...`);
    const userData = afterData;
    // Fetch source IBANs
    const sourceIbans = await getSourceIbans(userId);
    console.log(`[onUserDataUpdate] Found ${sourceIbans.length} source IBANs`);
    // Find files that have extracted entities
    // Note: We query all extracted files and filter isNotInvoice client-side
    // because isNotInvoice can be false, null, or undefined (undefined = not an invoice marker)
    const filesSnapshot = await db
        .collection("files")
        .where("userId", "==", userId)
        .where("extractionComplete", "==", true)
        .limit(CONFIG.MAX_FILES_PER_UPDATE)
        .get();
    // Filter out files marked as not invoice (client-side filter)
    const invoiceFiles = filesSnapshot.docs.filter((doc) => {
        const data = doc.data();
        return data.isNotInvoice !== true; // Include false, null, undefined
    });
    console.log(`[onUserDataUpdate] Found ${invoiceFiles.length} invoice files to check (${filesSnapshot.size - invoiceFiles.length} non-invoices skipped)`);
    let updatedCount = 0;
    let skippedCount = 0;
    // Process files in batches
    const batch = db.batch();
    const MAX_BATCH_SIZE = 500;
    let batchCount = 0;
    for (const fileDoc of invoiceFiles) {
        const fileData = fileDoc.data();
        // Skip files without extracted entities (can't re-calculate)
        const issuer = fileData.extractedIssuer;
        const recipient = fileData.extractedRecipient;
        if (!issuer && !recipient) {
            skippedCount++;
            continue;
        }
        // Determine new counterparty
        const result = determineCounterparty(issuer, recipient, userData, sourceIbans);
        // Check if anything changed
        const currentDirection = fileData.invoiceDirection;
        const currentMatchedAccount = fileData.matchedUserAccount;
        const currentPartner = fileData.extractedPartner;
        if (result.invoiceDirection === currentDirection &&
            result.matchedUserAccount === currentMatchedAccount &&
            result.counterparty?.name === currentPartner) {
            skippedCount++;
            continue;
        }
        // Update file
        const updateData = {
            invoiceDirection: result.invoiceDirection,
            matchedUserAccount: result.matchedUserAccount,
            updatedAt: firestore_2.Timestamp.now(),
        };
        // Update partner fields from counterparty
        if (result.counterparty) {
            updateData.extractedPartner = result.counterparty.name;
            updateData.extractedVatId = result.counterparty.vatId;
            updateData.extractedIban = result.counterparty.iban;
            updateData.extractedAddress = result.counterparty.address;
            updateData.extractedWebsite = result.counterparty.website;
        }
        batch.update(fileDoc.ref, updateData);
        updatedCount++;
        batchCount++;
        // Commit batch if full
        if (batchCount >= MAX_BATCH_SIZE) {
            await batch.commit();
            batchCount = 0;
        }
    }
    // Commit remaining updates
    if (batchCount > 0) {
        await batch.commit();
    }
    console.log(`[onUserDataUpdate] Complete: updated ${updatedCount} files, skipped ${skippedCount} files`);
});
//# sourceMappingURL=onUserDataUpdate.js.map