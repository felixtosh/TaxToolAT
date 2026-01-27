export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { initializeApp, getApps } from "firebase/app";
export const dynamic = "force-dynamic";
import { getFirestore } from "firebase/firestore";
export const dynamic = "force-dynamic";
import {
  getRequisitionAccounts,
  createSourceFromGoCardless,
  linkGoCardlessToExistingSource,
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

const appName = "gocardless-accounts";
const app = getApps().find(a => a.name === appName) || initializeApp(firebaseConfig, appName);
const db = getFirestore(app);

/**
 * GET /api/gocardless/accounts?requisitionId={id}
 * List accounts available in a requisition
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getServerUserIdWithFallback(request);
    const requisitionId = request.nextUrl.searchParams.get("requisitionId");

    if (!requisitionId) {
      return NextResponse.json(
        { error: "requisitionId is required" },
        { status: 400 }
      );
    }

    const ctx = { db, userId };
    const accounts = await getRequisitionAccounts(ctx, requisitionId);

    return NextResponse.json({ accounts });
  } catch (error) {
    console.error("Error fetching accounts:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch accounts" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/gocardless/accounts
 * Create a source from a GoCardless account OR link to existing source
 *
 * Body: { requisitionId, accountId, name, sourceId? }
 * - If sourceId is provided: links GoCardless to existing source
 * - If sourceId is not provided: creates a new source
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserIdWithFallback(request);
    const body = await request.json();
    const { requisitionId, accountId, name, sourceId } = body;

    if (!requisitionId || !accountId) {
      return NextResponse.json(
        { error: "requisitionId and accountId are required" },
        { status: 400 }
      );
    }

    const ctx = { db, userId };

    // If sourceId is provided, link to existing source
    if (sourceId) {
      await linkGoCardlessToExistingSource(ctx, requisitionId, accountId, sourceId);
      return NextResponse.json({ sourceId, linked: true });
    }

    // Otherwise create a new source
    if (!name) {
      return NextResponse.json(
        { error: "name is required when creating a new source" },
        { status: 400 }
      );
    }

    const newSourceId = await createSourceFromGoCardless(ctx, requisitionId, accountId, name);
    return NextResponse.json({ sourceId: newSourceId, linked: false });
  } catch (error) {
    console.error("Error creating/linking source:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create/link source" },
      { status: 500 }
    );
  }
}
