"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapFieldsToBoundingBoxes = mapFieldsToBoundingBoxes;
/**
 * Map extracted field values to their bounding boxes in the document
 * Uses fuzzy matching to find the text spans in OCR blocks
 */
function mapFieldsToBoundingBoxes(extracted, blocks) {
    const fields = [];
    const fieldNames = [
        "date",
        "amount",
        "vatPercent",
        "partner",
    ];
    for (const fieldName of fieldNames) {
        const searchText = extracted.fieldSpans[fieldName];
        if (!searchText)
            continue;
        // Find block containing this text (case-insensitive, whitespace-normalized)
        const normalizedSearch = normalizeText(searchText);
        let bestMatch = null;
        for (const block of blocks) {
            const normalizedBlock = normalizeText(block.text);
            // Exact substring match
            if (normalizedBlock.includes(normalizedSearch)) {
                const score = searchText.length / block.text.length; // Prefer tighter matches
                if (!bestMatch || score > bestMatch.score) {
                    bestMatch = { block, score };
                }
            }
        }
        // If no exact match, try fuzzy matching
        if (!bestMatch) {
            for (const block of blocks) {
                const similarity = calculateSimilarity(normalizedSearch, normalizeText(block.text));
                if (similarity > 0.5) {
                    if (!bestMatch || similarity > bestMatch.score) {
                        bestMatch = { block, score: similarity };
                    }
                }
            }
        }
        if (bestMatch) {
            fields.push({
                field: fieldName,
                value: searchText,
                confidence: bestMatch.block.confidence,
                boundingBox: {
                    vertices: bestMatch.block.boundingBox.vertices,
                    pageIndex: 0, // TODO: Support multi-page
                },
            });
        }
        else {
            // Include field without bounding box
            fields.push({
                field: fieldName,
                value: searchText,
                confidence: 0.5,
            });
        }
    }
    return fields;
}
/**
 * Normalize text for comparison (lowercase, collapse whitespace)
 */
function normalizeText(text) {
    return text.toLowerCase().replace(/\s+/g, " ").trim();
}
/**
 * Calculate similarity between two strings (Jaccard similarity on character n-grams)
 */
function calculateSimilarity(a, b) {
    if (a.length === 0 || b.length === 0)
        return 0;
    const ngramSize = 3;
    const ngramsA = getNgrams(a, ngramSize);
    const ngramsB = getNgrams(b, ngramSize);
    const intersection = new Set([...ngramsA].filter((x) => ngramsB.has(x)));
    const union = new Set([...ngramsA, ...ngramsB]);
    return intersection.size / union.size;
}
function getNgrams(text, n) {
    const ngrams = new Set();
    for (let i = 0; i <= text.length - n; i++) {
        ngrams.add(text.slice(i, i + n));
    }
    return ngrams;
}
//# sourceMappingURL=boundingBoxMapper.js.map