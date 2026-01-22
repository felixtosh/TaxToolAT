"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { collection, query, orderBy, onSnapshot, limit } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { ChatSession } from "@/types/chat";
import { deleteChatSession, getChatMessages, serializeMessagesForSDK } from "@/lib/operations";
import { OperationsContext } from "@/lib/operations/types";
import { useAuth } from "@/components/auth";

interface UseChatSessionsReturn {
  sessions: ChatSession[];
  isLoading: boolean;
  deleteSession: (sessionId: string) => Promise<void>;
  getSessionMessages: (sessionId: string) => Promise<ReturnType<typeof serializeMessagesForSDK>>;
}

export function useChatSessions(): UseChatSessionsReturn {
  const { userId } = useAuth();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Operations context
  const ctx: OperationsContext = useMemo(
    () => ({
      db,
      userId: userId ?? "",
    }),
    [userId]
  );

  // Real-time listener for chat sessions
  useEffect(() => {
    if (!userId) {
      setSessions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const q = query(
      collection(db, `users/${userId}/chatSessions`),
      orderBy("updatedAt", "desc"),
      limit(50)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const sessionsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as ChatSession[];
        setSessions(sessionsData);
        setIsLoading(false);
      },
      (error) => {
        console.error("Error listening to chat sessions:", error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  // Delete a session
  const deleteSession = useCallback(
    async (sessionId: string) => {
      if (!userId) return;
      await deleteChatSession(ctx, sessionId);
    },
    [ctx, userId]
  );

  // Get messages for a session (for loading)
  const getSessionMessages = useCallback(
    async (sessionId: string) => {
      if (!userId) return [];
      const messages = await getChatMessages(ctx, sessionId);
      return serializeMessagesForSDK(messages);
    },
    [ctx, userId]
  );

  return {
    sessions,
    isLoading,
    deleteSession,
    getSessionMessages,
  };
}
