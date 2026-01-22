"use strict";
/**
 * Partner Cloud Functions
 *
 * Handle partner CRUD operations and partner-transaction assignments.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.removePartnerFromTransactionCallable = exports.assignPartnerToTransactionCallable = exports.deleteUserPartnerCallable = exports.updateUserPartnerCallable = exports.createUserPartnerCallable = void 0;
var createUserPartner_1 = require("./createUserPartner");
Object.defineProperty(exports, "createUserPartnerCallable", { enumerable: true, get: function () { return createUserPartner_1.createUserPartnerCallable; } });
var updateUserPartner_1 = require("./updateUserPartner");
Object.defineProperty(exports, "updateUserPartnerCallable", { enumerable: true, get: function () { return updateUserPartner_1.updateUserPartnerCallable; } });
var deleteUserPartner_1 = require("./deleteUserPartner");
Object.defineProperty(exports, "deleteUserPartnerCallable", { enumerable: true, get: function () { return deleteUserPartner_1.deleteUserPartnerCallable; } });
var assignPartnerToTransaction_1 = require("./assignPartnerToTransaction");
Object.defineProperty(exports, "assignPartnerToTransactionCallable", { enumerable: true, get: function () { return assignPartnerToTransaction_1.assignPartnerToTransactionCallable; } });
var removePartnerFromTransaction_1 = require("./removePartnerFromTransaction");
Object.defineProperty(exports, "removePartnerFromTransactionCallable", { enumerable: true, get: function () { return removePartnerFromTransaction_1.removePartnerFromTransactionCallable; } });
//# sourceMappingURL=index.js.map