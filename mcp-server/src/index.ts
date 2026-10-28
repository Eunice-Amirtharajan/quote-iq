#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.ts';
import { QuoteIqClient } from './quoteiq-client.ts';
import { registerTools } from './tools.ts';

// stdout carries the MCP protocol, so anything for humans goes to stderr
try {
  const config = loadConfig(process.env);
  const server = new McpServer({ name: 'quoteiq', version: '0.1.0' });
  registerTools(server, new QuoteIqClient(config));
  await server.connect(new StdioServerTransport());
  console.error(`QuoteIQ MCP server running (API: ${config.QUOTEIQ_API_URL})`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
