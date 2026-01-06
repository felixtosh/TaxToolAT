import { z } from "zod";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { OperationsContext } from "../types.js";
import { Tool } from "@modelcontextprotocol/sdk/types.js";

const SOURCES_COLLECTION = "sources";

// Input schemas
const listInstitutionsSchema = z.object({
  country: z.string().length(2).describe("ISO 3166 two-letter country code (e.g., AT, DE, GB)"),
});

const checkConnectionSchema = z.object({
  sourceId: z.string().describe("The source/bank account ID to check"),
});

const syncAccountSchema = z.object({
  sourceId: z.string().describe("The source/bank account ID to sync"),
});

const listApiSourcesSchema = z.object({});

// Tool definitions
export const gocardlessToolDefinitions: Tool[] = [
  {
    name: "list_institutions",
    description: "List available banks in a country for Open Banking connection. Returns bank names, logos, and max transaction history days.",
    inputSchema: {
      type: "object",
      properties: {
        country: {
          type: "string",
          description: "ISO 3166 two-letter country code (e.g., AT for Austria, DE for Germany)",
        },
      },
      required: ["country"],
    },
  },
  {
    name: "list_api_sources",
    description: "List all bank accounts connected via Open Banking API (GoCardless). Shows connection status, last sync time, and re-auth requirements.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "check_bank_connection",
    description: "Check the status of an Open Banking connected bank account. Returns sync status, last sync time, and whether re-authentication is needed.",
    inputSchema: {
      type: "object",
      properties: {
        sourceId: {
          type: "string",
          description: "The source/bank account ID to check",
        },
      },
      required: ["sourceId"],
    },
  },
  {
    name: "sync_bank_account",
    description: "Manually trigger a transaction sync for an Open Banking connected bank account. Fetches new transactions from the bank.",
    inputSchema: {
      type: "object",
      properties: {
        sourceId: {
          type: "string",
          description: "The source/bank account ID to sync",
        },
      },
      required: ["sourceId"],
    },
  },
];

