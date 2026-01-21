/**
 * Callable Cloud Function for generating Gmail search queries
 * Uses Gemini Flash Lite for intelligent suggestions
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { generateTypedQueriesWithGemini } from "./generateQueriesWithGemini";
import {
  QueryGenerationPartner,
  TypedSuggestion,
} from "./generateSearchQueries";

const db = getFirestore();

interface GenerateSearchQueriesRequest {
  transaction: {
    name: string;
    partner?: string | null;
    description?: string;
    reference?: string;
    partnerId?: string | null;
    partnerType?: "global" | "user" | null;
    amount?: number;
  };
  maxQueries?: number;
}

interface GenerateSearchQueriesResponse {
  queries: string[];
  /** Typed suggestions with category info for UI pills */
  suggestions: TypedSuggestion[];
}

/**
 * Generate Gmail search queries for a transaction using Gemini
 */
export const generateSearchQueriesCallable = onCall<
  GenerateSearchQueriesRequest,
  Promise<GenerateSearchQueriesResponse>
>(
  {
    region: "europe-west1",
    memory: "256MiB",
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const { transaction, maxQueries = 8 } = request.data;

    if (!transaction || !transaction.name) {
      throw new HttpsError("invalid-argument", "Transaction with name is required");
    }

    // Fetch partner data if partnerId is provided
    let partnerData: QueryGenerationPartner | undefined;
    if (transaction.partnerId) {
      const collection = transaction.partnerType === "global" ? "globalPartners" : "partners";
      const partnerDoc = await db.collection(collection).doc(transaction.partnerId).get();

      if (partnerDoc.exists) {
        const data = partnerDoc.data()!;
        partnerData = {
          name: data.name,
          emailDomains: data.emailDomains,
          website: data.website,
          ibans: data.ibans,
          vatId: data.vatId,
          aliases: data.aliases,
          fileSourcePatterns: data.fileSourcePatterns,
        };
      }
    }

    // Generate typed suggestions using Gemini (sorted by search effectiveness)
    const suggestions = await generateTypedQueriesWithGemini(
      {
        name: transaction.name,
        partner: transaction.partner,
        description: transaction.description,
        reference: transaction.reference,
        amount: transaction.amount,
      },
      partnerData,
      maxQueries
    );

    // Also return plain queries for backward compatibility
    const queries = suggestions.map((s) => s.query);

    return {
      queries,
      suggestions,
    };
  }
);
