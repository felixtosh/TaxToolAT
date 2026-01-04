#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createContext } from "./context.js";
import { registerSourceTools, sourceToolDefinitions } from "./tools/sources.js";
import { registerTransactionTools, transactionToolDefinitions } from "./tools/transactions.js";
import { registerTestDataTools, testDataToolDefinitions } from "./tools/test-data.js";

async function main() {
  const server = new Server(
    {
      name: "taxstudio-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Create operations context
  const ctx = createContext();

  // Combine all tool definitions
  const allTools = [
    ...sourceToolDefinitions,
    ...transactionToolDefinitions,
    ...testDataToolDefinitions,
  ];

  // Register tool listing handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: allTools };
  });

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      // Try source tools
      const sourceResult = await registerSourceTools(ctx, name, args);
      if (sourceResult !== null) return sourceResult;

      // Try transaction tools
      const transactionResult = await registerTransactionTools(ctx, name, args);
      if (transactionResult !== null) return transactionResult;

      // Try test data tools
      const testDataResult = await registerTestDataTools(ctx, name, args);
      if (testDataResult !== null) return testDataResult;

      throw new Error(`Unknown tool: ${name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  // Start server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("TaxStudio MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
