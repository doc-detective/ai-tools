#!/usr/bin/env node
/**
 * doc-detective-mcp - MCP server for Doc Detective
 * 
 * This server exposes Doc Detective functionality through the Model Context Protocol,
 * enabling AI assistants to generate, validate, execute, inject, and analyze
 * documentation tests.
 */

import { startServer } from './server.js';

// Start the server
startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
