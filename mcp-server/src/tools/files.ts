import { z } from "zod";
import {
  collection,
  query,
  orderBy,
  where,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  deleteDoc,
  writeBatch,
  Timestamp,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { OperationsContext } from "../types.js";
import { Tool } from "@modelcontextprotocol/sdk/types.js";

const FILES_COLLECTION = "files";
const FILE_CONNECTIONS_COLLECTION = "fileConnections";
const TRANSACTIONS_COLLECTION = "transactions";

// Input schemas
const listFilesSchema = z.object({
  search: z.string().optional().describe("Search in filename or partner"),
  hasConnections: z.boolean().optional().describe("Filter by connection status"),
  extractionComplete: z.boolean().optional().describe("Filter by extraction status"),
  limit: z.number().optional().default(50).describe("Max results (default 50)"),
});

const getFileSchema = z.object({
  fileId: z.string().describe("The file ID"),
});

const updateFileSchema = z.object({
  fileId: z.string().describe("The file ID to update"),
  extractedAmount: z.number().optional().describe("Amount in cents"),
  extractedVatPercent: z.number().optional().describe("VAT percentage (0-100)"),
  extractedPartner: z.string().optional().describe("Partner/company name"),
});

const deleteFileSchema = z.object({
  fileId: z.string().describe("The file ID to delete"),
});

const connectFileSchema = z.object({
  fileId: z.string().describe("The file ID to connect"),
  transactionId: z.string().describe("The transaction ID to connect to"),
});

const disconnectFileSchema = z.object({
  fileId: z.string().describe("The file ID to disconnect"),
  transactionId: z.string().describe("The transaction ID to disconnect from"),
});

const getFilesForTransactionSchema = z.object({
  transactionId: z.string().describe("The transaction ID"),
});

// Tool definitions
export const fileToolDefinitions: Tool[] = [
  {
    name: "list_files",
    description: "List uploaded files (PDFs/images) with optional filters",
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Search in filename or extracted partner" },
        hasConnections: { type: "boolean", description: "Filter by connection status" },
        extractionComplete: { type: "boolean", description: "Filter by extraction status" },
        limit: { type: "number", description: "Max results (default 50, max 100)" },
      },
    },
  },
  {
    name: "get_file",
    description: "Get a single file by ID with full details",
    inputSchema: {
      type: "object",
      properties: {
        fileId: { type: "string", description: "The file ID" },
      },
      required: ["fileId"],
    },
  },
  {
    name: "update_file",
    description: "Update a file's extracted data (amount, VAT, partner)",
    inputSchema: {
      type: "object",
      properties: {
        fileId: { type: "string", description: "The file ID to update" },
        extractedAmount: { type: "number", description: "Amount in cents" },
        extractedVatPercent: { type: "number", description: "VAT percentage (0-100)" },
        extractedPartner: { type: "string", description: "Partner/company name" },
      },
      required: ["fileId"],
    },
  },
  {
    name: "delete_file",
    description: "Delete a file and all its transaction connections",
    inputSchema: {
      type: "object",
      properties: {
        fileId: { type: "string", description: "The file ID to delete" },
      },
      required: ["fileId"],
    },
  },
  {
    name: "connect_file_to_transaction",
    description: "Connect a file to a transaction (many-to-many relationship)",
    inputSchema: {
      type: "object",
      properties: {
        fileId: { type: "string", description: "The file ID to connect" },
        transactionId: { type: "string", description: "The transaction ID to connect to" },
      },
      required: ["fileId", "transactionId"],
    },
  },
  {
    name: "disconnect_file_from_transaction",
    description: "Disconnect a file from a transaction",
    inputSchema: {
      type: "object",
      properties: {
        fileId: { type: "string", description: "The file ID to disconnect" },
        transactionId: { type: "string", description: "The transaction ID to disconnect from" },
      },
      required: ["fileId", "transactionId"],
    },
  },
  {
    name: "get_files_for_transaction",
    description: "Get all files connected to a transaction",
    inputSchema: {
      type: "object",
      properties: {
        transactionId: { type: "string", description: "The transaction ID" },
      },
      required: ["transactionId"],
    },
  },
];

