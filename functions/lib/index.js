"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lookupCompany = exports.generateFileSearchQuery = exports.matchFilesForPartner = exports.matchFileTransactions = exports.extractFileData = exports.sendReauthReminders = exports.triggerGoCardlessSync = exports.scheduledGoCardlessSync = exports.matchColumns = exports.generatePromotionCandidates = exports.applyPatternsToTransactions = exports.triggerLearningNow = exports.processLearningQueue = exports.queuePartnerForLearning = exports.onCategoryCreate = exports.matchCategories = exports.searchExternalPartners = exports.learnPartnerPatterns = exports.matchPartners = exports.onPartnerCreate = void 0;
const app_1 = require("firebase-admin/app");
// Initialize Firebase Admin
(0, app_1.initializeApp)();
// Export partner matching functions
var onPartnerCreate_1 = require("./matching/onPartnerCreate");
Object.defineProperty(exports, "onPartnerCreate", { enumerable: true, get: function () { return onPartnerCreate_1.onPartnerCreate; } });
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
// Export file-transaction matching functions
var matchFileTransactions_1 = require("./matching/matchFileTransactions");
Object.defineProperty(exports, "matchFileTransactions", { enumerable: true, get: function () { return matchFileTransactions_1.matchFileTransactions; } });
var matchFilesForPartner_1 = require("./matching/matchFilesForPartner");
Object.defineProperty(exports, "matchFilesForPartner", { enumerable: true, get: function () { return matchFilesForPartner_1.matchFilesForPartner; } });
// Export AI helper functions
var generateFileSearchQuery_1 = require("./ai/generateFileSearchQuery");
Object.defineProperty(exports, "generateFileSearchQuery", { enumerable: true, get: function () { return generateFileSearchQuery_1.generateFileSearchQuery; } });
var lookupCompany_1 = require("./ai/lookupCompany");
Object.defineProperty(exports, "lookupCompany", { enumerable: true, get: function () { return lookupCompany_1.lookupCompany; } });
//# sourceMappingURL=index.js.map