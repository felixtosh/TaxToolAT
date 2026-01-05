import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/config";
import { FieldMapping } from "@/types/import";

interface AIMatchingResult {
  mappings: Array<{
    csvColumn: string;
    targetField: string | null;
    confidence: number;
  }>;
  suggestedDateFormat: string | null;
  suggestedAmountFormat: string | null;
}

/**
 * Match CSV columns to transaction fields using Claude AI.
 * Calls the matchColumns Cloud Function.
 */
export async function matchColumnsWithAI(
  headers: string[],
  sampleRows: Record<string, string>[]
): Promise<FieldMapping[]> {
  const matchColumns = httpsCallable<
    { headers: string[]; sampleRows: Record<string, string>[] },
    AIMatchingResult
  >(functions, "matchColumns");

  const result = await matchColumns({ headers, sampleRows });
  const data = result.data;

  // Transform AI response to FieldMapping[]
  return headers.map((header) => {
    const mapping = data.mappings.find((m) => m.csvColumn === header);

    // Determine format based on target field
    let format: string | undefined;
    if (mapping?.targetField === "date" && data.suggestedDateFormat) {
      format = data.suggestedDateFormat;
    } else if (mapping?.targetField === "amount" && data.suggestedAmountFormat) {
      format = data.suggestedAmountFormat;
    }

    return {
      csvColumn: header,
      targetField: mapping?.targetField ?? null,
      confidence: mapping?.confidence ?? 0,
      userConfirmed: false,
      keepAsMetadata: !mapping?.targetField,
      format,
    };
  });
}
