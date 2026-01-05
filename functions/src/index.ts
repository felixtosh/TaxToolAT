import { initializeApp } from "firebase-admin/app";

// Initialize Firebase Admin
initializeApp();

// Export partner matching functions
export { onTransactionCreate } from "./matching/onTransactionCreate";
export { onPartnerCreate } from "./matching/onPartnerCreate";
export { matchPartners } from "./matching/matchPartners";
export { searchExternalPartners } from "./matching/searchExternalPartners";

// Export admin functions
export { generatePromotionCandidates } from "./admin/generatePromotionCandidates";
