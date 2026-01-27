/**
 * MCP Server configuration and factory
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import {
  toolDefinitions,
  generateTool,
  validateTool,
  executeTool,
  injectTool,
  analyzeTool,
} from './tools/index.js';

const SERVER_NAME = 'doc-detective-mcp';
const SERVER_VERSION = '1.0.0';

/**
 * Create and configure the MCP server
 */
export function createServer() {
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tool list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: toolDefinitions,
    };
  });

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: unknown;

      switch (name) {
        case 'doc_detective_generate':
          result = await generateTool(args as any);
          break;
        case 'doc_detective_validate':
          result = await validateTool(args as any);
          break;
        case 'doc_detective_execute':
          result = await executeTool(args as any);
          break;
        case 'doc_detective_inject':
          result = await injectTool(args as any);
          break;
        case 'doc_detective_analyze':
          result = await analyzeTool(args as any);
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: false, error: message }),
          },
        ],
        isError: true,
      };
    }
  });

  return {
    server,
    tools: toolDefinitions,
  };
}

/**
 * Start the MCP server with stdio transport
 */
export async function startServer() {
  const { server } = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}
