/**
 * Download Tools
 *
 * Tools for downloading and saving files from Gmail.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";

// ============================================================================
// Download Gmail Attachment (just download, automation handles matching)
// ============================================================================

export const downloadGmailAttachmentTool = tool(
  async ({ attachments }, config) => {
    const authHeader = config?.configurable?.authHeader;

    console.log(
      "[Tool] downloadGmailAttachment called for",
      attachments.length,
      "attachments"
    );

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const results: Array<{
      filename: string;
      success: boolean;
      fileId?: string;
      error?: string;
    }> = [];

    for (const attachment of attachments) {
      try {
        const response = await fetch(`${baseUrl}/api/gmail/attachment`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(authHeader ? { Authorization: authHeader } : {}),
          },
          body: JSON.stringify({
            integrationId: attachment.integrationId,
            messageId: attachment.messageId,
            attachmentId: attachment.attachmentId,
            filename: attachment.filename,
            // No transactionId - let automation handle matching after extraction
            gmailMessageSubject: attachment.emailSubject,
            gmailMessageFrom: attachment.emailFrom,
            resultType: "gmail_attachment",
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          results.push({
            filename: attachment.filename,
            success: false,
            error: errorData.error || `HTTP ${response.status}`,
          });
          continue;
        }

        const data = await response.json();
        results.push({
          filename: attachment.filename,
          success: true,
          fileId: data.fileId,
        });
      } catch (error) {
        results.push({
          filename: attachment.filename,
          success: false,
          error: error instanceof Error ? error.message : "Download failed",
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return {
      success: successCount > 0,
      downloaded: successCount,
      failed: failCount,
      results,
      message:
        successCount > 0
          ? `Downloaded ${successCount} file(s). Automation will extract and match to transactions.${failCount > 0 ? ` ${failCount} failed.` : ""}`
          : "All downloads failed.",
    };
  },
  {
    name: "downloadGmailAttachment",
    description:
      "Download Gmail attachments. After download, automation extracts the file and matches it to transactions automatically.",
    schema: z.object({
      attachments: z
        .array(
          z.object({
            messageId: z.string().describe("Gmail message ID"),
            attachmentId: z.string().describe("Gmail attachment ID"),
            integrationId: z.string().describe("Gmail integration ID"),
            filename: z.string().describe("Attachment filename"),
            emailSubject: z.string().optional().describe("Email subject for context"),
            emailFrom: z.string().optional().describe("Email sender"),
          })
        )
        .max(3)
        .describe("Attachments to download (max 3)"),
    }),
  }
);

// ============================================================================
// Convert Email to PDF
// ============================================================================

export const convertEmailToPdfTool = tool(
  async ({ integrationId, messageId, emailSubject, emailFrom }, config) => {
    const authHeader = config?.configurable?.authHeader;

    console.log("[Tool] convertEmailToPdf called for message:", messageId);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    try {
      const response = await fetch(`${baseUrl}/api/gmail/convert-to-pdf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
        body: JSON.stringify({
          integrationId,
          messageId,
          // No transactionId - let automation handle matching
          gmailMessageFrom: emailFrom,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.error || `HTTP ${response.status}`,
          message: `Failed to convert email to PDF: ${errorData.error || response.status}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        fileId: data.fileId,
        fileName: data.fileName,
        downloadUrl: data.downloadUrl,
        message: `Converted email "${emailSubject || "email"}" to PDF. Automation will match it to transactions.`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Conversion failed",
        message: "Failed to convert email to PDF.",
      };
    }
  },
  {
    name: "convertEmailToPdf",
    description:
      "Convert an email body to a PDF. Use when the email itself is the invoice. Automation will match it to transactions after extraction.",
    schema: z.object({
      integrationId: z.string().describe("Gmail integration ID"),
      messageId: z.string().describe("Gmail message ID"),
      emailSubject: z.string().optional().describe("Email subject for filename"),
      emailFrom: z.string().optional().describe("Email sender"),
    }),
  }
);

// ============================================================================
// Export all download tools
// ============================================================================

export const DOWNLOAD_TOOLS = [
  downloadGmailAttachmentTool,
  convertEmailToPdfTool,
];
