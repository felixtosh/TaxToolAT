/**
 * Cloud Function: Convert HTML to PDF
 *
 * Callable function that converts HTML email content to PDF.
 * Used by the Next.js app since App Hosting doesn't have Chrome installed.
 */

import { createCallable, HttpsError } from "../utils/createCallable";
import { convertHtmlToPdf } from "./htmlToPdf";

interface ConvertHtmlToPdfRequest {
  html: string;
  metadata?: {
    subject?: string;
    from?: string;
    date?: string; // ISO date string
  };
}

interface ConvertHtmlToPdfResponse {
  success: boolean;
  pdfBase64: string;
  pageCount: number;
}

export const convertHtmlToPdfCallable = createCallable<
  ConvertHtmlToPdfRequest,
  ConvertHtmlToPdfResponse
>(
  { name: "convertHtmlToPdf" },
  async (_ctx, request) => {
    const { html, metadata } = request;

    if (!html) {
      throw new HttpsError("invalid-argument", "html is required");
    }

    // Convert date string back to Date object if provided
    const parsedMetadata = metadata
      ? {
          subject: metadata.subject,
          from: metadata.from,
          date: metadata.date ? new Date(metadata.date) : undefined,
        }
      : undefined;

    const result = await convertHtmlToPdf(html, parsedMetadata);

    return {
      success: true,
      pdfBase64: result.pdfBuffer.toString("base64"),
      pageCount: result.pageCount,
    };
  }
);
