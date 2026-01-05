"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchColumns = exports.generatePromotionCandidates = exports.applyPatternsToTransactions = exports.triggerLearningNow = exports.processLearningQueue = exports.queuePartnerForLearning = exports.searchExternalPartners = exports.learnPartnerPatterns = exports.matchPartners = exports.onPartnerCreate = void 0;
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
//# sourceMappingURL=index.js.map