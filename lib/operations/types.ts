import { Firestore } from "firebase/firestore";

/**
 * Context passed to all operations.
 * Contains the database instance and authenticated user ID.
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
