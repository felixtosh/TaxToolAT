/**
 * Admin Test Runner API
 *
 * Triggers test suites and returns results.
 * Admin only.
 */

import { NextResponse } from "next/server";
import { getAdminDb, getAdminApp } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";
import { runChatTests, getDefaultTestCases, TestRunResult } from "@/lib/testing/chat-test-runner";

const db = getAdminDb();

const SUPER_ADMIN_EMAIL = "felix@i7v6.com";

// Verify admin status by looking up user
async function isAdmin(userId: string): Promise<boolean> {
  try {
    const app = getAdminApp();
    const user = await getAuth(app).getUser(userId);
    return user.customClaims?.admin === true || user.email === SUPER_ADMIN_EMAIL;
  } catch (error) {
    console.error("[isAdmin] Error:", error);
    return false;
  }
}

// Extract userId from Authorization header
async function getUserIdFromToken(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.replace("Bearer ", "");

  try {
    const app = getAdminApp();
    const decodedToken = await getAuth(app).verifyIdToken(token);
    return decodedToken.uid;
  } catch (error) {
    console.error("[getUserIdFromToken] Error:", error);
    return null;
  }
}

export async function POST(req: Request) {
  const userId = await getUserIdFromToken(req);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await isAdmin(userId))) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await req.json();
  const { suite, category, tags } = body as {
    suite: "chat" | "cloud-functions";
    category?: string;
    tags?: string[];
  };

  if (suite === "chat") {
    // Run chat tests
    const authHeader = req.headers.get("Authorization") || "";

    // Get base URL from request
    const url = new URL(req.url);
    const baseUrl = `${url.protocol}//${url.host}`;

    const result = await runChatTests({
      baseUrl,
      authToken: authHeader.replace("Bearer ", ""),
      userId,
      category: category as "tool-calling" | "response-quality" | "error-handling" | "conversation" | undefined,
      tags,
      logToLangfuse: true,
      onProgress: (completed, total) => {
        console.log(`[Chat Tests] Progress: ${completed}/${total}`);
      },
    });

    // Store test run result (remove undefined values which Firestore rejects)
    const sanitizedResult = JSON.parse(JSON.stringify(result));
    await db.collection("testRuns").doc(result.runId).set({
      ...sanitizedResult,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      triggeredBy: userId,
      suite: "chat",
    });

    return NextResponse.json(result);
  }

  if (suite === "cloud-functions") {
    // For cloud functions, we return instructions since these run via CLI
    return NextResponse.json({
      message: "Cloud Function tests should be run via CLI",
      instructions: [
        "cd functions",
        "npm test",
        "# Or with watch mode:",
        "npm run test:watch",
      ],
      note: "Firebase Emulator Suite can be started with: firebase emulators:start",
    });
  }

  return NextResponse.json({ error: "Invalid suite" }, { status: 400 });
}

export async function GET(req: Request) {
  const userId = await getUserIdFromToken(req);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify admin
  if (!(await isAdmin(userId))) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  if (action === "list-tests") {
    // Return available test cases
    return NextResponse.json({
      chatTests: getDefaultTestCases(),
    });
  }

  if (action === "history") {
    // Return recent test runs
    const runs = await db
      .collection("testRuns")
      .orderBy("startedAt", "desc")
      .limit(20)
      .get();

    return NextResponse.json({
      runs: runs.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })),
    });
  }

  return NextResponse.json({
    endpoints: {
      "POST /api/admin/tests": "Run tests",
      "GET /api/admin/tests?action=list-tests": "List available test cases",
      "GET /api/admin/tests?action=history": "Get test run history",
    },
  });
}