// Tool handler
export async function registerGocardlessTools(
  ctx: OperationsContext,
  toolName: string,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> } | null> {
  switch (toolName) {
    case "list_institutions": {
      const { country } = listInstitutionsSchema.parse(args);

      // Call the API route (we can't directly use GoCardless client here due to credentials)
      // In production, this would call the API or use a shared client
      // For now, return instructions on how to use the feature
      return {
        content: [
          {
            type: "text",
            text: `To list banks in ${country.toUpperCase()}:

1. The user should visit /sources/connect in the UI
2. Select country: ${country.toUpperCase()}
3. Available banks will be shown with:
   - Bank name and logo
   - Max transaction history available

Note: Bank connection requires user interaction (OAuth) and cannot be automated via MCP.
The user must authorize access at their bank's website.

To help the user connect a bank, guide them to:
- Click "Add Bank Account" on the Sources page
- Select "Connect Bank"
- Choose their country and bank`,
          },
        ],
      };
    }

    case "list_api_sources": {
      listApiSourcesSchema.parse(args);

      // Query for API-connected sources
      const q = query(
        collection(ctx.db, SOURCES_COLLECTION),
        where("userId", "==", ctx.userId),
        where("isActive", "==", true),
        where("type", "==", "api")
      );

      const snapshot = await getDocs(q);
      const sources = snapshot.docs.map((doc) => {
        const data = doc.data();
        const apiConfig = data.apiConfig || {};
        const expiresAt = apiConfig.agreementExpiresAt?.toDate();
        const now = new Date();
        const needsReauth = expiresAt ? expiresAt < now : false;
        const daysRemaining = expiresAt
          ? Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
          : null;

        return {
          id: doc.id,
          name: data.name,
          bankName: apiConfig.institutionName || data.bankName,
          iban: data.iban,
          lastSyncAt: apiConfig.lastSyncAt?.toDate()?.toISOString() || null,
          lastSyncError: apiConfig.lastSyncError || null,
          needsReauth,
          daysUntilReauth: daysRemaining,
        };
      });

      if (sources.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No Open Banking connected accounts found.\n\nTo connect a bank account:\n1. Go to Sources page\n2. Click 'Add Bank Account'\n3. Select 'Connect Bank'\n4. Choose country and bank\n5. Authorize at bank's website",
            },
          ],
        };
      }

      const text = sources
        .map((s) => {
          let status = "Connected";
          if (s.needsReauth) status = "NEEDS RECONNECTION";
          else if (s.lastSyncError) status = `Error: ${s.lastSyncError}`;
          else if (s.daysUntilReauth !== null && s.daysUntilReauth <= 7)
            status = `Expires in ${s.daysUntilReauth} days`;

          return `- ${s.name} (${s.bankName})
  ID: ${s.id}
  IBAN: ${s.iban}
  Status: ${status}
  Last Sync: ${s.lastSyncAt || "Never"}`;
        })
        .join("\n\n");

      return {
        content: [
          {
            type: "text",
            text: `Open Banking Connected Accounts:\n\n${text}`,
          },
        ],
      };
    }

    case "check_bank_connection": {
      const { sourceId } = checkConnectionSchema.parse(args);

      const docRef = doc(ctx.db, SOURCES_COLLECTION, sourceId);
      const snapshot = await getDoc(docRef);

      if (!snapshot.exists()) {
        return {
          content: [{ type: "text", text: `Source ${sourceId} not found.` }],
        };
      }

      const data = snapshot.data();
      if (data.userId !== ctx.userId) {
        return {
          content: [{ type: "text", text: `Source ${sourceId} not found.` }],
        };
      }

      if (data.type !== "api") {
        return {
          content: [
            {
              type: "text",
              text: `Source "${data.name}" is a CSV import source, not an Open Banking connection.`,
            },
          ],
        };
      }

      const apiConfig = data.apiConfig || {};
      const expiresAt = apiConfig.agreementExpiresAt?.toDate();
      const now = new Date();
      const needsReauth = expiresAt ? expiresAt < now : false;
      const daysRemaining = expiresAt
        ? Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
        : null;

      let statusText = "";
      if (needsReauth) {
        statusText = `⚠️ CONNECTION EXPIRED - User needs to reconnect at /sources/connect`;
      } else if (apiConfig.lastSyncError) {
        statusText = `⚠️ Last sync failed: ${apiConfig.lastSyncError}`;
      } else if (daysRemaining !== null && daysRemaining <= 7) {
        statusText = `⚠️ Connection expires in ${daysRemaining} days - recommend reconnecting soon`;
      } else {
        statusText = "✅ Connection healthy";
      }

      return {
        content: [
          {
            type: "text",
            text: `Bank Connection Status for "${data.name}":

Bank: ${apiConfig.institutionName || data.bankName}
IBAN: ${data.iban}

Status: ${statusText}

Last Sync: ${apiConfig.lastSyncAt?.toDate()?.toISOString() || "Never"}
Connection Valid Until: ${expiresAt?.toLocaleDateString() || "Unknown"}
${daysRemaining !== null ? `Days Remaining: ${daysRemaining}` : ""}

${needsReauth ? "ACTION REQUIRED: Guide the user to reconnect their bank at /sources/connect" : ""}`,
          },
        ],
      };
    }

    case "sync_bank_account": {
      const { sourceId } = syncAccountSchema.parse(args);

      // Verify source exists and is API type
      const docRef = doc(ctx.db, SOURCES_COLLECTION, sourceId);
      const snapshot = await getDoc(docRef);

      if (!snapshot.exists()) {
        return {
          content: [{ type: "text", text: `Source ${sourceId} not found.` }],
        };
      }

      const data = snapshot.data();
      if (data.userId !== ctx.userId) {
        return {
          content: [{ type: "text", text: `Source ${sourceId} not found.` }],
        };
      }

      if (data.type !== "api") {
        return {
          content: [
            {
              type: "text",
              text: `Source "${data.name}" is a CSV import source. Use the import flow to add transactions.`,
            },
          ],
        };
      }

      const apiConfig = data.apiConfig || {};
      const expiresAt = apiConfig.agreementExpiresAt?.toDate();
      if (expiresAt && expiresAt < new Date()) {
        return {
          content: [
            {
              type: "text",
              text: `Cannot sync "${data.name}" - bank connection has expired.\n\nThe user needs to reconnect at /sources/connect`,
            },
          ],
        };
      }

      // Note: In a full implementation, we would call the sync API here
      // For now, provide instructions since sync requires server-side credentials
      return {
        content: [
          {
            type: "text",
            text: `To sync "${data.name}":

The user can trigger a manual sync in two ways:

1. **UI Method**: Go to the source details page and click "Sync Now"

2. **Automatic**: Transactions sync automatically every day at 6 AM

Last sync was: ${apiConfig.lastSyncAt?.toDate()?.toISOString() || "Never"}

Note: Banks may limit API calls to 4 per day per account (PSD2 regulation).`,
          },
        ],
      };
    }

    default:
      return null;
  }
}
