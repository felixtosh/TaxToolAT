import {
  collection,
  query,
  orderBy,
  where,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  addDoc,
  deleteDoc,
  Timestamp,
  limit,
} from "firebase/firestore";
import { ChatSession, ChatMessage, ToolCall, ToolResult } from "@/types/chat";
import { OperationsContext } from "./types";

const CHAT_SESSIONS_COLLECTION = "chatSessions";

function getMessagesCollection(userId: string, sessionId: string) {
  return `users/${userId}/chatSessions/${sessionId}/messages`;
}

/**
 * List all chat sessions for the current user
 */
export async function listChatSessions(
  ctx: OperationsContext,
  options: { limit?: number } = {}
): Promise<ChatSession[]> {
  const q = query(
    collection(ctx.db, `users/${ctx.userId}/chatSessions`),
    orderBy("updatedAt", "desc"),
    ...(options.limit ? [limit(options.limit)] : [])
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as ChatSession[];
}

/**
 * Get a single chat session by ID
 */
export async function getChatSession(
  ctx: OperationsContext,
  sessionId: string
): Promise<ChatSession | null> {
  const docRef = doc(ctx.db, `users/${ctx.userId}/chatSessions`, sessionId);
  const snapshot = await getDoc(docRef);

  if (!snapshot.exists()) {
    return null;
  }

  return { id: snapshot.id, ...snapshot.data() } as ChatSession;
}

/**
 * Create a new chat session
 */
export async function createChatSession(
  ctx: OperationsContext,
  title?: string
): Promise<string> {
  const now = Timestamp.now();
  const newSession = {
    userId: ctx.userId,
    title: title || "New Chat",
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
  };

  const docRef = await addDoc(
    collection(ctx.db, `users/${ctx.userId}/chatSessions`),
    newSession
  );
  return docRef.id;
}

/**
 * Update a chat session
 */
export async function updateChatSession(
  ctx: OperationsContext,
  sessionId: string,
  data: Partial<Pick<ChatSession, "title" | "lastMessagePreview">>
): Promise<void> {
  const docRef = doc(ctx.db, `users/${ctx.userId}/chatSessions`, sessionId);
  await updateDoc(docRef, {
    ...data,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Delete a chat session and all its messages
 */
export async function deleteChatSession(
  ctx: OperationsContext,
  sessionId: string
): Promise<void> {
  // First delete all messages in the session
  const messagesPath = getMessagesCollection(ctx.userId, sessionId);
  const messagesQuery = query(collection(ctx.db, messagesPath));
  const messagesSnapshot = await getDocs(messagesQuery);

  // Delete messages in parallel
  await Promise.all(
    messagesSnapshot.docs.map((doc) => deleteDoc(doc.ref))
  );

  // Then delete the session itself
  const sessionRef = doc(ctx.db, `users/${ctx.userId}/chatSessions`, sessionId);
  await deleteDoc(sessionRef);
}

/**
 * Get messages for a chat session
 */
export async function getChatMessages(
  ctx: OperationsContext,
  sessionId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<ChatMessage[]> {
  const messagesPath = getMessagesCollection(ctx.userId, sessionId);
  const q = query(
    collection(ctx.db, messagesPath),
    orderBy("createdAt", "asc"),
    ...(options.limit ? [limit(options.limit)] : [])
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as ChatMessage[];
}

/**
 * Add a message to a chat session
 */
export async function addChatMessage(
  ctx: OperationsContext,
  sessionId: string,
  message: Omit<ChatMessage, "id" | "createdAt">
): Promise<string> {
  const messagesPath = getMessagesCollection(ctx.userId, sessionId);
  const now = Timestamp.now();

  const newMessage = {
    ...message,
    createdAt: now,
  };

  const docRef = await addDoc(collection(ctx.db, messagesPath), newMessage);

  // Update session with message count and preview
  const sessionRef = doc(ctx.db, `users/${ctx.userId}/chatSessions`, sessionId);
  const sessionSnap = await getDoc(sessionRef);

  if (sessionSnap.exists()) {
    const sessionData = sessionSnap.data();
    const newCount = (sessionData.messageCount || 0) + 1;

    // Generate title from first user message if this is the first message
    const updates: Record<string, unknown> = {
      messageCount: newCount,
      updatedAt: now,
    };

    if (message.content) {
      updates.lastMessagePreview = message.content.slice(0, 100);

      // Auto-generate title from first user message
      if (newCount === 1 && message.role === "user") {
        updates.title = message.content.slice(0, 50) + (message.content.length > 50 ? "..." : "");
      }
    }

    await updateDoc(sessionRef, updates);
  }

  return docRef.id;
}

/**
 * Update a message (e.g., to add tool results)
 */
export async function updateChatMessage(
  ctx: OperationsContext,
  sessionId: string,
  messageId: string,
  data: Partial<Pick<ChatMessage, "toolCalls" | "toolResults">>
): Promise<void> {
  const messagesPath = getMessagesCollection(ctx.userId, sessionId);
  const docRef = doc(ctx.db, messagesPath, messageId);
  await updateDoc(docRef, data);
}

/**
 * Helper to serialize messages for the AI SDK format
 */
export function serializeMessagesForSDK(
  messages: ChatMessage[]
): Array<{
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt?: Date;
}> {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: m.createdAt?.toDate(),
  }));
}

/**
 * Helper to parse SDK messages to our format
 */
export function parseMessagesFromSDK(
  messages: Array<{
    id: string;
    role: string;
    content: string;
    toolInvocations?: Array<{
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
      state: string;
      result?: unknown;
    }>;
  }>
): Array<Omit<ChatMessage, "id" | "createdAt">> {
  return messages.map((m) => ({
    role: m.role as "user" | "assistant" | "system",
    content: m.content,
    toolCalls: m.toolInvocations?.map((ti) => ({
      id: ti.toolCallId,
      name: ti.toolName,
      args: ti.args,
      status: ti.state === "result" ? "executed" : "pending",
      requiresConfirmation: false,
    })) as ToolCall[] | undefined,
    toolResults: m.toolInvocations
      ?.filter((ti) => ti.state === "result")
      .map((ti) => ({
        toolCallId: ti.toolCallId,
        result: ti.result,
      })) as ToolResult[] | undefined,
  }));
}
