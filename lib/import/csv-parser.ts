import { CSVParseOptions, CSVAnalysis } from "@/types/import";

export interface AnalysisProgress {
  linesScanned: number;
  phase: "reading" | "counting" | "parsing";
}

/**
 * Detect and parse a CSV file
 * Optimized to only parse sample rows, not the entire file
 */
export async function analyzeCSV(
  file: File,
  onProgress?: (progress: AnalysisProgress) => void
): Promise<CSVAnalysis> {
  onProgress?.({ linesScanned: 0, phase: "reading" });

  const text = await readFileAsText(file);
  const options = detectCSVFormat(text);

  onProgress?.({ linesScanned: 0, phase: "counting" });

  // Count total rows with progress callback
  const totalRows = countDataRowsWithProgress(text, options, onProgress);

  onProgress?.({ linesScanned: totalRows, phase: "parsing" });

  // Only parse the first 50 rows for analysis
  const { headers, rows } = parseCSVSample(text, options, 50);

  return {
    options,
    headers,
    sampleRows: rows,
    totalRows,
  };
}

/**
 * Read file content as text, handling different encodings
 */
async function readFileAsText(file: File): Promise<string> {
  // Try UTF-8 first
  let text = await file.text();

  // Check for BOM and common encoding issues
  if (text.charCodeAt(0) === 0xfeff) {
    // Remove UTF-8 BOM
    text = text.slice(1);
  }

  // If we see replacement characters, try ISO-8859-1
  if (text.includes("�")) {
    const buffer = await file.arrayBuffer();
    const decoder = new TextDecoder("iso-8859-1");
    text = decoder.decode(buffer);
  }

  return text;
}

/**
 * Auto-detect CSV format (delimiter, encoding, etc.)
 */
export function detectCSVFormat(content: string): CSVParseOptions {
  // Get first few lines for analysis
  const lines = content.split(/\r?\n/).slice(0, 10);
  const firstLine = lines[0] || "";

  // Detect delimiter by counting occurrences
  const delimiter = detectDelimiter(firstLine);

  // Check if first row looks like a header
  const hasHeader = detectHeader(lines, delimiter);

  return {
    encoding: "UTF-8",
    delimiter,
    hasHeader,
    skipRows: 0,
  };
}

/**
 * Detect the most likely delimiter
 */
function detectDelimiter(line: string): string {
  const candidates = [
    { char: ";", count: (line.match(/;/g) || []).length },
    { char: ",", count: (line.match(/,/g) || []).length },
    { char: "\t", count: (line.match(/\t/g) || []).length },
    { char: "|", count: (line.match(/\|/g) || []).length },
  ];

  // Sort by count descending
  candidates.sort((a, b) => b.count - a.count);

  // Return the most common delimiter, default to semicolon (common in German CSVs)
  return candidates[0].count > 0 ? candidates[0].char : ";";
}

/**
 * Detect if the first row is a header row
 */
function detectHeader(lines: string[], delimiter: string): boolean {
  if (lines.length < 2) return true;

  const firstRow = parseCSVLine(lines[0], delimiter);
  const secondRow = parseCSVLine(lines[1], delimiter);

  if (firstRow.length !== secondRow.length) return true;

  // Check if first row contains more text and second row contains more numbers
  let firstRowTextCount = 0;
  let secondRowNumberCount = 0;

  for (let i = 0; i < firstRow.length; i++) {
    const first = firstRow[i];
    const second = secondRow[i];

    // Check if first row value looks like a header (text, no numbers)
    if (/^[a-zA-ZäöüÄÖÜß\s\-_\/]+$/.test(first)) {
      firstRowTextCount++;
    }

    // Check if second row value looks like data (contains numbers)
    if (/\d/.test(second)) {
      secondRowNumberCount++;
    }
  }

  // If first row is mostly text and second row has numbers, it's likely a header
  return firstRowTextCount > firstRow.length * 0.5 || secondRowNumberCount > 0;
}

/**
 * Count data rows with progress reporting
 * Reports progress every 1000 lines for performance
 */
function countDataRowsWithProgress(
  content: string,
  options: CSVParseOptions,
  onProgress?: (progress: AnalysisProgress) => void
): number {
  let count = 0;
  let i = 0;
  let lastReportedCount = 0;
  const reportInterval = 1000;

  while (i < content.length) {
    if (content[i] === '\n') {
      count++;
      // Report progress every N lines
      if (count - lastReportedCount >= reportInterval) {
        onProgress?.({ linesScanned: count, phase: "counting" });
        lastReportedCount = count;
      }
    }
    i++;
  }

  // Adjust for header and skip rows
  const adjustment = (options.hasHeader ? 1 : 0) + options.skipRows;
  return Math.max(0, count - adjustment);
}

