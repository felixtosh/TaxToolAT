import { initializeApp } from "firebase-admin/app";

// Initialize Firebase Admin
initializeApp();

// Export partner matching functions
export { onPartnerCreate } from "./matching/onPartnerCreate";
export { onPartnerUpdate } from "./matching/onPartnerUpdate";
export { matchPartners } from "./matching/matchPartners";
export { learnPartnerPatterns } from "./matching/learnPartnerPatterns";
export { searchExternalPartners } from "./matching/searchExternalPartners";

// Export category matching functions
export { matchCategories } from "./matching/matchCategories";
export { onCategoryCreate } from "./matching/onCategoryCreate";
export { onCategoryUpdate } from "./matching/onCategoryUpdate";
export { onTransactionPartnerChange } from "./matching/onTransactionPartnerChange";

// Export user data update trigger (re-calculates file counterparties)
export { onUserDataUpdate } from "./matching/onUserDataUpdate";

// Export learning queue functions
export {
  queuePartnerForLearning,
  processLearningQueue,
  triggerLearningNow,
} from "./matching/learningQueue";

// Export pattern application functions
export { applyPatternsToTransactions } from "./matching/applyPatterns";

// Export admin functions
export { generatePromotionCandidates } from "./admin/generatePromotionCandidates";

// Export import functions
export { matchColumns } from "./import/matchColumns";

// Export GoCardless sync functions
export {
  scheduledGoCardlessSync,
  triggerGoCardlessSync,
  sendReauthReminders,
} from "./gocardless/scheduledSync";

// Export file extraction functions
export { extractFileData } from "./extraction/extractFileData";
export { retryFileExtraction } from "./extraction/retryExtraction";

// Export file-partner matching functions
export { matchFilePartner } from "./matching/matchFilePartner";

// Export file-transaction matching functions
export { matchFileTransactions } from "./matching/matchFileTransactions";
export { matchFilesForPartner } from "./matching/matchFilesForPartner";

// Export orphaned file processing (fallback for stuck files)
export { processOrphanedFiles } from "./matching/processOrphanedFiles";

// Export AI helper functions
export { generateFileSearchQuery } from "./ai/generateFileSearchQuery";
export { lookupCompany, lookupByVatId } from "./ai/lookupCompany";

// Export Gmail sync functions
export {
  processGmailSyncQueue,
  onSyncQueueCreated,
} from "./gmail/gmailSyncQueue";
export { scheduledGmailSync } from "./gmail/scheduledGmailSync";
export { onGmailConnected } from "./gmail/onGmailConnected";
export { onTransactionsImported } from "./gmail/onTransactionsImported";

// Export precision search functions
export {
  processPrecisionSearchQueue,
  onPrecisionSearchQueueCreated,
} from "./precision-search/precisionSearchQueue";
export { onGmailSyncComplete } from "./precision-search/onGmailSyncComplete";

// Export inbound email functions
export { receiveInboundEmail, testInboundEmail } from "./email-inbound/receiveEmail";
export { resetInboundDailyLimits } from "./email-inbound/resetDailyLimits";

// Export auth functions
export {
  setAdminClaim,
  beforeUserCreatedHandler,
  listAdmins,
} from "./auth/setAdminClaim";
export { validateRegistration, markInviteUsed } from "./auth/validateRegistration";
export { migrateUserData, checkMigrationStatus } from "./auth/migrateUserData";
