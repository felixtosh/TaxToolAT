"use strict";
/**
 * Cloud Function: Convert HTML to PDF
 *
 * Callable function that converts HTML email content to PDF.
 * Used by the Next.js app since App Hosting doesn't have Chrome installed.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertHtmlToPdfCallable = void 0;
const createCallable_1 = require("../utils/createCallable");
const htmlToPdf_1 = require("./htmlToPdf");
exports.convertHtmlToPdfCallable = (0, createCallable_1.createCallable)({ name: "convertHtmlToPdf", memory: "1GiB", timeoutSeconds: 120 }, async (_ctx, request) => {
    const { html, metadata } = request;
    if (!html) {
        throw new createCallable_1.HttpsError("invalid-argument", "html is required");
    }
    // Convert date string back to Date object if provided
    const parsedMetadata = metadata
        ? {
            subject: metadata.subject,
            from: metadata.from,
            date: metadata.date ? new Date(metadata.date) : undefined,
        }
        : undefined;
    const result = await (0, htmlToPdf_1.convertHtmlToPdf)(html, parsedMetadata);
    return {
        success: true,
        pdfBase64: result.pdfBuffer.toString("base64"),
        pageCount: result.pageCount,
    };
});
//# sourceMappingURL=convertHtmlToPdfCallable.js.map