import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import Anthropic from "@anthropic-ai/sdk";

const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

// ============================================================================
// Types
// ============================================================================

interface MatchColumnsRequest {
  headers: string[];
  sampleRows: Record<string, string>[];
}

interface ColumnMapping {
  csvColumn: string;
  targetField: string | null;
  confidence: number;
}

interface MatchColumnsResponse {
  mappings: ColumnMapping[];
  suggestedDateFormat: string | null;
  suggestedAmountFormat: string | null;
}

// ============================================================================
// Field Definitions (mirrored from frontend)
// ============================================================================

interface FieldDefinition {
  key: string;
  label: string;
  description: string;
  aliases: string[];
  required: boolean;
  type: "date" | "amount" | "text" | "iban";
  examples: string[];
}

const TRANSACTION_FIELDS: FieldDefinition[] = [
  {
    key: "date",
    label: "Transaction Date",
    description:
      "The date when the transaction was booked. Also known as booking date, value date, posting date.",
    aliases: [
      "Buchungsdatum", "Buchungstag", "Valuta", "Valutadatum", "Datum",
      "Date", "Booking Date", "Value Date", "Posted Date", "Transaction Date",
    ],
    required: true,
    type: "date",
    examples: ["15.03.2024", "2024-03-15", "03/15/2024"],
  },
  {
    key: "amount",
    label: "Amount",
    description:
      "The transaction amount. Positive for income, negative for expenses. German format uses comma as decimal (1.234,56).",
    aliases: [
      "Betrag", "Summe", "Umsatz", "Soll", "Haben",
      "Amount", "Value", "Total", "Debit", "Credit",
    ],
    required: true,
    type: "amount",
    examples: ["-1.234,56", "1234.56", "EUR 500,00"],
  },
  {
    key: "name",
    label: "Description / Booking Text",
    description:
      "The main description or booking text. Contains details about the purpose of the payment.",
    aliases: [
      "Buchungstext", "Verwendungszweck", "Text", "Beschreibung",
      "Description", "Memo", "Narrative", "Details", "Reference",
    ],
    required: true,
    type: "text",
    examples: ["AMAZON EU SARL", "Gehalt März 2024", "SEPA Direct Debit"],
  },
  {
    key: "partner",
    label: "Counterparty / Partner",
    description:
      "The name of the other party - sender or receiver of the money.",
    aliases: [
      "Empfänger", "Auftraggeber", "Partner", "Name",
      "Payee", "Payer", "Beneficiary", "Recipient", "Merchant",
    ],
    required: false,
    type: "text",
    examples: ["Max Mustermann", "Amazon EU S.a.r.l.", "Netflix Inc."],
  },
  {
    key: "reference",
    label: "Reference / Transaction ID",
    description:
      "A unique identifier for the transaction. Used for deduplication.",
    aliases: [
      "Referenz", "Transaktions-ID", "Buchungsreferenz", "End-to-End-Referenz",
      "Reference", "Transaction ID", "ID", "Payment Reference",
    ],
    required: false,
    type: "text",
    examples: ["TXN123456789", "E2E-2024031512345"],
  },
  {
    key: "partnerIban",
    label: "Partner IBAN",
    description:
      "The IBAN of the counterparty's bank account. Starts with country code (AT, DE, CH).",
    aliases: [
      "IBAN", "Empfänger-IBAN", "Kontonummer", "Gegenkonto",
      "Partner IBAN", "Account Number", "Beneficiary IBAN",
    ],
    required: false,
    type: "iban",
    examples: ["AT12 3456 7890 1234 5678", "DE89370400440532013000"],
  },
  {
    key: "partnerBic",
    label: "Partner BIC / SWIFT",
    description: "The BIC/SWIFT code of the counterparty's bank.",
    aliases: ["BIC", "SWIFT", "SWIFT-Code", "Bankleitzahl", "BLZ"],
    required: false,
    type: "text",
    examples: ["GIBAATWWXXX", "DEUTDEFF"],
  },
  {
    key: "category",
    label: "Bank Category / Transaction Type",
    description: "The bank's own categorization of the transaction type.",
    aliases: [
      "Kategorie", "Buchungsart", "Transaktionsart", "Typ",
      "Category", "Type", "Transaction Type", "Payment Type",
    ],
    required: false,
    type: "text",
    examples: ["Überweisung", "Lastschrift", "Transfer", "Card Payment"],
  },
  {
    key: "balance",
    label: "Balance After Transaction",
    description: "The account balance after this transaction. Usually not imported.",
    aliases: ["Saldo", "Kontostand", "Balance", "Running Balance"],
    required: false,
    type: "amount",
    examples: ["12.345,67", "1234.56 EUR"],
  },
];

// Valid format IDs
const DATE_FORMATS = [
  "iso-datetime", "iso-datetime-t", "iso", "de", "de-short",
  "us", "us-short", "eu-slash", "dash-dmy", "text-short", "text-long",
];

const AMOUNT_FORMATS = [
  "de", "de-space", "us", "us-space",
  "accounting", "accounting-de", "simple", "simple-comma",
];

// ============================================================================
// Prompt Builder
// ============================================================================

