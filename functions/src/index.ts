import { initializeApp } from "firebase-admin/app";

// Initialize Firebase Admin
initializeApp();

// Export partner matching functions
export { onPartnerCreate } from "./matching/onPartnerCreate";
export { matchPartners } from "./matching/matchPartners";
export { learnPartnerPatterns } from "./matching/learnPartnerPatterns";
export { searchExternalPartners } from "./matching/searchExternalPartners";

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
