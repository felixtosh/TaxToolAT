export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { initializeApp, getApps } from "firebase/app";
export const dynamic = "force-dynamic";
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  deleteField,
} from "firebase/firestore";
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

const appName = "source-disconnect";
const app = getApps().find(a => a.name === appName) || initializeApp(firebaseConfig, appName);
const db = getFirestore(app);

// Connect to emulator in development
if (process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_USE_EMULATORS !== "false") {
  try {
    connectFirestoreEmulator(db, "localhost", 8080);
    console.log("[Source Disconnect] Connected to Firestore emulator");
  } catch {
    // Already connected
  }
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/sources/[id]/disconnect
 * Disconnect a bank connection from a source and delete synced transactions
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await getServerUserIdWithFallback(request);
    const { id: sourceId } = await params;

    console.log(`[Source Disconnect] Disconnecting source: ${sourceId}`);

    // Get the source
    const sourceRef = doc(db, "sources", sourceId);
    const sourceSnap = await getDoc(sourceRef);

    if (!sourceSnap.exists()) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    const source = sourceSnap.data();

    if (source.userId !== userId) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    if (source.type !== "api" || !source.apiConfig) {
      return NextResponse.json(
        { error: "Source is not connected to a bank" },
        { status: 400 }
      );
    }

    // Delete all transactions that were synced via API (no importJobId)
    const transactionsQuery = query(
      collection(db, "transactions"),
      where("sourceId", "==", sourceId),
      where("importJobId", "==", null)
    );

    const transactionsSnap = await getDocs(transactionsQuery);
    let deletedTransactions = 0;

    for (const txDoc of transactionsSnap.docs) {
      await deleteDoc(txDoc.ref);
      deletedTransactions++;
    }

    console.log(`[Source Disconnect] Deleted ${deletedTransactions} synced transactions`);

    // Update source to remove API connection
    await updateDoc(sourceRef, {
      type: "csv",
      apiConfig: deleteField(),
      updatedAt: new Date(),
    });

    console.log(`[Source Disconnect] Source ${sourceId} disconnected successfully`);

    return NextResponse.json({
      success: true,
      deletedTransactions,
    });
  } catch (error) {
    console.error("[Source Disconnect] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to disconnect" },
      { status: 500 }
    );
  }
}
