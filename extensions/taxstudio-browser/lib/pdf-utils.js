/**
 * PDF utility functions for TaxStudio browser extension
 * Extracted for testability
 */

/**
 * PDF magic bytes: %PDF (0x25 0x50 0x44 0x46)
 */
var PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF

/**
 * Check if a buffer starts with PDF magic bytes
 * @param {ArrayBuffer|Uint8Array} buffer - The buffer to check
 * @returns {boolean}
 */
function isPdfMagic(buffer) {
  if (!buffer) return false;

  var bytes;
  if (buffer instanceof ArrayBuffer) {
    bytes = new Uint8Array(buffer);
  } else if (buffer instanceof Uint8Array) {
    bytes = buffer;
  } else {
    return false;
  }

  if (bytes.length < 4) return false;

  for (var i = 0; i < PDF_MAGIC.length; i++) {
    if (bytes[i] !== PDF_MAGIC[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Check if a content-type header indicates PDF
 * @param {string} contentType - The content-type header value
 * @returns {boolean}
 */
function isPdfContentType(contentType) {
  if (!contentType) return false;
  var lower = String(contentType).toLowerCase();
  return lower.indexOf("application/pdf") !== -1 || lower.indexOf("pdf") !== -1;
}

/**
 * Check if a content-disposition header suggests a PDF filename
 * @param {string} disposition - The content-disposition header value
 * @returns {boolean}
 */
function hasPdfFilename(disposition) {
  if (!disposition) return false;
  var lower = String(disposition).toLowerCase();
  return lower.indexOf(".pdf") !== -1;
}

/**
 * Extract filename from Content-Disposition header
 * @param {string} disposition - The content-disposition header value
 * @returns {string|null}
 */
function extractFilenameFromDisposition(disposition) {
  if (!disposition) return null;

  // Try filename*= (RFC 5987 extended notation)
  var extendedMatch = disposition.match(/filename\*=(?:utf-8''|UTF-8'')([^;\s]+)/i);
  if (extendedMatch && extendedMatch[1]) {
    try {
      return decodeURIComponent(extendedMatch[1]);
    } catch (err) {
      // Fall through to try other patterns
    }
  }

  // Try filename="..." (quoted)
  var quotedMatch = disposition.match(/filename="([^"]+)"/i);
  if (quotedMatch && quotedMatch[1]) {
    return quotedMatch[1];
  }

  // Try filename=... (unquoted)
  var unquotedMatch = disposition.match(/filename=([^;\s]+)/i);
  if (unquotedMatch && unquotedMatch[1]) {
    return unquotedMatch[1];
  }

  return null;
}

/**
 * Extract filename from URL path
 * @param {string} url - The URL to extract filename from
 * @returns {string|null}
 */
function extractFilenameFromUrl(url) {
  if (!url) return null;

  try {
    var parsed = new URL(url);
    var path = parsed.pathname;

    // Get the last segment of the path
    var segments = path.split("/").filter(function (s) {
      return s.length > 0;
    });

    if (segments.length === 0) return null;

    var lastSegment = segments[segments.length - 1];

    // Check if it looks like a filename (has extension)
    if (lastSegment.indexOf(".") !== -1) {
      return decodeURIComponent(lastSegment);
    }

    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Guess filename from response headers and URL
 * @param {string} url - The request URL
 * @param {string} disposition - Content-Disposition header value
 * @returns {string}
 */
function guessFilename(url, disposition) {
  // Try Content-Disposition first
  var fromDisposition = extractFilenameFromDisposition(disposition);
  if (fromDisposition) return fromDisposition;

  // Try URL path
  var fromUrl = extractFilenameFromUrl(url);
  if (fromUrl) return fromUrl;

  // Default fallback
  return "invoice.pdf";
}

// Export for testing and use
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    PDF_MAGIC,
    isPdfMagic,
    isPdfContentType,
    hasPdfFilename,
    extractFilenameFromDisposition,
    extractFilenameFromUrl,
    guessFilename,
  };
}
