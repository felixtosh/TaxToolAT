"use strict";
/**
 * Callable Cloud Function for scoring attachment matches
 * Used by both UI (via callable) and automation (direct import)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreAttachmentMatchCallable = void 0;
const https_1 = require("firebase-functions/v2/https");
const scoreAttachmentMatch_1 = require("./scoreAttachmentMatch");
/**
 * Score multiple attachments against a transaction
 * Batched for efficiency - score all attachments in one call
 */
exports.scoreAttachmentMatchCallable = (0, https_1.onCall)({
    region: "europe-west1",
    memory: "256MiB",
}, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be authenticated");
    }
    const { attachments, transaction, partner } = request.data;
    if (!attachments || !Array.isArray(attachments)) {
        throw new https_1.HttpsError("invalid-argument", "Attachments array is required");
    }
    const transactionDate = transaction?.date ? new Date(transaction.date) : null;
    const scores = attachments.map((att) => {
        const input = {
            filename: att.filename,
            mimeType: att.mimeType,
            // Email context
            emailSubject: att.emailSubject,
            emailFrom: att.emailFrom,
            emailSnippet: att.emailSnippet,
            emailBodyText: att.emailBodyText,
            emailDate: att.emailDate ? new Date(att.emailDate) : null,
            integrationId: att.integrationId,
            // File extracted data
            fileExtractedAmount: att.fileExtractedAmount,
            fileExtractedDate: att.fileExtractedDate ? new Date(att.fileExtractedDate) : null,
            fileExtractedPartner: att.fileExtractedPartner,
            // Transaction data
            transactionAmount: transaction?.amount,
            transactionDate,
            transactionName: transaction?.name,
            transactionReference: transaction?.reference,
            // Use name as fallback for partner matching when no partner assigned
            transactionPartner: transaction?.partner || transaction?.name,
            // Partner data
            partnerName: partner?.name,
            partnerEmailDomains: partner?.emailDomains,
            partnerFileSourcePatterns: partner?.fileSourcePatterns,
            // Explicit partner IDs for connected partner matching
            filePartnerId: att.filePartnerId,
            transactionPartnerId: transaction?.partnerId,
            // Email classification
            classification: att.classification,
        };
        const result = (0, scoreAttachmentMatch_1.scoreAttachmentMatch)(input);
        return {
            key: att.key,
            score: result.score,
            label: result.label,
            reasons: result.reasons,
        };
    });
    return { scores };
});
//# sourceMappingURL=scoreAttachmentMatchCallable.js.map