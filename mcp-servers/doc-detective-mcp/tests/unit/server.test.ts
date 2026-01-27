import { describe, test, expect, beforeAll } from '@jest/globals';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

// Import will fail until implementation exists - this is expected (RED phase)
let createServer: () => { server: Server; tools: any[] };

describe('MCP Server Framework', () => {
  beforeAll(async () => {
    try {
      const module = await import('../../src/server.js');
      createServer = module.createServer;
    } catch (e) {
      // Expected to fail in RED phase
    }
  });

  test('createServer function exists and returns server instance', () => {
    expect(createServer).toBeDefined();
    const { server } = createServer();
    expect(server).toBeDefined();
  });

  test('server has correct name', () => {
    const { server } = createServer();
    // Verify server name matches expected value
    expect(server).toBeDefined();
    // Access serverInfo to verify name (internal property access)
    expect((server as any)._serverInfo?.name).toBe('doc-detective-mcp');
  });

  test('registers exactly 5 tools', () => {
    const { tools } = createServer();
    expect(tools).toHaveLength(5);
  });

  test('tool definitions have required fields', () => {
    const { tools } = createServer();
    const expectedTools = [
      'doc_detective_generate',
      'doc_detective_validate',
      'doc_detective_execute',
      'doc_detective_inject',
      'doc_detective_analyze',
    ];
    
    tools.forEach((tool: any) => {
      expect(tool.name).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(tool.inputSchema).toBeDefined();
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(typeof tool.inputSchema).toBe('object');
    });

    const toolNames = tools.map((t: any) => t.name);
    expectedTools.forEach(name => {
      expect(toolNames).toContain(name);
    });
  });

  test('each tool has valid JSON schema for inputSchema', () => {
    const { tools } = createServer();
    tools.forEach((tool: any) => {
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toBeDefined();
    });
  });
});
