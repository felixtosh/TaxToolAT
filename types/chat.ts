import { Timestamp } from "firebase/firestore";
import { AutoActionNotification } from "./notification";

export type ChatTab = "notifications" | "chat";

/**
 * A part of a message - either text or a tool call (in chronological order)
 */
export type MessagePart =
  | { type: "text"; text: string }
  | { type: "tool"; toolCall: ToolCall };

/**
 * A single message in a chat conversation
 */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: Date | Timestamp;

  /** Ordered parts for rendering (text and tool calls in chronological order) */
  parts?: MessagePart[];

  /** Tool calls made by the assistant (legacy, for backwards compat) */
  toolCalls?: ToolCall[];

  /** Results of tool executions */
  toolResults?: ToolResult[];
}

/**
 * A tool call made by the AI assistant
 */
export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: "pending" | "approved" | "rejected" | "executed";
  requiresConfirmation: boolean;
}

/**
 * Result of a tool execution
 */
export interface ToolResult {
  toolCallId: string;
  result: unknown;
  error?: string;
}

/**
 * A chat session containing multiple messages
 */
export interface ChatSession {
  id: string;
  userId: string;
  title: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  messageCount: number;
  lastMessagePreview?: string;
}

/**
 * UI action that the chat can trigger
 */
export interface UIAction {
  type: "navigate" | "openSheet" | "closeSheet" | "scrollTo" | "highlight" | "notification";
  payload: Record<string, unknown>;
}

/**
 * Actions available for UI control from chat
 */
export interface UIControlActions {
  navigateTo: (path: string) => void;
  openTransactionSheet: (transactionId: string) => void;
  closeTransactionSheet: () => void;
  scrollToTransaction: (transactionId: string) => void;
  highlightTransaction: (transactionId: string) => void;
  showNotification: (message: string, type: "success" | "error" | "info") => void;
}

/**
 * Chat context value provided by ChatProvider
 */
export interface ChatContextValue {
  // State
  messages: ChatMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  currentSession: ChatSession | null;
  sessions: ChatSession[];
  pendingConfirmations: ToolCall[];

  // Actions
  sendMessage: (content: string) => Promise<void>;
  approveToolCall: (toolCallId: string) => Promise<void>;
  rejectToolCall: (toolCallId: string) => void;
  startNewSession: () => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;

  // UI Control
  uiActions: UIControlActions;

  // Sidebar state
  isSidebarOpen: boolean;
  toggleSidebar: () => void;

  // Tabs & Notifications
  activeTab: ChatTab;
  setActiveTab: (tab: ChatTab) => void;
  notifications: AutoActionNotification[];
  unreadNotificationCount: number;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  startConversationFromNotification: (notification: AutoActionNotification) => void;
}
