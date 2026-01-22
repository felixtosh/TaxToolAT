/**
 * Chat Test Runner with LangFuse Integration
 *
 * Runs functional tests against the chat API and logs results to LangFuse.
 * Tests verify:
 * - Correct tool calling for different intents
 * - Response content quality
 * - Error handling
 */

import { Langfuse } from "langfuse";

// ============================================================================
// Types
// ============================================================================

export interface ChatTestCase {
  /** Unique test case ID */
  id: string;
  /** Human-readable test name */
  name: string;
  /** Test category for grouping */
  category: "tool-calling" | "response-quality" | "error-handling" | "conversation";
  /** User message to send */
  input: string;
  /** Previous messages for multi-turn tests */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  /** Tools that MUST be called */
  expectedToolCalls?: string[];
  /** Tools that should NOT be called */
  unexpectedToolCalls?: string[];
  /** Strings that MUST appear in the response */
  expectedContains?: string[];
  /** Strings that should NOT appear in the response */
  unexpectedContains?: string[];
  /** Regex patterns the response should match */
  expectedPatterns?: string[];
  /** Whether the response should be in German */
  expectGerman?: boolean;
  /** Tags for filtering */
  tags?: string[];
  /** Test timeout in ms */
  timeout?: number;
}

export interface TestCaseResult {
  testCase: ChatTestCase;
  passed: boolean;
  duration: number;
  response?: string;
  toolsCalled?: string[];
  evaluation: {
    toolCallsCorrect: boolean;
    containsExpected: boolean;
    noUnexpectedContent: boolean;
    details: string[];
  };
  error?: string;
  langfuseTraceId?: string;
}

export interface TestRunResult {
  runId: string;
  startedAt: Date;
  completedAt: Date;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  passRate: number;
  results: TestCaseResult[];
  langfuseUrl?: string;
}

// ============================================================================
// LangFuse Client
// ============================================================================

let langfuseClient: Langfuse | null = null;

function getLangfuse(): Langfuse | null {
  if (langfuseClient) return langfuseClient;

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com";

  if (!publicKey || !secretKey) {
    console.warn("[ChatTestRunner] LangFuse credentials not configured");
    return null;
  }

  langfuseClient = new Langfuse({ publicKey, secretKey, baseUrl });
  return langfuseClient;
}

// ============================================================================
// Response Evaluation
// ============================================================================

interface ChatResponse {
  content: string;
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
}

function evaluateResponse(
  testCase: ChatTestCase,
  response: ChatResponse
): TestCaseResult["evaluation"] {
  const details: string[] = [];
  let toolCallsCorrect = true;
  let containsExpected = true;
  let noUnexpectedContent = true;

  // Check expected tool calls
  if (testCase.expectedToolCalls) {
    for (const expectedTool of testCase.expectedToolCalls) {
      const called = response.toolCalls.some((tc) => tc.name === expectedTool);
      if (!called) {
        toolCallsCorrect = false;
        details.push(`❌ Expected tool not called: ${expectedTool}`);
      } else {
        details.push(`✓ Tool called: ${expectedTool}`);
      }
    }
  }

  // Check unexpected tool calls
  if (testCase.unexpectedToolCalls) {
    for (const unexpectedTool of testCase.unexpectedToolCalls) {
      const called = response.toolCalls.some((tc) => tc.name === unexpectedTool);
      if (called) {
        toolCallsCorrect = false;
        details.push(`❌ Unexpected tool called: ${unexpectedTool}`);
      }
    }
  }

  // Check expected content
  if (testCase.expectedContains) {
    for (const expected of testCase.expectedContains) {
      const found = response.content.toLowerCase().includes(expected.toLowerCase());
      if (!found) {
        containsExpected = false;
        details.push(`❌ Expected content not found: "${expected}"`);
      } else {
        details.push(`✓ Found expected content: "${expected}"`);
      }
    }
  }

  // Check unexpected content
  if (testCase.unexpectedContains) {
    for (const unexpected of testCase.unexpectedContains) {
      const found = response.content.toLowerCase().includes(unexpected.toLowerCase());
      if (found) {
        noUnexpectedContent = false;
        details.push(`❌ Unexpected content found: "${unexpected}"`);
      }
    }
  }

  // Check regex patterns
  if (testCase.expectedPatterns) {
    for (const pattern of testCase.expectedPatterns) {
      const regex = new RegExp(pattern, "i");
      if (!regex.test(response.content)) {
        containsExpected = false;
        details.push(`❌ Pattern not matched: ${pattern}`);
      } else {
        details.push(`✓ Pattern matched: ${pattern}`);
      }
    }
  }

  // Check German language (basic check)
  if (testCase.expectGerman) {
    const germanIndicators = ["ich", "sie", "der", "die", "das", "und", "oder", "ist", "sind", "haben"];
    const hasGerman = germanIndicators.some((word) =>
      response.content.toLowerCase().includes(` ${word} `) ||
      response.content.toLowerCase().startsWith(`${word} `)
    );
    if (!hasGerman && response.content.length > 50) {
      details.push(`⚠️ Response may not be in German`);
    }
  }

  return {
    toolCallsCorrect,
    containsExpected,
    noUnexpectedContent,
    details,
  };
}

