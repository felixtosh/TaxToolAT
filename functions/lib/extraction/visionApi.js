"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.callVisionAPI = callVisionAPI;
const vision_1 = require("@google-cloud/vision");
const pdf_to_png_converter_1 = require("pdf-to-png-converter");
/**
 * Call Google Cloud Vision API for document text detection
 * Handles both images and PDFs (converts PDFs to images first)
 */
async function callVisionAPI(fileBuffer, fileType) {
    const client = new vision_1.ImageAnnotatorClient();
    // For PDFs, convert to images first
    if (fileType === "application/pdf") {
        return await processPdf(client, fileBuffer);
    }
    // For images, process directly
    return await processImage(client, fileBuffer);
}
/**
 * Process a PDF by converting each page to an image and running OCR
 */
async function processPdf(client, pdfBuffer) {
    // Convert Buffer to ArrayBuffer for pdfToPng
    const arrayBuffer = pdfBuffer.buffer.slice(pdfBuffer.byteOffset, pdfBuffer.byteOffset + pdfBuffer.byteLength);
    // Convert PDF pages to PNG images
    const pngPages = await (0, pdf_to_png_converter_1.pdfToPng)(arrayBuffer, {
        disableFontFace: true,
        useSystemFonts: true,
        viewportScale: 2.0, // Higher resolution for better OCR
    });
    if (pngPages.length === 0) {
        throw new Error("Failed to convert PDF to images");
    }
    // Process each page and combine results
    let fullText = "";
    const allBlocks = [];
    for (let pageIndex = 0; pageIndex < pngPages.length; pageIndex++) {
        const page = pngPages[pageIndex];
        if (!page.content) {
            console.warn(`Page ${pageIndex} has no content, skipping`);
            continue;
        }
        const pageResult = await processImage(client, page.content);
        fullText += pageResult.text + "\n";
        // Add page index to blocks
        for (const block of pageResult.blocks) {
            allBlocks.push({
                ...block,
                // Note: bounding boxes are relative to this page
            });
        }
    }
    return { text: fullText.trim(), blocks: allBlocks };
}
/**
 * Process a single image with Vision API
 */
async function processImage(client, imageBuffer) {
    const [result] = await client.documentTextDetection({
        image: { content: imageBuffer.toString("base64") },
    });
    const fullText = result.fullTextAnnotation?.text || "";
    // Extract blocks with their bounding boxes
    const blocks = [];
    const pages = result.fullTextAnnotation?.pages || [];
    for (const page of pages) {
        const pageWidth = page.width || 1;
        const pageHeight = page.height || 1;
        for (const block of page.blocks || []) {
            // Reconstruct text from paragraphs -> words -> symbols
            const blockText = (block.paragraphs || [])
                .map((p) => (p.words || [])
                .map((w) => (w.symbols || []).map((s) => s.text).join(""))
                .join(" "))
                .join("\n");
            // Get normalized bounding box vertices (0-1 range)
            const vertices = (block.boundingBox?.vertices || []).map((v) => ({
                x: (v.x || 0) / pageWidth,
                y: (v.y || 0) / pageHeight,
            }));
            blocks.push({
                text: blockText,
                boundingBox: { vertices },
                confidence: block.confidence || 0,
            });
        }
    }
    return { text: fullText, blocks };
}
//# sourceMappingURL=visionApi.js.map