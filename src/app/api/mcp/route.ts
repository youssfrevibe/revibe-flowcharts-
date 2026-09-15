import { NextResponse } from "next/server";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { makeTools } from "@/lib/mcp-tools";

/**
 * The MCP server, hosted.
 *
 * The point of this route is that a colleague adds one URL and is done — no clone, no
 * Node, no install, and no way to be running a stale copy of the card standards, because
 * the validator deploys with the app.
 *
 * Stateless: `sessionIdGenerator: undefined` means every request carries its own server
 * and transport. On Vercel each request may land on a different instance with no shared
 * memory, so a session held between requests would work locally and fail in production
 * exactly when a second person connected.
 */

export const runtime = "nodejs";
// The tools call back into this same deployment over HTTP, so the response cannot be
// prerendered or cached.
export const dynamic = "force-dynamic";

/**
 * Where the tools should send their own requests.
 *
 * Derived from the incoming request rather than configured, so a preview deployment talks
 * to itself instead of to production. `x-forwarded-proto` is what sits in front on Vercel.
 */
function selfUrl(req: Request): string {
  if (process.env.REVIBE_BASE_URL) return process.env.REVIBE_BASE_URL;
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host;
  return `${proto}://${host}`;
}

/**
 * Who may use the hosted server.
 *
 * `REVIBE_MCP_TOKEN` is checked against `Authorization: Bearer …` and against a `key`
 * query parameter, because a URL is the only thing some MCP clients let you paste. A token
 * in a URL is visible in logs and browser history — it is a shared team credential, not a
 * per-person identity, and rotating it is the whole revocation story.
 *
 * Unset, the endpoint is open to anyone who knows it. That is only sane while the write
 * key is also unset, so this refuses to serve an unauthenticated endpoint that can write.
 */
function authorize(req: Request): NextResponse | null {
  const expected = process.env.REVIBE_MCP_TOKEN;

  if (!expected) {
    if (process.env.REVIBE_API_KEY) {
      return NextResponse.json(
        {
          error:
            "REVIBE_MCP_TOKEN is not set, so this endpoint would be open while the write key " +
            "is configured — anyone with the URL could write through it. Set REVIBE_MCP_TOKEN.",
        },
        { status: 503 }
      );
    }
    return null;
  }

  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const fromQuery = new URL(req.url).searchParams.get("key");
  const given = bearer || fromQuery || "";

  if (given.length === expected.length && given === expected) return null;

  return NextResponse.json(
    { error: "Unauthorized. Append ?key=… to the URL or send an Authorization: Bearer header." },
    { status: 401 }
  );
}

function buildServer(req: Request): Server {
  const tools = makeTools(selfUrl(req), process.env.REVIBE_API_KEY || "");

  const server = new Server(
    { name: "revibe-diagrams", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (r) => {
    const tool = tools.find((t) => t.name === r.params.name);
    if (!tool) throw new Error(`No such tool: ${r.params.name}`);
    try {
      return await tool.handler(r.params.arguments || {});
    } catch (e) {
      // A refusal the caller can act on — the shrink guard, a missing key — reads far
      // better as tool content than as a protocol error.
      const why = e instanceof Error ? e.message : String(e);
      return { content: [{ type: "text", text: `Error: ${why}` }], isError: true };
    }
  });

  return server;
}

async function handle(req: Request): Promise<Response> {
  const denied = authorize(req);
  if (denied) return denied;

  const server = buildServer(req);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    // Clients that cannot hold an SSE stream open still get a plain JSON reply.
    enableJsonResponse: true,
  });

  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    // Nothing is shared between requests, so the pair is torn down with the response.
    await transport.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
