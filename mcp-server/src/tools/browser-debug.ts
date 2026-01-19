import { z } from "zod";
import {
  collection,
  query,
  orderBy,
  where,
  getDocs,
  getDoc,
  doc,
  limit as limitQuery,
} from "firebase/firestore";
import { OperationsContext } from "../types.js";
import { Tool } from "@modelcontextprotocol/sdk/types.js";

const DEBUG_LOGS_COLLECTION = "browser_debug_logs";

// Input schemas
const listLogsSchema = z.object({
  limit: z.number().optional().default(10).describe("Max results (default 10, max 50)"),
  url: z.string().optional().describe("Filter by URL pattern"),
});

const getLogSchema = z.object({
  logId: z.string().describe("The debug log ID"),
});

// Tool definitions
export const browserDebugToolDefinitions: Tool[] = [
  {
    name: "list_browser_debug_logs",
    description:
      "List recent browser extension debug logs. Use this to see what the extension captured on pages, including page snapshots, detected elements, and fetch attempts.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 10, max 50)" },
        url: { type: "string", description: "Filter by URL pattern" },
      },
    },
  },
  {
    name: "get_browser_debug_log",
    description:
      "Get full details of a browser debug log including page snapshot, detected buttons/menus, and fetch attempt results. Use this to analyze why PDF downloads might be failing.",
    inputSchema: {
      type: "object",
      properties: {
        logId: { type: "string", description: "The debug log ID" },
      },
      required: ["logId"],
    },
  },
];

// Tool handlers
export async function registerBrowserDebugTools(
  ctx: OperationsContext,
  toolName: string,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> } | null> {
  switch (toolName) {
    case "list_browser_debug_logs": {
      const { limit, url } = listLogsSchema.parse(args);

      const maxLimit = Math.min(limit || 10, 50);

      const q = query(
        collection(ctx.db, DEBUG_LOGS_COLLECTION),
        where("userId", "==", ctx.userId),
        orderBy("createdAt", "desc"),
        limitQuery(maxLimit)
      );

      const snapshot = await getDocs(q);

      interface LogDoc {
        id: string;
        url?: string;
        type?: string;
        runId?: string;
        createdAt?: { toDate?: () => Date };
        pageSnapshot?: {
          title?: string;
          tables?: number;
          buttons?: Array<unknown>;
          menus?: number;
        };
        fetchAttempts?: Array<unknown>;
        [key: string]: unknown;
      }

      let logs: LogDoc[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        // Return summary (without full bodyHTML)
        return {
          id: docSnap.id,
          url: data.url,
          type: data.type,
          runId: data.runId,
          createdAt: data.createdAt,
          // Summary of page snapshot
          pageSnapshot: data.pageSnapshot
            ? {
                title: data.pageSnapshot.title,
                tables: data.pageSnapshot.tables,
                buttonsCount: data.pageSnapshot.buttons?.length || 0,
                menus: data.pageSnapshot.menus,
              }
            : undefined,
          fetchAttemptsCount: data.fetchAttempts?.length || 0,
        };
      });

      // Client-side URL filtering
      if (url) {
        const filterLower = url.toLowerCase();
        logs = logs.filter((log) => log.url && log.url.toLowerCase().includes(filterLower));
      }

      return {
        content: [{ type: "text", text: JSON.stringify(logs, null, 2) }],
      };
    }

    case "get_browser_debug_log": {
      const { logId } = getLogSchema.parse(args);

      const docRef = doc(ctx.db, DEBUG_LOGS_COLLECTION, logId);
      const snapshot = await getDoc(docRef);

      if (!snapshot.exists()) {
        return {
          content: [{ type: "text", text: `Debug log ${logId} not found` }],
        };
      }

      const data = snapshot.data();
      if (data.userId !== ctx.userId) {
        return {
          content: [{ type: "text", text: `Debug log ${logId} not found` }],
        };
      }

      // Return full data including bodyHTML (might be large)
      const fullLog = {
        id: snapshot.id,
        ...data,
        // Truncate bodyHTML for safety in response
        pageSnapshot: data.pageSnapshot
          ? {
              ...data.pageSnapshot,
              bodyHTML: data.pageSnapshot.bodyHTML
                ? `[${data.pageSnapshot.bodyHTML.length} chars - use for analysis]:\n${data.pageSnapshot.bodyHTML.slice(0, 10000)}${data.pageSnapshot.bodyHTML.length > 10000 ? "..." : ""}`
                : null,
            }
          : null,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(fullLog, null, 2) }],
      };
    }

    default:
      return null;
  }
}
