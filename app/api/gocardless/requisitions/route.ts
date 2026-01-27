export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { initializeApp, getApps } from "firebase/app";
export const dynamic = "force-dynamic";
import { getFirestore } from "firebase/firestore";
export const dynamic = "force-dynamic";
import {
  createRequisition,
  listRequisitions,
  getRequisition,
  deleteRequisition,
  refreshRequisitionStatus,
} from "@/lib/operations";
export const dynamic = "force-dynamic";
import { getServerUserIdWithFallback } from "@/lib/auth/get-server-user";

// Initialize Firebase for server-side
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDhxXMbHgaD1z9n0bkuVaSRmmiCrbNL-l4",
  authDomain: "taxstudio-f12fb.firebaseapp.com",
  projectId: "taxstudio-f12fb",
  storageBucket: "taxstudio-f12fb.firebasestorage.app",
  messagingSenderId: "534848611676",
  appId: "1:534848611676:web:8a3d1ede57c65b7e884d99",
};

const appName = "gocardless-requisitions";
const app = getApps().find(a => a.name === appName) || initializeApp(firebaseConfig, appName);
const db = getFirestore(app);

/**
 * POST /api/gocardless/requisitions
 * Create a new requisition (bank connection request)
 *
 * Body: { institutionId, sourceId? }
 * - sourceId: Optional existing source ID to link after auth
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserIdWithFallback(request);
    const body = await request.json();
    const { institutionId, sourceId } = body;

    if (!institutionId) {
      return NextResponse.json(
        { error: "institutionId is required" },
        { status: 400 }
      );
    }

    const ctx = { db, userId };
    const result = await createRequisition(ctx, institutionId, sourceId);

    return NextResponse.json({
      requisitionId: result.requisitionId,
      link: result.link,
      expiresAt: result.expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("Error creating requisition:", error);

    if (error instanceof Error && error.message.includes("credentials not configured")) {
      return NextResponse.json(
        { error: "GoCardless is not configured" },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create requisition" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/gocardless/requisitions
 * List all requisitions for the current user
 *
 * GET /api/gocardless/requisitions?id={requisitionId}
 * Get a specific requisition
 *
 * GET /api/gocardless/requisitions?id={requisitionId}&refresh=true
 * Refresh requisition status from GoCardless
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getServerUserIdWithFallback(request);
    const ctx = { db, userId };
    const requisitionId = request.nextUrl.searchParams.get("id");
    const refresh = request.nextUrl.searchParams.get("refresh") === "true";

    if (requisitionId) {
      // Get specific requisition
      if (refresh) {
        const requisition = await refreshRequisitionStatus(ctx, requisitionId);
        return NextResponse.json({ requisition });
      }

      const requisition = await getRequisition(ctx, requisitionId);
      if (!requisition) {
        return NextResponse.json(
          { error: "Requisition not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({ requisition });
    }

    // List all requisitions
    const requisitions = await listRequisitions(ctx);
    return NextResponse.json({ requisitions });
  } catch (error) {
    console.error("Error fetching requisitions:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch requisitions" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/gocardless/requisitions?id={requisitionId}
 * Delete a requisition
 */
export async function DELETE(request: NextRequest) {
  try {
    const userId = await getServerUserIdWithFallback(request);
    const requisitionId = request.nextUrl.searchParams.get("id");

    if (!requisitionId) {
      return NextResponse.json(
        { error: "Requisition ID is required" },
        { status: 400 }
      );
    }

    const ctx = { db, userId };
    await deleteRequisition(ctx, requisitionId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting requisition:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete requisition" },
      { status: 500 }
    );
  }
}