/**
 * Parse only a sample of CSV rows (first N rows)
 */
function parseCSVSample(
  content: string,
  options: CSVParseOptions,
  maxRows: number
): { headers: string[]; rows: Record<string, string>[] } {
  // Split only enough lines for the sample
  const lines: string[] = [];
  let lineStart = 0;
  let lineCount = 0;
  const neededLines = maxRows + (options.hasHeader ? 1 : 0) + options.skipRows + 5; // Extra buffer

  for (let i = 0; i < content.length && lineCount < neededLines; i++) {
    if (content[i] === '\n' || content[i] === '\r') {
      const line = content.slice(lineStart, i).trim();
      if (line.length > 0) {
        lines.push(line);
        lineCount++;
      }
      // Skip \r\n as single line break
      if (content[i] === '\r' && content[i + 1] === '\n') {
        i++;
      }
      lineStart = i + 1;
    }
  }
  // Don't forget the last line if no trailing newline
  if (lineStart < content.length && lineCount < neededLines) {
    const lastLine = content.slice(lineStart).trim();
    if (lastLine.length > 0) {
      lines.push(lastLine);
    }
  }

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  // Skip specified rows
  const dataLines = lines.slice(options.skipRows);
  if (dataLines.length === 0) {
    return { headers: [], rows: [] };
  }

  // Parse header row
  const headerLine = options.hasHeader ? dataLines[0] : null;
  const dataStartIndex = options.hasHeader ? 1 : 0;

  let headers: string[];
  if (headerLine) {
    headers = parseCSVLine(headerLine, options.delimiter).map((h) => h.trim());
  } else {
    const firstRow = parseCSVLine(dataLines[0], options.delimiter);
    headers = firstRow.map((_, i) => `Column ${i + 1}`);
  }

  // Parse data rows (only up to maxRows)
  const rows: Record<string, string>[] = [];
  const endIndex = Math.min(dataLines.length, dataStartIndex + maxRows);

  for (let i = dataStartIndex; i < endIndex; i++) {
    const values = parseCSVLine(dataLines[i], options.delimiter);
    const row: Record<string, string> = {};

    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j]?.trim() ?? "";
    }

    rows.push(row);
  }

  return { headers, rows };
}

/**
 * Parse CSV content into headers and rows (parses all rows - use for actual import)
 */
export function parseCSV(
  content: string,
  options: CSVParseOptions
): { headers: string[]; rows: Record<string, string>[] } {
  const lines = content
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  // Skip specified rows
  const dataLines = lines.slice(options.skipRows);
  if (dataLines.length === 0) {
    return { headers: [], rows: [] };
  }

  // Parse header row
  const headerLine = options.hasHeader ? dataLines[0] : null;
  const dataStartIndex = options.hasHeader ? 1 : 0;

  let headers: string[];
  if (headerLine) {
    headers = parseCSVLine(headerLine, options.delimiter).map((h) => h.trim());
  } else {
    // Generate column names if no header
    const firstRow = parseCSVLine(dataLines[0], options.delimiter);
    headers = firstRow.map((_, i) => `Column ${i + 1}`);
  }

  // Parse data rows
  const rows: Record<string, string>[] = [];
  for (let i = dataStartIndex; i < dataLines.length; i++) {
    const values = parseCSVLine(dataLines[i], options.delimiter);
    const row: Record<string, string> = {};

    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j]?.trim() ?? "";
    }

    rows.push(row);
  }

  return { headers, rows };
}

/**
 * Parse a single CSV line, handling quoted fields
 */
function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i += 2;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
        i++;
      }
    } else if (char === delimiter && !inQuotes) {
      // Field separator
      result.push(current);
      current = "";
      i++;
    } else {
      current += char;
      i++;
    }
  }

  // Add last field
  result.push(current);

  return result;
}

/**
 * Get sample values for a specific column (first N non-empty values)
 */
export function getColumnSamples(
  rows: Record<string, string>[],
  columnHeader: string,
  maxSamples: number = 10
): string[] {
  const samples: string[] = [];

  for (const row of rows) {
    const value = row[columnHeader];
    if (value && value.trim().length > 0) {
      samples.push(value.trim());
      if (samples.length >= maxSamples) break;
    }
  }

  return samples;
}

/**
 * Get all unique values for a column (for dropdowns, etc.)
 */
export function getUniqueValues(
  rows: Record<string, string>[],
  columnHeader: string,
  maxValues: number = 100
): string[] {
  const unique = new Set<string>();

  for (const row of rows) {
    const value = row[columnHeader]?.trim();
    if (value) {
      unique.add(value);
      if (unique.size >= maxValues) break;
    }
  }

  return Array.from(unique).sort();
}
