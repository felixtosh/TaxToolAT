"use strict";
/**
 * File Cloud Functions
 *
 * All file mutations go through these callable functions.
 * Realtime listeners (onSnapshot) stay client-side in hooks.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.unrejectFileFromTransactionCallable = exports.dismissTransactionSuggestionCallable = exports.disconnectFileFromTransactionCallable = exports.connectFileToTransactionCallable = exports.unmarkFileAsNotInvoiceCallable = exports.markFileAsNotInvoiceCallable = exports.restoreFileCallable = exports.deleteFileCallable = exports.updateFileCallable = exports.createFileCallable = void 0;
var createFile_1 = require("./createFile");
Object.defineProperty(exports, "createFileCallable", { enumerable: true, get: function () { return createFile_1.createFileCallable; } });
var updateFile_1 = require("./updateFile");
Object.defineProperty(exports, "updateFileCallable", { enumerable: true, get: function () { return updateFile_1.updateFileCallable; } });
var deleteFile_1 = require("./deleteFile");
Object.defineProperty(exports, "deleteFileCallable", { enumerable: true, get: function () { return deleteFile_1.deleteFileCallable; } });
var restoreFile_1 = require("./restoreFile");
Object.defineProperty(exports, "restoreFileCallable", { enumerable: true, get: function () { return restoreFile_1.restoreFileCallable; } });
var markFileAsNotInvoice_1 = require("./markFileAsNotInvoice");
Object.defineProperty(exports, "markFileAsNotInvoiceCallable", { enumerable: true, get: function () { return markFileAsNotInvoice_1.markFileAsNotInvoiceCallable; } });
var unmarkFileAsNotInvoice_1 = require("./unmarkFileAsNotInvoice");
Object.defineProperty(exports, "unmarkFileAsNotInvoiceCallable", { enumerable: true, get: function () { return unmarkFileAsNotInvoice_1.unmarkFileAsNotInvoiceCallable; } });
var connectFileToTransaction_1 = require("./connectFileToTransaction");
Object.defineProperty(exports, "connectFileToTransactionCallable", { enumerable: true, get: function () { return connectFileToTransaction_1.connectFileToTransactionCallable; } });
var disconnectFileFromTransaction_1 = require("./disconnectFileFromTransaction");
Object.defineProperty(exports, "disconnectFileFromTransactionCallable", { enumerable: true, get: function () { return disconnectFileFromTransaction_1.disconnectFileFromTransactionCallable; } });
var dismissTransactionSuggestion_1 = require("./dismissTransactionSuggestion");
Object.defineProperty(exports, "dismissTransactionSuggestionCallable", { enumerable: true, get: function () { return dismissTransactionSuggestion_1.dismissTransactionSuggestionCallable; } });
var unrejectFileFromTransaction_1 = require("./unrejectFileFromTransaction");
Object.defineProperty(exports, "unrejectFileFromTransactionCallable", { enumerable: true, get: function () { return unrejectFileFromTransaction_1.unrejectFileFromTransactionCallable; } });
//# sourceMappingURL=index.js.map