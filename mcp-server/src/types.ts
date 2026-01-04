import { Firestore } from "firebase/firestore";

/**
 * Context passed to all operations.
 * Duplicated here to avoid complex path resolution in MCP server.
 */
export interface OperationsContext {
  db: Firestore;
  userId: string;
}

/**
 * Result of a bulk operation
 */
export interface BulkOperationResult {
  success: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}
