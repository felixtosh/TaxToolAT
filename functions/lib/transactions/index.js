"use strict";
/**
 * Transaction Cloud Functions
 *
 * All transaction mutations go through these callable functions.
 * Realtime listeners (onSnapshot) stay client-side in hooks.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteTransactionsBySourceCallable = exports.bulkUpdateTransactionsCallable = exports.updateTransactionCallable = void 0;
var updateTransaction_1 = require("./updateTransaction");
Object.defineProperty(exports, "updateTransactionCallable", { enumerable: true, get: function () { return updateTransaction_1.updateTransactionCallable; } });
var bulkUpdateTransactions_1 = require("./bulkUpdateTransactions");
Object.defineProperty(exports, "bulkUpdateTransactionsCallable", { enumerable: true, get: function () { return bulkUpdateTransactions_1.bulkUpdateTransactionsCallable; } });
var deleteTransactionsBySource_1 = require("./deleteTransactionsBySource");
Object.defineProperty(exports, "deleteTransactionsBySourceCallable", { enumerable: true, get: function () { return deleteTransactionsBySource_1.deleteTransactionsBySourceCallable; } });
//# sourceMappingURL=index.js.map