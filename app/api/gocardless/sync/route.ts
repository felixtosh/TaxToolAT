export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { initializeApp, getApps } from "firebase/app";
export const dynamic = "force-dynamic";
import { getFirestore } from "firebase/firestore";
export const dynamic = "force-dynamic";
import { syncTransactions, getSyncStatus, checkReauthRequired } from "@/lib/operations";
export const dynamic = "force-dynamic";
import { ReauthRequiredError, RateLimitError } from "@/lib/gocardless";
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

const appName = "gocardless-sync";
const app = getApps().find(a => a.name === appName) || initializeApp(firebaseConfig, appName);
const db = getFirestore(app);

/**
 * POST /api/gocardless/sync
 * Trigger manual transaction sync for a source
 *
 * Body: { sourceId }
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserIdWithFallback(request);
    const body = await request.json();
    const { sourceId } = body;

    if (!sourceId) {
      return NextResponse.json(
        { error: "sourceId is required" },
        { status: 400 }
      );
    }

    const ctx = { db, userId };

    // Check if re-auth is needed first
    const reauthCheck = await checkReauthRequired(ctx, sourceId);
    if (reauthCheck.required) {
      return NextResponse.json(
        {
          error: "Re-authentication required",
          code: "REAUTH_REQUIRED",
          expiresAt: reauthCheck.expiresAt?.toISOString(),
        },
        { status: 403 }
      );
    }

    // Perform sync
    const result = await syncTransactions(ctx, sourceId);

    return NextResponse.json({
      success: true,
      imported: result.imported,
      skipped: result.skipped,
    });
  } catch (error) {
    console.error("Error syncing transactions:", error);

    if (error instanceof ReauthRequiredError) {
      return NextResponse.json(
        {
          error: "Re-authentication required",
          code: "REAUTH_REQUIRED",
          expiresAt: error.expiresAt.toISOString(),
        },
        { status: 403 }
      );
    }

    if (error instanceof RateLimitError) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded. Please try again later.",
          code: "RATE_LIMIT",
          retryAfter: error.retryAfter,
        },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sync transactions" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/gocardless/sync?sourceId={id}
 * Get sync status for a source
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getServerUserIdWithFallback(request);
    const sourceId = request.nextUrl.searchParams.get("sourceId");

    if (!sourceId) {
      return NextResponse.json(
        { error: "sourceId is required" },
        { status: 400 }
      );
    }

    const ctx = { db, userId };
    const status = await getSyncStatus(ctx, sourceId);

    return NextResponse.json({
      status: {
        lastSyncAt: status.lastSyncAt?.toISOString() || null,
        lastSyncError: status.lastSyncError || null,
        needsReauth: status.needsReauth,
        reauthExpiresAt: status.reauthExpiresAt?.toISOString() || null,
        reauthDaysRemaining: status.reauthDaysRemaining ?? null,
      },
    });
  } catch (error) {
    console.error("Error getting sync status:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get sync status" },
      { status: 500 }
    );
  }
}
