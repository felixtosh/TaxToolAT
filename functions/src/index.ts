import { initializeApp } from "firebase-admin/app";

// Initialize Firebase Admin
initializeApp();

// Export partner matching functions
export { onPartnerCreate } from "./matching/onPartnerCreate";
export { matchPartners } from "./matching/matchPartners";
export { learnPartnerPatterns } from "./matching/learnPartnerPatterns";
export { searchExternalPartners } from "./matching/searchExternalPartners";

// Export category matching functions
export { matchCategories } from "./matching/matchCategories";
export { onCategoryCreate } from "./matching/onCategoryCreate";

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

// Export file-transaction matching functions
export { matchFileTransactions } from "./matching/matchFileTransactions";
export { matchFilesForPartner } from "./matching/matchFilesForPartner";

// Export AI helper functions
export { generateFileSearchQuery } from "./ai/generateFileSearchQuery";
export { lookupCompany } from "./ai/lookupCompany";