function buildPrompt(
  headers: string[],
  sampleRows: Record<string, string>[]
): string {
  const fieldDescriptions = TRANSACTION_FIELDS.map(
    (f) =>
      `- **${f.key}** (${f.required ? "required" : "optional"}, type: ${f.type}): ${f.description}\n  Aliases: ${f.aliases.slice(0, 5).join(", ")}\n  Examples: ${f.examples.join(", ")}`
  ).join("\n\n");

  const columnInfo = headers
    .map((header) => {
      const samples = sampleRows
        .slice(0, 5)
        .map((row) => row[header])
        .filter((v) => v && v.trim())
        .slice(0, 3);
      return `Column: "${header}"\nSample values: ${samples.length > 0 ? samples.join(" | ") : "(empty)"}`;
    })
    .join("\n\n");

  return `You are analyzing a CSV file containing bank transaction data for import into an Austrian/German accounting tool.

## Available Target Fields

${fieldDescriptions}

## CSV Columns to Match

${columnInfo}

## Instructions

For each CSV column, determine which target field it should map to.

CRITICAL RULES:
1. Each target field can ONLY be assigned to ONE column (no duplicates!)
2. If multiple columns could match a field, pick the BEST one and leave others as null
3. Required fields (date, amount, name) must be prioritized

Consider:
- The column header name (may be in German, English, or other languages)
- The format and content of sample values
- Choose the most likely match when multiple columns could fit a field

Also detect the date and amount formats from the sample values.

Valid date format IDs: ${DATE_FORMATS.join(", ")}
Valid amount format IDs: ${AMOUNT_FORMATS.join(", ")}
Valid target field keys: ${TRANSACTION_FIELDS.map((f) => f.key).join(", ")}

Respond ONLY with valid JSON in this exact format (no markdown, no explanation):
{
  "mappings": [
    {"csvColumn": "column name", "targetField": "field key or null", "confidence": 0.0-1.0}
  ],
  "suggestedDateFormat": "format id or null",
  "suggestedAmountFormat": "format id or null"
}`;
}

// ============================================================================
// Cloud Function
// ============================================================================

export const matchColumns = onCall<MatchColumnsRequest>(
  {
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 60,
    secrets: [anthropicApiKey],
  },
  async (request): Promise<MatchColumnsResponse> => {
    const { headers, sampleRows } = request.data;

    // Validate input
    if (!headers || !Array.isArray(headers) || headers.length === 0) {
      throw new HttpsError("invalid-argument", "headers array is required");
    }
    if (!sampleRows || !Array.isArray(sampleRows)) {
      throw new HttpsError("invalid-argument", "sampleRows array is required");
    }

    console.log(`Matching ${headers.length} columns with ${sampleRows.length} sample rows`);

    try {
      const client = new Anthropic({ apiKey: anthropicApiKey.value() });
      const prompt = buildPrompt(headers, sampleRows);

      const response = await client.messages.create({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });

      // Extract text from response
      const textBlock = response.content.find((block) => block.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new HttpsError("internal", "No text response from AI");
      }

      // Parse JSON response
      const jsonText = textBlock.text.trim();
      let result: MatchColumnsResponse;

      try {
        result = JSON.parse(jsonText);
      } catch (parseError) {
        console.error("Failed to parse AI response:", jsonText);
        throw new HttpsError("internal", "Failed to parse AI response as JSON");
      }

      // Validate response structure
      if (!result.mappings || !Array.isArray(result.mappings)) {
        throw new HttpsError("internal", "Invalid response structure from AI");
      }

      // Validate mappings
      const validFieldKeys = new Set(TRANSACTION_FIELDS.map((f) => f.key));
      result.mappings = result.mappings.map((m) => ({
        csvColumn: m.csvColumn,
        targetField: m.targetField && validFieldKeys.has(m.targetField) ? m.targetField : null,
        confidence: typeof m.confidence === "number" ? Math.min(1, Math.max(0, m.confidence)) : 0,
      }));

      // Deduplicate: each target field can only be used once (keep highest confidence)
      const usedFields = new Map<string, { csvColumn: string; confidence: number }>();
      for (const mapping of result.mappings) {
        if (!mapping.targetField) continue;

        const existing = usedFields.get(mapping.targetField);
        if (!existing || mapping.confidence > existing.confidence) {
          usedFields.set(mapping.targetField, {
            csvColumn: mapping.csvColumn,
            confidence: mapping.confidence,
          });
        }
      }

      // Apply deduplication - only the winning column keeps the field
      result.mappings = result.mappings.map((m) => {
        if (!m.targetField) return m;

        const winner = usedFields.get(m.targetField);
        if (winner && winner.csvColumn !== m.csvColumn) {
          // This column lost - remove the field assignment
          return { ...m, targetField: null, confidence: 0 };
        }
        return m;
      });

      // Validate format suggestions
      if (result.suggestedDateFormat && !DATE_FORMATS.includes(result.suggestedDateFormat)) {
        result.suggestedDateFormat = "de"; // Default to German
      }
      if (result.suggestedAmountFormat && !AMOUNT_FORMATS.includes(result.suggestedAmountFormat)) {
        result.suggestedAmountFormat = "de"; // Default to German
      }

      console.log(`Successfully matched columns:`, result.mappings.filter((m) => m.targetField).length);

      return result;
    } catch (error) {
      if (error instanceof HttpsError) throw error;

      console.error("Error calling Claude API:", error);
      throw new HttpsError(
        "internal",
        `AI matching failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
);
