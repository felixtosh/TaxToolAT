"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onGmailSyncComplete = exports.onPrecisionSearchQueueCreated = exports.processPrecisionSearchQueue = exports.onTransactionsImported = exports.onGmailConnected = exports.scheduledGmailSync = exports.onSyncQueueCreated = exports.processGmailSyncQueue = exports.lookupByVatId = exports.lookupCompany = exports.generateFileSearchQuery = exports.processOrphanedFiles = exports.matchFilesForPartner = exports.matchFileTransactions = exports.matchFilePartner = exports.retryFileExtraction = exports.extractFileData = exports.sendReauthReminders = exports.triggerGoCardlessSync = exports.scheduledGoCardlessSync = exports.matchColumns = exports.generatePromotionCandidates = exports.applyPatternsToTransactions = exports.triggerLearningNow = exports.processLearningQueue = exports.queuePartnerForLearning = exports.onUserDataUpdate = exports.onTransactionPartnerChange = exports.onCategoryUpdate = exports.onCategoryCreate = exports.matchCategories = exports.searchExternalPartners = exports.learnPartnerPatterns = exports.matchPartners = exports.onPartnerUpdate = exports.onPartnerCreate = void 0;
const app_1 = require("firebase-admin/app");
// Initialize Firebase Admin
(0, app_1.initializeApp)();
// Export partner matching functions
var onPartnerCreate_1 = require("./matching/onPartnerCreate");
Object.defineProperty(exports, "onPartnerCreate", { enumerable: true, get: function () { return onPartnerCreate_1.onPartnerCreate; } });
var onPartnerUpdate_1 = require("./matching/onPartnerUpdate");
Object.defineProperty(exports, "onPartnerUpdate", { enumerable: true, get: function () { return onPartnerUpdate_1.onPartnerUpdate; } });
var matchPartners_1 = require("./matching/matchPartners");
Object.defineProperty(exports, "matchPartners", { enumerable: true, get: function () { return matchPartners_1.matchPartners; } });
var learnPartnerPatterns_1 = require("./matching/learnPartnerPatterns");
Object.defineProperty(exports, "learnPartnerPatterns", { enumerable: true, get: function () { return learnPartnerPatterns_1.learnPartnerPatterns; } });
var searchExternalPartners_1 = require("./matching/searchExternalPartners");
Object.defineProperty(exports, "searchExternalPartners", { enumerable: true, get: function () { return searchExternalPartners_1.searchExternalPartners; } });
// Export category matching functions
var matchCategories_1 = require("./matching/matchCategories");
Object.defineProperty(exports, "matchCategories", { enumerable: true, get: function () { return matchCategories_1.matchCategories; } });
var onCategoryCreate_1 = require("./matching/onCategoryCreate");
Object.defineProperty(exports, "onCategoryCreate", { enumerable: true, get: function () { return onCategoryCreate_1.onCategoryCreate; } });
var onCategoryUpdate_1 = require("./matching/onCategoryUpdate");
Object.defineProperty(exports, "onCategoryUpdate", { enumerable: true, get: function () { return onCategoryUpdate_1.onCategoryUpdate; } });
var onTransactionPartnerChange_1 = require("./matching/onTransactionPartnerChange");
Object.defineProperty(exports, "onTransactionPartnerChange", { enumerable: true, get: function () { return onTransactionPartnerChange_1.onTransactionPartnerChange; } });
// Export user data update trigger (re-calculates file counterparties)
var onUserDataUpdate_1 = require("./matching/onUserDataUpdate");
Object.defineProperty(exports, "onUserDataUpdate", { enumerable: true, get: function () { return onUserDataUpdate_1.onUserDataUpdate; } });
// Export learning queue functions
var learningQueue_1 = require("./matching/learningQueue");
Object.defineProperty(exports, "queuePartnerForLearning", { enumerable: true, get: function () { return learningQueue_1.queuePartnerForLearning; } });
Object.defineProperty(exports, "processLearningQueue", { enumerable: true, get: function () { return learningQueue_1.processLearningQueue; } });
Object.defineProperty(exports, "triggerLearningNow", { enumerable: true, get: function () { return learningQueue_1.triggerLearningNow; } });
// Export pattern application functions
var applyPatterns_1 = require("./matching/applyPatterns");
Object.defineProperty(exports, "applyPatternsToTransactions", { enumerable: true, get: function () { return applyPatterns_1.applyPatternsToTransactions; } });
// Export admin functions
var generatePromotionCandidates_1 = require("./admin/generatePromotionCandidates");
Object.defineProperty(exports, "generatePromotionCandidates", { enumerable: true, get: function () { return generatePromotionCandidates_1.generatePromotionCandidates; } });
// Export import functions
var matchColumns_1 = require("./import/matchColumns");
Object.defineProperty(exports, "matchColumns", { enumerable: true, get: function () { return matchColumns_1.matchColumns; } });
// Export GoCardless sync functions
var scheduledSync_1 = require("./gocardless/scheduledSync");
Object.defineProperty(exports, "scheduledGoCardlessSync", { enumerable: true, get: function () { return scheduledSync_1.scheduledGoCardlessSync; } });
Object.defineProperty(exports, "triggerGoCardlessSync", { enumerable: true, get: function () { return scheduledSync_1.triggerGoCardlessSync; } });
Object.defineProperty(exports, "sendReauthReminders", { enumerable: true, get: function () { return scheduledSync_1.sendReauthReminders; } });
// Export file extraction functions
var extractFileData_1 = require("./extraction/extractFileData");
Object.defineProperty(exports, "extractFileData", { enumerable: true, get: function () { return extractFileData_1.extractFileData; } });
var retryExtraction_1 = require("./extraction/retryExtraction");
Object.defineProperty(exports, "retryFileExtraction", { enumerable: true, get: function () { return retryExtraction_1.retryFileExtraction; } });
// Export file-partner matching functions
var matchFilePartner_1 = require("./matching/matchFilePartner");
Object.defineProperty(exports, "matchFilePartner", { enumerable: true, get: function () { return matchFilePartner_1.matchFilePartner; } });
// Export file-transaction matching functions
var matchFileTransactions_1 = require("./matching/matchFileTransactions");
Object.defineProperty(exports, "matchFileTransactions", { enumerable: true, get: function () { return matchFileTransactions_1.matchFileTransactions; } });
var matchFilesForPartner_1 = require("./matching/matchFilesForPartner");
Object.defineProperty(exports, "matchFilesForPartner", { enumerable: true, get: function () { return matchFilesForPartner_1.matchFilesForPartner; } });
// Export orphaned file processing (fallback for stuck files)
var processOrphanedFiles_1 = require("./matching/processOrphanedFiles");
Object.defineProperty(exports, "processOrphanedFiles", { enumerable: true, get: function () { return processOrphanedFiles_1.processOrphanedFiles; } });
// Export AI helper functions
var generateFileSearchQuery_1 = require("./ai/generateFileSearchQuery");
Object.defineProperty(exports, "generateFileSearchQuery", { enumerable: true, get: function () { return generateFileSearchQuery_1.generateFileSearchQuery; } });
var lookupCompany_1 = require("./ai/lookupCompany");
Object.defineProperty(exports, "lookupCompany", { enumerable: true, get: function () { return lookupCompany_1.lookupCompany; } });
Object.defineProperty(exports, "lookupByVatId", { enumerable: true, get: function () { return lookupCompany_1.lookupByVatId; } });
// Export Gmail sync functions
var gmailSyncQueue_1 = require("./gmail/gmailSyncQueue");
Object.defineProperty(exports, "processGmailSyncQueue", { enumerable: true, get: function () { return gmailSyncQueue_1.processGmailSyncQueue; } });
Object.defineProperty(exports, "onSyncQueueCreated", { enumerable: true, get: function () { return gmailSyncQueue_1.onSyncQueueCreated; } });
var scheduledGmailSync_1 = require("./gmail/scheduledGmailSync");
Object.defineProperty(exports, "scheduledGmailSync", { enumerable: true, get: function () { return scheduledGmailSync_1.scheduledGmailSync; } });
var onGmailConnected_1 = require("./gmail/onGmailConnected");
Object.defineProperty(exports, "onGmailConnected", { enumerable: true, get: function () { return onGmailConnected_1.onGmailConnected; } });
var onTransactionsImported_1 = require("./gmail/onTransactionsImported");
Object.defineProperty(exports, "onTransactionsImported", { enumerable: true, get: function () { return onTransactionsImported_1.onTransactionsImported; } });
// Export precision search functions
var precisionSearchQueue_1 = require("./precision-search/precisionSearchQueue");
Object.defineProperty(exports, "processPrecisionSearchQueue", { enumerable: true, get: function () { return precisionSearchQueue_1.processPrecisionSearchQueue; } });
Object.defineProperty(exports, "onPrecisionSearchQueueCreated", { enumerable: true, get: function () { return precisionSearchQueue_1.onPrecisionSearchQueueCreated; } });
var onGmailSyncComplete_1 = require("./precision-search/onGmailSyncComplete");
Object.defineProperty(exports, "onGmailSyncComplete", { enumerable: true, get: function () { return onGmailSyncComplete_1.onGmailSyncComplete; } });
//# sourceMappingURL=index.js.map