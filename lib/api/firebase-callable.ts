/**
 * Server-side Firebase Callable Functions Client
 *
 * Allows calling Firebase callable functions from server-side code (API routes)
 * using the same HTTP protocol as the client SDK.
 *
 * Supports both production and Firebase emulator (detected via NODE_ENV=development).
 */

const FIREBASE_PROJECT_ID = "taxstudio-f12fb";
const FIREBASE_REGION = "europe-west1";

// Use emulator in development mode (matching client-side config in lib/firebase/config.ts)
const USE_EMULATOR = process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_USE_EMULATORS !== "false";
const EMULATOR_HOST = "127.0.0.1:5001";

/**
 * Call a Firebase callable function from the server
 *
 * @param functionName - Name of the callable function (e.g., "lookupCompany")
 * @param data - Request data to send to the function
 * @param authToken - Optional Firebase ID token for authenticated calls
 */
export async function callFirebaseFunction<TRequest, TResponse>(
  functionName: string,
  data: TRequest,
  authToken?: string
): Promise<TResponse> {
  // Use emulator URL in development, otherwise production
  const url = USE_EMULATOR
    ? `http://${EMULATOR_HOST}/${FIREBASE_PROJECT_ID}/${FIREBASE_REGION}/${functionName}`
    : `https://${FIREBASE_REGION}-${FIREBASE_PROJECT_ID}.cloudfunctions.net/${functionName}`;

  console.log(`[Firebase Callable] Calling ${functionName} at ${url}`);
  console.log(`[Firebase Callable] Auth token present:`, !!authToken);
  console.log(`[Firebase Callable] Using emulator:`, USE_EMULATOR);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (authToken) {
    // Remove "Bearer " prefix if present
    const token = authToken.startsWith("Bearer ") ? authToken.slice(7) : authToken;
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ data }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Firebase Callable] ${functionName} HTTP error:`, response.status, errorText);
      throw new Error(`Firebase function ${functionName} failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log(`[Firebase Callable] ${functionName} completed successfully`);

    // Firebase callable functions wrap response in { result: ... }
    return result.result as TResponse;
  } catch (err) {
    console.error(`[Firebase Callable] ${functionName} exception:`, err);
    throw err;
  }
}

// ============================================================================
// Typed Function Callers
// ============================================================================

/**
 * Company info returned from lookupCompany
 */
export interface CompanyInfo {
  name?: string;
  aliases?: string[];
  vatId?: string;
  website?: string;
  country?: string;
  address?: {
    street?: string;
    city?: string;
    postalCode?: string;
    country?: string;
  };
}

/**
 * VAT lookup result from lookupByVatId
 */
export interface VatLookupResult extends CompanyInfo {
  viesValid?: boolean;
  viesError?: string;
}

/**
 * Look up company information by URL or name using Gemini with Google Search
 */
export async function lookupCompany(
  params: { url?: string; name?: string },
  authToken?: string
): Promise<CompanyInfo> {
  return callFirebaseFunction<typeof params, CompanyInfo>("lookupCompany", params, authToken);
}

/**
 * Look up and validate a VAT ID using the EU VIES service
 */
export async function lookupByVatId(
  vatId: string,
  authToken?: string
): Promise<VatLookupResult> {
  return callFirebaseFunction<{ vatId: string }, VatLookupResult>(
    "lookupByVatId",
    { vatId },
    authToken
  );
}