// ============================================================================
// Chat API Caller
// ============================================================================

interface CallChatOptions {
  baseUrl: string;
  authToken: string;
  userId: string;
  timeout?: number;
}

async function callChatAPI(
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
  options: CallChatOptions
): Promise<ChatResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || 30000);

  try {
    const response = await fetch(`${options.baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.authToken}`,
      },
      body: JSON.stringify({
        messages: messages.map((m, i) => ({
          id: `msg-${i}`,
          role: m.role,
          content: m.content,
        })),
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Chat API error: ${response.status} ${response.statusText}`);
    }

    // Parse streaming response
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }

    let fullContent = "";
    const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (!line.trim()) continue;

        // AI SDK stream format: prefix:data
        const colonIndex = line.indexOf(":");
        if (colonIndex === -1) continue;

        const prefix = line.slice(0, colonIndex);
        const jsonStr = line.slice(colonIndex + 1);

        try {
          const data = JSON.parse(jsonStr);

          // 0: text delta
          if (prefix === "0" && typeof data === "string") {
            fullContent += data;
          }

          // Tool chunks come with various prefixes, check for tool-input-start type
          // Format: {"type":"tool-input-start","toolCallId":"...","toolName":"listTransactions",...}
          if (data?.type === "tool-input-start" && data.toolName) {
            if (!toolCalls.some(tc => tc.name === data.toolName)) {
              toolCalls.push({ name: data.toolName, args: {} });
            }
          }

          // Also check for 9: prefix format (older AI SDK)
          if (prefix === "9" && data.toolName) {
            if (!toolCalls.some(tc => tc.name === data.toolName)) {
              toolCalls.push({ name: data.toolName, args: data.args || {} });
            }
          }

          // b: tool call streaming (partial) - older format
          if (prefix === "b" && data.toolName) {
            if (!toolCalls.some(tc => tc.name === data.toolName)) {
              toolCalls.push({ name: data.toolName, args: {} });
            }
          }
        } catch {
          // Skip non-JSON lines
        }
      }
    }

    return { content: fullContent, toolCalls };
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// ============================================================================
// Test Runner
// ============================================================================

export interface RunTestsOptions {
  /** Base URL for the chat API */
  baseUrl: string;
  /** Auth token for API calls */
  authToken: string;
  /** User ID for tracing */
  userId: string;
  /** Test cases to run (defaults to all) */
  testCases?: ChatTestCase[];
  /** Filter by tags */
  tags?: string[];
  /** Filter by category */
  category?: ChatTestCase["category"];
  /** Whether to log to LangFuse */
  logToLangfuse?: boolean;
  /** Callback for progress updates */
  onProgress?: (completed: number, total: number, current: TestCaseResult) => void;
}

export async function runChatTests(options: RunTestsOptions): Promise<TestRunResult> {
  const runId = `test-run-${Date.now()}`;
  const startedAt = new Date();
  const langfuse = options.logToLangfuse !== false ? getLangfuse() : null;

  // Filter test cases
  let testCases = options.testCases || getDefaultTestCases();

  if (options.tags?.length) {
    testCases = testCases.filter((tc) =>
      tc.tags?.some((tag) => options.tags!.includes(tag))
    );
  }

  if (options.category) {
    testCases = testCases.filter((tc) => tc.category === options.category);
  }

  const results: TestCaseResult[] = [];

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const testStartTime = Date.now();

    // Create LangFuse trace
    const trace = langfuse?.trace({
      name: `chat-test:${testCase.id}`,
      userId: options.userId,
      sessionId: runId,
      metadata: {
        testName: testCase.name,
        category: testCase.category,
        tags: testCase.tags,
      },
    });

    try {
      // Build messages
      const messages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [];

      if (testCase.history) {
        messages.push(...testCase.history);
      }

      messages.push({ role: "user", content: testCase.input });

      // Call chat API
      const response = await callChatAPI(messages, {
        baseUrl: options.baseUrl,
        authToken: options.authToken,
        userId: options.userId,
        timeout: testCase.timeout || 30000,
      });

      // Evaluate response
      const evaluation = evaluateResponse(testCase, response);
      const passed =
        evaluation.toolCallsCorrect &&
        evaluation.containsExpected &&
        evaluation.noUnexpectedContent;

      // Log to LangFuse
      if (trace) {
        trace.score({ name: "passed", value: passed ? 1 : 0 });
        trace.score({ name: "tool_calls_correct", value: evaluation.toolCallsCorrect ? 1 : 0 });
        trace.score({ name: "contains_expected", value: evaluation.containsExpected ? 1 : 0 });

        trace.event({
          name: "evaluation",
          metadata: {
            evaluation,
            response: response.content.slice(0, 500),
            toolsCalled: response.toolCalls.map((tc) => tc.name),
          },
        });
      }

      const result: TestCaseResult = {
        testCase,
        passed,
        duration: Date.now() - testStartTime,
        response: response.content,
        toolsCalled: response.toolCalls.map((tc) => tc.name),
        evaluation,
        langfuseTraceId: trace?.id,
      };

      results.push(result);
      options.onProgress?.(i + 1, testCases.length, result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (trace) {
        trace.score({ name: "passed", value: 0 });
        trace.event({ name: "error", metadata: { error: errorMessage } });
      }

      const result: TestCaseResult = {
        testCase,
        passed: false,
        duration: Date.now() - testStartTime,
        evaluation: {
          toolCallsCorrect: false,
          containsExpected: false,
          noUnexpectedContent: true,
          details: [`❌ Error: ${errorMessage}`],
        },
        error: errorMessage,
        langfuseTraceId: trace?.id,
      };

      results.push(result);
      options.onProgress?.(i + 1, testCases.length, result);
    }
  }

  // Flush LangFuse
  if (langfuse) {
    await langfuse.flushAsync();
  }

  const completedAt = new Date();
  const passedTests = results.filter((r) => r.passed).length;

  return {
    runId,
    startedAt,
    completedAt,
    totalTests: results.length,
    passedTests,
    failedTests: results.length - passedTests,
    passRate: results.length > 0 ? passedTests / results.length : 0,
    results,
    langfuseUrl: langfuse
      ? `${process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com"}/sessions/${runId}`
      : undefined,
  };
}

// ============================================================================
// Default Test Cases
// ============================================================================

export function getDefaultTestCases(): ChatTestCase[] {
  return [
    // Tool Calling Tests
    {
      id: "partner-search",
      name: "Partner search triggers listPartners tool",
      category: "tool-calling",
      input: "Suche nach dem Partner Telekom",
      expectedToolCalls: ["listPartners"],
      expectGerman: true,
      tags: ["partner", "search"],
    },
    {
      id: "transaction-filter-amount",
      name: "Filter transactions by amount",
      category: "tool-calling",
      input: "Zeige mir alle Transaktionen über 500 Euro",
      expectedToolCalls: ["listTransactions"],
      expectGerman: true,
      tags: ["transaction", "filter"],
    },
    {
      id: "file-search",
      name: "Search for files/invoices",
      category: "tool-calling",
      input: "Finde die Rechnung von Amazon",
      expectedToolCalls: ["searchLocalFiles"],
      expectGerman: true,
      tags: ["file", "search"],
    },
    {
      id: "list-transactions",
      name: "List recent transactions",
      category: "tool-calling",
      input: "Zeige mir meine letzten Transaktionen",
      expectedToolCalls: ["listTransactions"],
      expectGerman: true,
      tags: ["transaction", "list"],
    },

    // Response Quality Tests
    {
      id: "greeting-response",
      name: "Responds appropriately to greeting",
      category: "response-quality",
      input: "Hallo!",
      unexpectedToolCalls: ["listPartners", "listTransactions", "searchLocalFiles"],
      expectGerman: true,
      tags: ["greeting"],
    },
    {
      id: "help-request",
      name: "Provides helpful guidance when asked for help",
      category: "response-quality",
      input: "Was kannst du alles für mich tun?",
      expectedContains: ["Transaktionen", "Rechnungen"],
      expectGerman: true,
      tags: ["help"],
    },
    {
      id: "ambiguous-request",
      name: "Asks for clarification on ambiguous requests",
      category: "response-quality",
      input: "Mach das mal",
      expectedPatterns: ["(was|welche|genauer|mehr)"],
      expectGerman: true,
      tags: ["clarification"],
    },

    // Error Handling Tests
    {
      id: "invalid-amount-format",
      name: "Handles invalid amount format gracefully",
      category: "error-handling",
      input: "Zeige Transaktionen über xyz Euro",
      unexpectedContains: ["error", "exception", "failed"],
      expectGerman: true,
      tags: ["error"],
    },

    // Conversation Tests
    {
      id: "follow-up-question",
      name: "Handles follow-up questions with context",
      category: "conversation",
      input: "Kannst du mir mehr Details zeigen?",
      history: [
        { role: "user", content: "Zeige mir die letzten 5 Transaktionen" },
        {
          role: "assistant",
          content: "Hier sind die letzten 5 Transaktionen: 1. Amazon -50€, 2. REWE -35€...",
        },
      ],
      expectGerman: true,
      tags: ["conversation", "context"],
    },
  ];
}

// ============================================================================
// Export for LangFuse Dataset Creation
// ============================================================================

/**
 * Get test cases in LangFuse dataset format
 */
export function getTestCasesForLangfuseDataset(): Array<{
  input: { messages: Array<{ role: string; content: string }> };
  expectedOutput?: { toolCalls?: string[]; containsText?: string[] };
  metadata: { testId: string; category: string; tags: string[] };
}> {
  return getDefaultTestCases().map((tc) => ({
    input: {
      messages: [
        ...(tc.history || []),
        { role: "user", content: tc.input },
      ],
    },
    expectedOutput: {
      toolCalls: tc.expectedToolCalls,
      containsText: tc.expectedContains,
    },
    metadata: {
      testId: tc.id,
      category: tc.category,
      tags: tc.tags || [],
    },
  }));
}