// Tool handlers
export async function registerFileTools(
  ctx: OperationsContext,
  toolName: string,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> } | null> {
  switch (toolName) {
    case "list_files": {
      const { search, hasConnections, extractionComplete, limit } = listFilesSchema.parse(args);

      const constraints: Parameters<typeof query>[1][] = [
        where("userId", "==", ctx.userId),
        orderBy("uploadedAt", "desc"),
      ];

      if (extractionComplete !== undefined) {
        constraints.push(where("extractionComplete", "==", extractionComplete));
      }

      const q = query(collection(ctx.db, FILES_COLLECTION), ...constraints);
      const snapshot = await getDocs(q);

      type FileDoc = {
        id: string;
        fileName?: string;
        extractedPartner?: string;
        transactionIds?: string[];
        [key: string]: unknown;
      };

      let files: FileDoc[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Client-side filters
      if (search) {
        const searchLower = search.toLowerCase();
        files = files.filter(
          (f) =>
            (f.fileName?.toLowerCase() || "").includes(searchLower) ||
            (f.extractedPartner?.toLowerCase() || "").includes(searchLower)
        );
      }

      if (hasConnections !== undefined) {
        files = files.filter((f) =>
          hasConnections
            ? (f.transactionIds?.length || 0) > 0
            : (f.transactionIds?.length || 0) === 0
        );
      }

      // Apply limit
      const maxLimit = Math.min(limit || 50, 100);
      files = files.slice(0, maxLimit);

      return {
        content: [{ type: "text", text: JSON.stringify(files, null, 2) }],
      };
    }

    case "get_file": {
      const { fileId } = getFileSchema.parse(args);

      const docRef = doc(ctx.db, FILES_COLLECTION, fileId);
      const snapshot = await getDoc(docRef);

      if (!snapshot.exists()) {
        return {
          content: [{ type: "text", text: `File ${fileId} not found` }],
        };
      }

      const data = snapshot.data();
      if (data.userId !== ctx.userId) {
        return {
          content: [{ type: "text", text: `File ${fileId} not found` }],
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify({ id: snapshot.id, ...data }, null, 2) }],
      };
    }

    case "update_file": {
      const { fileId, ...updates } = updateFileSchema.parse(args);

      // Verify ownership
      const docRef = doc(ctx.db, FILES_COLLECTION, fileId);
      const snapshot = await getDoc(docRef);

      if (!snapshot.exists() || snapshot.data().userId !== ctx.userId) {
        return {
          content: [{ type: "text", text: `File ${fileId} not found` }],
        };
      }

      // Filter out undefined values
      const cleanUpdates: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          cleanUpdates[key] = value;
        }
      }

      await updateDoc(docRef, {
        ...cleanUpdates,
        updatedAt: Timestamp.now(),
      });

      return {
        content: [{ type: "text", text: `Updated file ${fileId}` }],
      };
    }

    case "delete_file": {
      const { fileId } = deleteFileSchema.parse(args);

      // Verify ownership
      const docRef = doc(ctx.db, FILES_COLLECTION, fileId);
      const snapshot = await getDoc(docRef);

      if (!snapshot.exists() || snapshot.data().userId !== ctx.userId) {
        return {
          content: [{ type: "text", text: `File ${fileId} not found` }],
        };
      }

      const fileData = snapshot.data();
      const transactionIds = fileData.transactionIds || [];

      const BATCH_SIZE = 500;
      let deletedConnections = 0;

      // Delete all connections
      const connectionsQuery = query(
        collection(ctx.db, FILE_CONNECTIONS_COLLECTION),
        where("fileId", "==", fileId),
        where("userId", "==", ctx.userId)
      );
      const connectionsSnapshot = await getDocs(connectionsQuery);

      for (let i = 0; i < connectionsSnapshot.docs.length; i += BATCH_SIZE) {
        const batch = writeBatch(ctx.db);
        const chunk = connectionsSnapshot.docs.slice(i, i + BATCH_SIZE);
        const now = Timestamp.now();

        for (const connDoc of chunk) {
          batch.delete(connDoc.ref);

          // Also update the transaction's fileIds array
          const connData = connDoc.data();
          const txRef = doc(ctx.db, TRANSACTIONS_COLLECTION, connData.transactionId);
          batch.update(txRef, {
            fileIds: arrayRemove(fileId),
            updatedAt: now,
          });

          deletedConnections++;
        }

        await batch.commit();
      }

      // Delete the file document
      await deleteDoc(docRef);

      return {
        content: [
          {
            type: "text",
            text: `Deleted file ${fileId} (${deletedConnections} connections removed)`,
          },
        ],
      };
    }

    case "connect_file_to_transaction": {
      const { fileId, transactionId } = connectFileSchema.parse(args);

      // Verify file ownership
      const fileRef = doc(ctx.db, FILES_COLLECTION, fileId);
      const fileSnapshot = await getDoc(fileRef);

      if (!fileSnapshot.exists() || fileSnapshot.data().userId !== ctx.userId) {
        return {
          content: [{ type: "text", text: `File ${fileId} not found` }],
        };
      }

      // Verify transaction ownership
      const txRef = doc(ctx.db, TRANSACTIONS_COLLECTION, transactionId);
      const txSnapshot = await getDoc(txRef);

      if (!txSnapshot.exists() || txSnapshot.data().userId !== ctx.userId) {
        return {
          content: [{ type: "text", text: `Transaction ${transactionId} not found` }],
        };
      }

      // Check if already connected
      const existingQuery = query(
        collection(ctx.db, FILE_CONNECTIONS_COLLECTION),
        where("fileId", "==", fileId),
        where("transactionId", "==", transactionId),
        where("userId", "==", ctx.userId)
      );
      const existingSnapshot = await getDocs(existingQuery);

      if (!existingSnapshot.empty) {
        return {
          content: [{ type: "text", text: `File is already connected to this transaction` }],
        };
      }

      const now = Timestamp.now();
      const batch = writeBatch(ctx.db);

      // Create connection document
      const connectionRef = doc(collection(ctx.db, FILE_CONNECTIONS_COLLECTION));
      batch.set(connectionRef, {
        fileId,
        transactionId,
        userId: ctx.userId,
        connectionType: "manual",
        createdAt: now,
      });

      // Update file's transactionIds
      batch.update(fileRef, {
        transactionIds: arrayUnion(transactionId),
        updatedAt: now,
      });

      // Update transaction's fileIds
      batch.update(txRef, {
        fileIds: arrayUnion(fileId),
        updatedAt: now,
      });

      await batch.commit();

      return {
        content: [
          {
            type: "text",
            text: `Connected file ${fileId} to transaction ${transactionId}`,
          },
        ],
      };
    }

    case "disconnect_file_from_transaction": {
      const { fileId, transactionId } = disconnectFileSchema.parse(args);

      // Find the connection
      const connectionQuery = query(
        collection(ctx.db, FILE_CONNECTIONS_COLLECTION),
        where("fileId", "==", fileId),
        where("transactionId", "==", transactionId),
        where("userId", "==", ctx.userId)
      );
      const connectionSnapshot = await getDocs(connectionQuery);

      if (connectionSnapshot.empty) {
        return {
          content: [{ type: "text", text: `Connection not found` }],
        };
      }

      const now = Timestamp.now();
      const batch = writeBatch(ctx.db);

      // Delete connection document
      batch.delete(connectionSnapshot.docs[0].ref);

      // Update file's transactionIds
      const fileRef = doc(ctx.db, FILES_COLLECTION, fileId);
      batch.update(fileRef, {
        transactionIds: arrayRemove(transactionId),
        updatedAt: now,
      });

      // Update transaction's fileIds
      const txRef = doc(ctx.db, TRANSACTIONS_COLLECTION, transactionId);
      batch.update(txRef, {
        fileIds: arrayRemove(fileId),
        updatedAt: now,
      });

      await batch.commit();

      return {
        content: [
          {
            type: "text",
            text: `Disconnected file ${fileId} from transaction ${transactionId}`,
          },
        ],
      };
    }

    case "get_files_for_transaction": {
      const { transactionId } = getFilesForTransactionSchema.parse(args);

      // Verify transaction ownership
      const txRef = doc(ctx.db, TRANSACTIONS_COLLECTION, transactionId);
      const txSnapshot = await getDoc(txRef);

      if (!txSnapshot.exists() || txSnapshot.data().userId !== ctx.userId) {
        return {
          content: [{ type: "text", text: `Transaction ${transactionId} not found` }],
        };
      }

      const txData = txSnapshot.data();
      const fileIds = txData.fileIds || [];

      if (fileIds.length === 0) {
        return {
          content: [{ type: "text", text: "[]" }],
        };
      }

      // Fetch all files
      const files = [];
      for (const fid of fileIds) {
        const fileRef = doc(ctx.db, FILES_COLLECTION, fid);
        const fileSnapshot = await getDoc(fileRef);
        if (fileSnapshot.exists() && fileSnapshot.data().userId === ctx.userId) {
          files.push({ id: fileSnapshot.id, ...fileSnapshot.data() });
        }
      }

      return {
        content: [{ type: "text", text: JSON.stringify(files, null, 2) }],
      };
    }

    default:
      return null;
  }
}
