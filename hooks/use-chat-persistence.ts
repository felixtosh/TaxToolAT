"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { db } from "@/lib/firebase/config";
import { ChatSession, ChatMessage } from "@/types/chat";
import {
  OperationsContext,
  getOrCreateActiveSession,
  getChatMessages,
  createChatSession,
  addChatMessage,
  listChatSessions,
  serializeMessagesForSDK,
} from "@/lib/operations";
import { useAuth } from "@/components/auth";

export interface ChatPersistenceState {
  currentSessionId: string | null;
  isLoading: boolean;
  sessions: ChatSession[];
}

export function useChatPersistence() {
  const { userId } = useAuth();
  const [state, setState] = useState<ChatPersistenceState>({
    currentSessionId: null,
    isLoading: true,
    sessions: [],
  });

  // Operations context
  const ctx: OperationsContext = useMemo(
    () => ({
      db,
      userId: userId ?? "",
    }),
    [userId]
  );

  // Load initial session on mount
  useEffect(() => {
    if (!userId) {
      setState({ currentSessionId: null, isLoading: false, sessions: [] });
      return;
    }

    const loadInitialSession = async () => {
      try {
        const sessionId = await getOrCreateActiveSession(ctx);
        const sessions = await listChatSessions(ctx, { limit: 10 });
        setState({
          currentSessionId: sessionId,
          isLoading: false,
          sessions,
        });
      } catch (error) {
        console.error("Failed to load initial session:", error);
        setState((s) => ({ ...s, isLoading: false }));
      }
    };

    loadInitialSession();
  }, [ctx, userId]);

  // Load messages for a session
  const loadSessionMessages = useCallback(
    async (sessionId: string): Promise<ChatMessage[]> => {
      try {
        const messages = await getChatMessages(ctx, sessionId);
        return messages;
      } catch (error) {
        console.error("Failed to load messages:", error);
        return [];
      }
    },
    [ctx]
  );

  // Get messages in SDK format for initializing useChat
  const getInitialMessages = useCallback(
    async (sessionId: string) => {
      const messages = await loadSessionMessages(sessionId);
      return serializeMessagesForSDK(messages);
    },
    [loadSessionMessages]
  );

  // Create a new session
  const createNewSession = useCallback(
    async (title?: string): Promise<string> => {
      try {
        const sessionId = await createChatSession(ctx, title);
        const sessions = await listChatSessions(ctx, { limit: 10 });
        setState({
          currentSessionId: sessionId,
          isLoading: false,
          sessions,
        });
        return sessionId;
      } catch (error) {
        console.error("Failed to create session:", error);
        throw error;
      }
    },
    [ctx]
  );

  // Switch to a different session
  const switchSession = useCallback(
    async (sessionId: string) => {
      setState((s) => ({
        ...s,
        currentSessionId: sessionId,
        isLoading: true,
      }));

      // Messages will be loaded by the provider
      setState((s) => ({
        ...s,
        isLoading: false,
      }));
    },
    []
  );

  // Save a message to the current session
  const saveMessage = useCallback(
    async (message: Omit<ChatMessage, "id" | "createdAt">) => {
      if (!state.currentSessionId) {
        console.warn("No active session to save message to");
        return;
      }

      try {
        await addChatMessage(ctx, state.currentSessionId, message);
      } catch (error) {
        console.error("Failed to save message:", error);
      }
    },
    [ctx, state.currentSessionId]
  );

  return {
    currentSessionId: state.currentSessionId,
    isLoading: state.isLoading,
    sessions: state.sessions,
    loadSessionMessages,
    getInitialMessages,
    createNewSession,
    switchSession,
    saveMessage,
  };
}
