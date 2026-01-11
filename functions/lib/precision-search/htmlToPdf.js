"use strict";
/**
 * HTML to PDF Converter
 *
 * Converts email HTML content to PDF for storage as a receipt file.
 * Uses pdf-lib (already in project) for simple text-based conversion.
 *
 * For complex HTML with tables/images, would need puppeteer (not included).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertHtmlToPdf = convertHtmlToPdf;
exports.isComplexHtml = isComplexHtml;
const pdf_lib_1 = require("pdf-lib");
/**
 * Extract clean text from HTML, preserving some structure.
 */
function htmlToText(html) {
    let text = html;
    // Remove style and script tags completely
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
    text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
    // Replace common elements with line breaks
    text = text.replace(/<br\s*\/?>/gi, "\n");
    text = text.replace(/<\/p>/gi, "\n\n");
    text = text.replace(/<\/div>/gi, "\n");
    text = text.replace(/<\/tr>/gi, "\n");
    text = text.replace(/<\/li>/gi, "\n");
    text = text.replace(/<\/h[1-6]>/gi, "\n\n");
    // Replace horizontal rules
    text = text.replace(/<hr[^>]*>/gi, "\n---\n");
    // Remove remaining tags
    text = text.replace(/<[^>]+>/g, " ");
    // Decode common HTML entities
    text = text.replace(/&nbsp;/gi, " ");
    text = text.replace(/&amp;/gi, "&");
    text = text.replace(/&lt;/gi, "<");
    text = text.replace(/&gt;/gi, ">");
    text = text.replace(/&quot;/gi, '"');
    text = text.replace(/&#39;/gi, "'");
    text = text.replace(/&euro;/gi, "€");
    // Clean up whitespace
    text = text.replace(/[ \t]+/g, " "); // Multiple spaces to single
    text = text.replace(/\n\s*\n\s*\n/g, "\n\n"); // Max 2 newlines
    text = text.trim();
    return text;
}
/**
 * Wrap text to fit within a given width.
 */
function wrapText(text, maxCharsPerLine) {
    const lines = [];
    const paragraphs = text.split("\n");
    for (const paragraph of paragraphs) {
        if (paragraph.trim() === "") {
            lines.push("");
            continue;
        }
        const words = paragraph.split(" ");
        let currentLine = "";
        for (const word of words) {
            if (currentLine.length + word.length + 1 <= maxCharsPerLine) {
                currentLine += (currentLine ? " " : "") + word;
            }
            else {
                if (currentLine)
                    lines.push(currentLine);
                currentLine = word;
            }
        }
        if (currentLine)
            lines.push(currentLine);
    }
    return lines;
}
/**
 * Convert HTML email content to a PDF document.
 *
 * @param html - The HTML content of the email
 * @param metadata - Optional metadata to include in the PDF
 * @returns PDF as a Buffer
 */
async function convertHtmlToPdf(html, metadata) {
    const pdfDoc = await pdf_lib_1.PDFDocument.create();
    const font = await pdfDoc.embedFont(pdf_lib_1.StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(pdf_lib_1.StandardFonts.HelveticaBold);
    const fontSize = 10;
    const lineHeight = fontSize * 1.4;
    const margin = 50;
    const pageWidth = 595; // A4
    const pageHeight = 842; // A4
    const contentWidth = pageWidth - 2 * margin;
    const maxCharsPerLine = Math.floor(contentWidth / (fontSize * 0.5));
    // Convert HTML to text
    const textContent = htmlToText(html);
    const lines = wrapText(textContent, maxCharsPerLine);
    // Calculate content height per page
    const maxLinesPerPage = Math.floor((pageHeight - 2 * margin - 60) / lineHeight); // 60 for header
    let pageCount = 0;
    let currentLineIndex = 0;
    while (currentLineIndex < lines.length) {
        const page = pdfDoc.addPage([pageWidth, pageHeight]);
        pageCount++;
        let y = pageHeight - margin;
        // Add header on first page
        if (pageCount === 1 && metadata) {
            if (metadata.subject) {
                page.drawText(metadata.subject, {
                    x: margin,
                    y,
                    size: 14,
                    font: boldFont,
                    color: (0, pdf_lib_1.rgb)(0, 0, 0),
                });
                y -= 20;
            }
            if (metadata.from) {
                page.drawText(`From: ${metadata.from}`, {
                    x: margin,
                    y,
                    size: fontSize,
                    font,
                    color: (0, pdf_lib_1.rgb)(0.3, 0.3, 0.3),
                });
                y -= lineHeight;
            }
            if (metadata.date) {
                page.drawText(`Date: ${metadata.date.toLocaleDateString("de-DE")}`, {
                    x: margin,
                    y,
                    size: fontSize,
                    font,
                    color: (0, pdf_lib_1.rgb)(0.3, 0.3, 0.3),
                });
                y -= lineHeight;
            }
            // Add separator
            y -= 10;
            page.drawLine({
                start: { x: margin, y },
                end: { x: pageWidth - margin, y },
                thickness: 0.5,
                color: (0, pdf_lib_1.rgb)(0.7, 0.7, 0.7),
            });
            y -= 20;
        }
        // Draw content lines
        let linesOnPage = 0;
        while (currentLineIndex < lines.length &&
            linesOnPage < maxLinesPerPage &&
            y > margin) {
            const line = lines[currentLineIndex];
            if (line.trim()) {
                page.drawText(line, {
                    x: margin,
                    y,
                    size: fontSize,
                    font,
                    color: (0, pdf_lib_1.rgb)(0, 0, 0),
                });
            }
            y -= lineHeight;
            currentLineIndex++;
            linesOnPage++;
        }
        // Add page number
        page.drawText(`Page ${pageCount}`, {
            x: pageWidth / 2 - 20,
            y: 30,
            size: 8,
            font,
            color: (0, pdf_lib_1.rgb)(0.5, 0.5, 0.5),
        });
    }
    const pdfBytes = await pdfDoc.save();
    return {
        pdfBuffer: Buffer.from(pdfBytes),
        pageCount,
    };
}
/**
 * Check if HTML content is complex (requires puppeteer for proper rendering).
 * Returns true if the content has tables, images, or complex CSS.
 */
function isComplexHtml(html) {
    // Check for complex elements
    const hasTable = /<table[\s>]/i.test(html);
    const hasImages = /<img[\s>]/i.test(html);
    const hasCanvas = /<canvas[\s>]/i.test(html);
    const hasSvg = /<svg[\s>]/i.test(html);
    const hasIframe = /<iframe[\s>]/i.test(html);
    // Check for complex CSS (inline styles with positioning)
    const hasComplexCss = /position:\s*(absolute|fixed|relative)/i.test(html) ||
        /display:\s*(flex|grid)/i.test(html) ||
        /float:\s*(left|right)/i.test(html);
    return hasTable || hasImages || hasCanvas || hasSvg || hasIframe || hasComplexCss;
}
//# sourceMappingURL=htmlToPdf.js.map