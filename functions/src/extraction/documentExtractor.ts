/**
 * Document Extraction Abstraction Layer
 *
 * Provides a unified interface for document (PDF/image) extraction
 * that can switch between different providers:
 *
 * - "vision-claude": Google Vision API for OCR + Claude Haiku for parsing (original)
 * - "gemini": Gemini Flash for native PDF vision + extraction (new)
 *
 * Set EXTRACTION_PROVIDER environment variable to switch providers.
 */

import { ExtractedData } from "./claudeParser";
import { OCRBlock } from "./visionApi";

export type ExtractionProvider = "vision-claude" | "gemini";

export interface ExtractionResult {
  text: string;
  blocks: OCRBlock[]; // Empty for Gemini (no bounding boxes from native vision)
  extracted: ExtractedData;
  provider: ExtractionProvider;
}

export interface ExtractionConfig {
  provider: ExtractionProvider;
  anthropicApiKey?: string;
  // Gemini uses service account auth via Vertex AI (no API key needed)
  geminiModel?: string;
}

/**
 * Get the default extraction provider from environment
 */
export function getDefaultProvider(): ExtractionProvider {
  const provider = process.env.EXTRACTION_PROVIDER;
  if (provider === "gemini" || provider === "vision-claude") {
    return provider;
  }
  // Default to gemini (faster, uses service account auth)
  return "gemini";
}

/**
 * Extract text and structured data from a document
 * Uses the configured provider (vision-claude or gemini)
 */
export async function extractDocument(
  fileBuffer: Buffer,
  fileType: string,
  config: ExtractionConfig
): Promise<ExtractionResult> {
  const provider = config.provider;

  if (provider === "gemini") {
    return extractWithGemini(fileBuffer, fileType, config);
  } else {
    return extractWithVisionClaude(fileBuffer, fileType, config);
  }
}

/**
 * Extract using Google Vision API + Claude Haiku (original approach)
 */
async function extractWithVisionClaude(
  fileBuffer: Buffer,
  fileType: string,
  config: ExtractionConfig
): Promise<ExtractionResult> {
  // Lazy import to avoid loading both providers unnecessarily
  const { callVisionAPI } = await import("./visionApi");
  const { parseWithClaude } = await import("./claudeParser");

  if (!config.anthropicApiKey) {
    throw new Error("Anthropic API key required for vision-claude provider");
  }

  // Step 1: OCR with Vision API
  const ocrResult = await callVisionAPI(fileBuffer, fileType);

  if (!ocrResult.text || ocrResult.text.trim().length === 0) {
    throw new Error("No text extracted from document");
  }

  // Step 2: Parse with Claude Haiku
  const extracted = await parseWithClaude(ocrResult.text, config.anthropicApiKey);

  return {
    text: ocrResult.text,
    blocks: ocrResult.blocks,
    extracted,
    provider: "vision-claude",
  };
}

/**
 * Extract using Gemini Flash (native PDF vision)
 */
async function extractWithGemini(
  fileBuffer: Buffer,
  fileType: string,
  config: ExtractionConfig
): Promise<ExtractionResult> {
  const { parseWithGemini, DEFAULT_GEMINI_MODEL } = await import("./geminiParser");
  type GeminiModel = import("./geminiParser").GeminiModel;

  // Gemini uses service account auth via Vertex AI (no API key needed)
  const model = (config.geminiModel || DEFAULT_GEMINI_MODEL) as GeminiModel;

  // Gemini does OCR + extraction in one call
  const result = await parseWithGemini(fileBuffer, fileType, model);

  if (!result.rawText || result.rawText.trim().length === 0) {
    throw new Error("No text extracted from document");
  }

  return {
    text: result.rawText,
    blocks: [], // Gemini native vision doesn't provide bounding boxes
    extracted: result.extracted,
    provider: "gemini",
  };
}

/**
 * Generate fake OCR blocks from extracted text for Gemini
 * This provides basic text search capability when bounding boxes aren't available
 */
export function generateTextBlocks(text: string): OCRBlock[] {
  // Split text into paragraphs/lines and create simple blocks
  const lines = text.split(/\n+/).filter((line) => line.trim());

  return lines.map((line) => ({
    text: line.trim(),
    boundingBox: { vertices: [] }, // No position info from Gemini
    confidence: 1.0,
  }));
}
