#!/usr/bin/env node
/**
 * Revibe Diagrams — MCP server.
 *
 * A thin wrapper over the app's own REST API. It holds no database credentials and has no
 * schema knowledge of its own: every tool is a fetch to a route the browser already calls,
 * so there is exactly one implementation of what a write means and one place where the
 * guards live.
 *
 * Environment:
 *   REVIBE_BASE_URL   where the app is, e.g. http://localhost:3000
 *   REVIBE_API_KEY    sent as x-revibe-key on writes; must match the server's
 *
 * The validator is imported from the app's own `flow-standards`, compiled to JS at build
 * time, so the MCP cannot drift from what the editor considers correct.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { checkStandards, longBackwardPathways, components } from "./flow-standards.js";

const BASE = (process.env.REVIBE_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const KEY = process.env.REVIBE_API_KEY || "";

/* ------------------------------------------------------------------- helpers */

async function api(path, { method = "GET", body } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  // Only writes need the key, but sending it on reads costs nothing and keeps the call
  // sites uniform.
  if (KEY) headers["x-revibe-key"] = KEY;

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(
      `Cannot reach ${BASE} — is the app running, and is REVIBE_BASE_URL right? (${e.message})`
    );
  }

  const raw = await res.text();
  let json;
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`${method} ${path} returned ${res.status} and not JSON: ${raw.slice(0, 200)}`);
  }

  if (!res.ok) {
    // The two the caller can act on get a plainer message than the raw body.
    if (res.status === 401) {
      throw new Error(
        "Refused: the server wants an x-revibe-key and did not get a matching one. " +
          "Set REVIBE_API_KEY for this MCP to the same value the app has."
      );
    }
    if (res.status === 409 && json.needsForce) {
      throw new Error(
        `${json.error} This is the shrink guard: the write would drop "${json.stored}" steps ` +
          `to ${json.incoming}. Re-send with force: true only if you mean it.`
      );
    }
    throw new Error(json.error || `${method} ${path} failed with ${res.status}`);
  }
  return json;
}

const ok = (value) => ({
  content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});

/* --------------------------------------------------------------------- tools */

