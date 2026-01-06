import { Timestamp } from "firebase/firestore";

/**
 * Types of auto-action notifications
 */
export type NotificationType =
  | "import_complete"
  | "partner_matching"
  | "pattern_learned"
  | "patterns_cleared";

/**
 * Context data for notifications (varies by type)
 */
export interface NotificationContext {
  // For import_complete
  sourceId?: string;
  sourceName?: string;
  transactionCount?: number;

  // For partner_matching
  transactionIds?: string[];
  autoMatchedCount?: number;
  suggestionsCount?: number;

  // For pattern_learned
  partnerId?: string;
  partnerName?: string;
  patternsLearned?: number;
  transactionsMatched?: number;

  // For patterns_cleared
  unassignedCount?: number;
}

/**
 * Preview data shown in notification UI
 */
export interface NotificationPreview {
  transactions?: Array<{
    id: string;
    name: string;
    amount: number;
    partner?: string;
  }>;
}

/**
 * An auto-action notification from system events
 */
export interface AutoActionNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: Timestamp;
  readAt?: Timestamp | null;
  context: NotificationContext;
  preview?: NotificationPreview;
}

/**
 * Data for creating a new notification (without id and createdAt)
 */
export type CreateNotificationData = Omit<
  AutoActionNotification,
  "id" | "createdAt"
>;
