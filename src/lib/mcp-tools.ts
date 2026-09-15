/**
 * The MCP tool set, defined once.
 *
 * Two surfaces serve these: `mcp/index.mjs` over stdio for a local checkout, and
 * `/api/mcp` over HTTP for everyone else. Defining them here means a teammate on the
 * hosted server and a developer on stdio cannot be offered different tools, or the same
 * tool behaving differently.
 *
 * Every handler goes through the app own REST API rather than the database, so the write
 * guards live in one place and this file needs no credentials of its own. When the HTTP
 * surface runs inside the app that is a self-fetch; the extra hop is worth one
 * implementation of what a write means.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  handler: (args: any) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>;
}

// Extensionless, because the Next bundler resolves it that way. `npm run mcp:build` adds
// the ".js" to the compiled copy, which Node ESM needs and Next never sees.
import { checkStandards, longBackwardPathways, components } from "./flow-standards";

/** Builds the tool set against one deployment. */
export function makeTools(baseUrl: string, apiKey: string): McpTool[] {
  const BASE = (baseUrl || "http://localhost:3000").replace(/\/+$/, "");
  const KEY = apiKey || "";

  /* ------------------------------------------------------------------- helpers */

  async function api(path: string, { method = "GET", body }: { method?: string; body?: unknown } = {}): Promise<any> {
    const headers: Record<string, string> = {};
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
      const why = e instanceof Error ? e.message : String(e);
      throw new Error(
        `Cannot reach ${BASE} — is the app running, and is REVIBE_BASE_URL right? (${why})`
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

  const ok = (value: unknown) => ({
    content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
  });

  /* --------------------------------------------------------------------- tools */

  const TOOLS: McpTool[] = [
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
      handler: async ({ archived }: any) => {
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
      handler: async ({ slug }: any) => {
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
      handler: async ({ slug, level = 3 }: any) => {
        const { flowchart } = await api(`/api/flowcharts/${encodeURIComponent(slug)}`);
        const doc = { nodes: flowchart.nodes || [], connections: flowchart.connections || [] };
        const cards = doc.nodes.filter((n: any) => (n.level ?? 3) === level);
        const byId = new Map(doc.nodes.map((n: any) => [n.id, n]));
        const cond = (n: any) => (n.conditions || [])  .map((c: any) => `${c.field} ${c.op ?? "="} ${c.value}`);

        return ok({
          title: flowchart.title,
          levels: { 1: doc.nodes.filter((n: any) => n.level === 1).length,
                    2: doc.nodes.filter((n: any) => n.level === 2).length,
                    3: doc.nodes.filter((n: any) => (n.level ?? 3) === 3).length },
          connections: doc.connections.length,
          pieces: components(doc, level),
          stages: cards
            .filter((n: any) => n.internalStage)
            .map((n: any) => ({ card: n.label, internal: n.internalStage, external: n.externalStage, conditions: cond(n) })),
          decisions: cards
            .filter((n: any) => n.type === "decision")
            .map((n: any) => ({
              card: n.label,
              owner: n.actor,
              branches: doc.connections
                .filter((c: any) => c.from === n.id)
                  .map((c: any) => `${c.label || "(unlabelled)"} -> ${(byId.get(c.to) as any)?.label ?? "?"}`),
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
      handler: async ({ slug, level = 3 }: any) => {
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
      handler: async ({ slug, nodes, connections, force }: any) => {
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
      handler: async ({ slug, ...patch }: any) => {
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
      handler: async ({ slug }: any) => {
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
      handler: async ({ slug, id }: any) => {
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
      handler: async ({ slug, label }: any) => {
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

  return TOOLS;
}