const TOOLS = [
  {
    name: "list_flowcharts",
    description:
      "Every flowchart in the gallery: slug, title, description, step count and when it last changed. " +
      "Start here — a slug from this list is what every other tool takes.",
    inputSchema: {
      type: "object",
      properties: {
        archived: { type: "boolean", description: "List archived flowcharts instead of live ones." },
      },
    },
    handler: async ({ archived }) => {
      const json = await api(`/api/flowcharts${archived ? "?archived=1" : ""}`);
      return ok({ count: (json.flowcharts || []).length, flowcharts: json.flowcharts || [] });
    },
  },

  {
    name: "read_flowchart",
    description:
      "The whole document for one slug: nodes and connections. Large — 150+ nodes is normal — so " +
      "prefer describe_flowchart when you only need the shape.",
    inputSchema: {
      type: "object",
      properties: { slug: { type: "string" } },
      required: ["slug"],
    },
    handler: async ({ slug }) => {
      const json = await api(`/api/flowcharts/${encodeURIComponent(slug)}`);
      return ok(json.flowchart);
    },
  },

  {
    name: "describe_flowchart",
    description:
      "A compact summary of one flowchart: counts per level, the stage cards with their internal " +
      "and external stages and conditions, and the decisions with their branches. Use this to " +
      "understand a flow without pulling the whole document.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        level: { type: "number", description: "1 the shape, 2 branches, 3 every step. Default 3." },
      },
      required: ["slug"],
    },
    handler: async ({ slug, level = 3 }) => {
      const { flowchart } = await api(`/api/flowcharts/${encodeURIComponent(slug)}`);
      const doc = { nodes: flowchart.nodes || [], connections: flowchart.connections || [] };
      const cards = doc.nodes.filter((n) => (n.level ?? 3) === level);
      const byId = new Map(doc.nodes.map((n) => [n.id, n]));
      const cond = (n) => (n.conditions || []).map((c) => `${c.field} ${c.op ?? "="} ${c.value}`);

      return ok({
        title: flowchart.title,
        levels: { 1: doc.nodes.filter((n) => n.level === 1).length,
                  2: doc.nodes.filter((n) => n.level === 2).length,
                  3: doc.nodes.filter((n) => (n.level ?? 3) === 3).length },
        connections: doc.connections.length,
        pieces: components(doc, level),
        stages: cards
          .filter((n) => n.internalStage)
          .map((n) => ({ card: n.label, internal: n.internalStage, external: n.externalStage, conditions: cond(n) })),
        decisions: cards
          .filter((n) => n.type === "decision")
          .map((n) => ({
            card: n.label,
            owner: n.actor,
            branches: doc.connections
              .filter((c) => c.from === n.id)
              .map((c) => `${c.label || "(unlabelled)"} -> ${byId.get(c.to)?.label ?? "?"}`),
          })),
      });
    },
  },

  {
    name: "validate_flowchart",
    description:
      "Runs the card standards over a flowchart and reports every breach, card by card: titles, " +
      "stage pairs, shipment-status fields, owners, and consistency between cards that say the " +
      "same thing. Also reports disconnected pieces and long backward pathways, which are " +
      "judgement calls rather than breaches.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        level: { type: "number", description: "Default 3." },
      },
      required: ["slug"],
    },
    handler: async ({ slug, level = 3 }) => {
      const { flowchart } = await api(`/api/flowcharts/${encodeURIComponent(slug)}`);
      const doc = { nodes: flowchart.nodes || [], connections: flowchart.connections || [] };
      const report = checkStandards(doc, level);
      const pieces = components(doc, level);
      return ok({
        slug,
        title: flowchart.title,
        verdict:
          report.failed === 0
            ? `all ${report.checks - report.notes} checks pass` +
              (report.notes ? ` · ${report.notes} notes to review` : "")
            : `${report.failed} breaches`,
        ...report,
        disconnectedPieces: pieces.length > 1 ? pieces : undefined,
        longBackwardPathways: longBackwardPathways(doc),
      });
    },
  },

  {
    name: "write_flowchart",
    description:
      "Replaces a flowchart's nodes and connections. The server refuses a write that drops the " +
      "document below 70% of its stored step count unless force is set — that guard exists " +
      "because a 115-step document was once replaced by a 24-step template in one write. " +
      "Metadata is untouched; use patch_flowchart to rename.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        nodes: { type: "array", items: { type: "object" } },
        connections: { type: "array", items: { type: "object" } },
        force: { type: "boolean", description: "Allow a write that shrinks the document sharply." },
      },
      required: ["slug", "nodes", "connections"],
    },
    handler: async ({ slug, nodes, connections, force }) => {
      await api("/api/flowcharts", {
        method: "POST",
        body: { slug, nodes, connections, force: force === true },
      });
      return ok({ slug, written: { nodes: nodes.length, connections: connections.length } });
    },
  },

  {
    name: "patch_flowchart",
    description:
      "Changes a flowchart's metadata only — title, description, colour, archived. Cannot touch " +
      "nodes, deliberately: renames used to go through the document write and could push a stale " +
      "local copy over the live diagram.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        color: { type: "string" },
        archived: { type: "boolean" },
      },
      required: ["slug"],
    },
    handler: async ({ slug, ...patch }) => {
      await api(`/api/flowcharts/${encodeURIComponent(slug)}`, { method: "PATCH", body: patch });
      return ok({ slug, patched: patch });
    },
  },

  {
    name: "list_versions",
    description: "The snapshots held for a flowchart, newest first, with their labels and step counts.",
    inputSchema: {
      type: "object",
      properties: { slug: { type: "string" } },
      required: ["slug"],
    },
    handler: async ({ slug }) => {
      const json = await api(`/api/flowcharts/${encodeURIComponent(slug)}/versions`);
      if (json.needsMigration) return ok("Version history is not set up on this database yet.");
      return ok(json.versions || []);
    },
  },

  {
    name: "read_version",
    description: "One snapshot in full, so a previous state can be compared or restored.",
    inputSchema: {
      type: "object",
      properties: { slug: { type: "string" }, id: { type: "string" } },
      required: ["slug", "id"],
    },
    handler: async ({ slug, id }) => {
      const json = await api(
        `/api/flowcharts/${encodeURIComponent(slug)}/versions?id=${encodeURIComponent(id)}`
      );
      return ok(json.version);
    },
  },

  {
    name: "snapshot_flowchart",
    description:
      "Saves the flowchart's current contents as a labelled snapshot. Worth doing before any " +
      "write that changes a lot of cards.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        label: { type: "string", description: "A short name, e.g. “before standards pass”." },
      },
      required: ["slug"],
    },
    handler: async ({ slug, label }) => {
      const { flowchart } = await api(`/api/flowcharts/${encodeURIComponent(slug)}`);
      const json = await api(`/api/flowcharts/${encodeURIComponent(slug)}/versions`, {
        method: "POST",
        body: {
          nodes: flowchart.nodes || [],
          connections: flowchart.connections || [],
          label: label || "snapshot via MCP",
          author: "MCP",
        },
      });
      return ok(json.version);
    },
  },
];

/* -------------------------------------------------------------------- wiring */

const server = new Server(
  { name: "revibe-diagrams", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = TOOLS.find((t) => t.name === req.params.name);
  if (!tool) throw new Error(`No such tool: ${req.params.name}`);
  try {
    return await tool.handler(req.params.arguments || {});
  } catch (e) {
    // Hand the message back as content rather than throwing: the caller can read and act
    // on "the shrink guard stopped this" far better than on a protocol error.
    return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
