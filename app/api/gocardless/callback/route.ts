import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getRequisitionByGoCardlessId, refreshRequisitionStatus } from "@/lib/operations";

// Initialize Firebase for server-side
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDhxXMbHgaD1z9n0bkuVaSRmmiCrbNL-l4",
  authDomain: "taxstudio-f12fb.firebaseapp.com",
  projectId: "taxstudio-f12fb",
  storageBucket: "taxstudio-f12fb.firebasestorage.app",
  messagingSenderId: "534848611676",
  appId: "1:534848611676:web:8a3d1ede57c65b7e884d99",
};

const appName = "gocardless-callback";
const app = getApps().find(a => a.name === appName) || initializeApp(firebaseConfig, appName);
const db = getFirestore(app);

const MOCK_USER_ID = "dev-user-123";

/**
 * GET /api/gocardless/callback
 *
 * OAuth callback from GoCardless after user authorizes at bank.
 *
 * Query params:
 * - ref: GoCardless requisition ID
 * - error: Error code (if authorization failed)
 * - details: Error details (if authorization failed)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const gcRequisitionId = searchParams.get("ref");
  const error = searchParams.get("error");
  const errorDetails = searchParams.get("details");

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Handle errors from bank
  if (error) {
    const errorMessage = encodeURIComponent(errorDetails || error);
    return NextResponse.redirect(
      new URL(`/sources/connect/error?message=${errorMessage}`, baseUrl)
    );
  }

  // Validate requisition ID
  if (!gcRequisitionId) {
    return NextResponse.redirect(
      new URL("/sources/connect/error?message=Missing%20requisition%20reference", baseUrl)
    );
  }

  try {
    const ctx = { db, userId: MOCK_USER_ID };

    // Find our requisition by GoCardless ID
    const requisition = await getRequisitionByGoCardlessId(ctx, gcRequisitionId);

    if (!requisition) {
      return NextResponse.redirect(
        new URL("/sources/connect/error?message=Requisition%20not%20found", baseUrl)
      );
    }

    // Refresh status from GoCardless to get account IDs
    const updatedRequisition = await refreshRequisitionStatus(ctx, requisition.id);

    // Check if authorization succeeded
    if (updatedRequisition.status === "LN") {
      // Success - redirect to account selection
      // Include sourceId if we're linking to an existing source
      const params = new URLSearchParams({ requisitionId: requisition.id });
      if (updatedRequisition.linkToSourceId) {
        params.set("sourceId", updatedRequisition.linkToSourceId);
      }
      return NextResponse.redirect(
        new URL(`/sources/connect/accounts?${params.toString()}`, baseUrl)
      );
    }

    if (updatedRequisition.status === "RJ") {
      return NextResponse.redirect(
        new URL("/sources/connect/error?message=Bank%20authorization%20was%20rejected", baseUrl)
      );
    }

    if (updatedRequisition.status === "EX") {
      return NextResponse.redirect(
        new URL("/sources/connect/error?message=Bank%20connection%20request%20expired", baseUrl)
      );
    }

    // Still in progress - redirect to waiting page
    return NextResponse.redirect(
      new URL(`/sources/connect/pending?requisitionId=${requisition.id}`, baseUrl)
    );
  } catch (err) {
    console.error("Error handling GoCardless callback:", err);
    const message = encodeURIComponent(
      err instanceof Error ? err.message : "An unexpected error occurred"
    );
    return NextResponse.redirect(
      new URL(`/sources/connect/error?message=${message}`, baseUrl)
    );
  }
}
