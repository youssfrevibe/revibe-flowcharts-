#!/usr/bin/env node
/**
 * Revibe Diagrams — MCP over stdio, for a local checkout.
 *
 * Most people should use the hosted server at `/api/mcp` instead: it needs no clone and
 * cannot be running a stale copy of the card standards. This exists for working on the
 * tools themselves, and for pointing at a dev server that is not deployed.
 *
 * The tools are defined once in `src/lib/mcp-tools.ts` and compiled here by
 * `npm run mcp:build`, so the two surfaces cannot drift apart.
 *
 *   REVIBE_BASE_URL   where the app is, default http://localhost:3000
 *   REVIBE_API_KEY    sent as x-revibe-key on writes; must match the app's
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { makeTools } from "./mcp-tools.js";

const tools = makeTools(
  process.env.REVIBE_BASE_URL || "http://localhost:3000",
  process.env.REVIBE_API_KEY || ""
);

const server = new Server(
  { name: "revibe-diagrams", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = tools.find((t) => t.name === req.params.name);
  if (!tool) throw new Error(`No such tool: ${req.params.name}`);
  try {
    return await tool.handler(req.params.arguments || {});
  } catch (e) {
    return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
