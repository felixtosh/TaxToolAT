"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { collection, query, orderBy, onSnapshot, limit } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { AutoActionNotification } from "@/types/notification";
import {
  OperationsContext,
  markNotificationRead as markNotificationReadOp,
  markAllNotificationsRead as markAllNotificationsReadOp,
} from "@/lib/operations";

const MOCK_USER_ID = "dev-user-123"; // Mock user for development
const MAX_NOTIFICATIONS = 50;

export function useNotifications() {
  const [notifications, setNotifications] = useState<AutoActionNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Create operations context
  const ctx: OperationsContext = useMemo(
    () => ({
      db,
      userId: MOCK_USER_ID,
    }),
    []
  );

  // Calculate unread count
  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.readAt).length,
    [notifications]
  );

  // Real-time listener for notifications
  useEffect(() => {
    setLoading(true);

    const notificationsPath = `users/${MOCK_USER_ID}/notifications`;
    const q = query(
      collection(db, notificationsPath),
      orderBy("createdAt", "desc"),
      limit(MAX_NOTIFICATIONS)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as AutoActionNotification[];

        setNotifications(data);
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching notifications:", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Mark a single notification as read
  const markRead = useCallback(
    async (notificationId: string) => {
      await markNotificationReadOp(ctx, notificationId);
    },
    [ctx]
  );

  // Mark all notifications as read
  const markAllRead = useCallback(async () => {
    await markAllNotificationsReadOp(ctx);
  }, [ctx]);

  // Get notification by ID
  const getNotificationById = useCallback(
    (notificationId: string): AutoActionNotification | undefined => {
      return notifications.find((n) => n.id === notificationId);
    },
    [notifications]
  );

  return {
    notifications,
    unreadCount,
    loading,
    error,
    markRead,
    markAllRead,
    getNotificationById,
  };
}
