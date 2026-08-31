/**
 * Prompts + validation for the AI routes.
 *
 * Two modes share one vocabulary:
 *   generate — build a whole flowchart from a description (replaces the document)
 *   edit     — read the current flowchart and return a list of surgical edits
 *
 * The edit mode is what gives the AI "full ability to edit anything": every
 * user-editable field on [[FlowNode]] and [[FlowConnection]] is exposed, and the
 * model is handed a serialized view of the live document so its instructions are
 * grounded in the flow as it exists right now.
 */

import { FlowConnection, FlowData, FlowNode } from "./types";
import {
  ACTORS,
  CONN_TYPES,
  NODE_TYPES,
  NODE_WIDTHS,
  TEXT_ALIGNS,
  TEXT_POSITIONS,
  TEXT_SIZES,
} from "./ai-server";

const list = (xs: readonly string[]) => xs.map((t) => `"${t}"`).join(", ");

/** The field vocabulary, described once and reused by both prompts. */
const FIELD_REFERENCE = `NODE FIELDS (all optional except type/label):
- "type": one of ${list(NODE_TYPES)}.
  - "start" = the entry point (exactly one per flow).
  - "step" = a normal action/process step.
  - "decision" = a yes/no or branching question (label should read as a question).
  - "sub" = a sub-process that could be expanded elsewhere.
  - "ok" = a successful end state. "fail" = a failed/cancelled end state.
  - "note" = an annotation/comment (use sparingly).
- "label": concise, a few words. This is the card's headline.
- "detail": longer explanation of what happens at this step.
- "actor": who performs the step — ${list(ACTORS)}. "revibe" = our team, "seller" = seller/supplier,
  "system" = automated, "carrier" = third party/carrier/lab. Set this whenever it is knowable.
- "internalStage": the stage name the team tracks internally (e.g. "Pending LAB collection"). Free text.
- "externalStage": the stage name shown to the customer (e.g. "Under QC"). Free text.
- "sla": the time target for the step (e.g. "24h", "2 business days").
- "inputs": what the step needs to begin. "outputs": what it produces.
- "tools": array of systems/tools used (e.g. ["Shopify", "Zendesk"]).
- "agentSteps": array of concrete sub-actions an operator performs, in order.
- "color": accent override — a preset name ("emerald", "blue", "amber", "red", "purple") or hex ("#3b82f6").
- "textPosition": ${list(TEXT_POSITIONS)}. "textAlign": ${list(TEXT_ALIGNS)}. "textSize": ${list(TEXT_SIZES)}.
- "customWidth": ${list(NODE_WIDTHS)} or a pixel number.

CONNECTION FIELDS:
- "from"/"to": node ids.
- "type": one of ${list(CONN_TYPES)}. "" = normal flow, "cyes" = the Yes branch (green),
  "cno" = the No branch (red), "camber" = a conditional branch (amber).
- "label": short branch label (a few words).
- "bold": true to mark the primary/critical pathway.
- "color": hex override for the pathway.

RULES:
- Every "decision" node should have at least two outgoing connections (typically one "cyes" and one "cno"), each labelled.
- The graph must be connected and flow from the start node to at least one end state ("ok" or "fail").
- Do not set x/y — positions are handled by the app's auto-layout.`;

export const GENERATE_SYSTEM_PROMPT = `You are a process-mapping assistant. Turn the user's description of a business or operational process into a flowchart as STRICT JSON.

Output ONLY a JSON object of this exact shape (no markdown, no commentary):
{
  "title": string,
  "nodes": [ { "id": string, "type": string, "label": string, "detail": string, ...other node fields } ],
  "connections": [ { "from": string, "to": string, "label": string, "type": string, ...other connection fields } ]
}

- "id" must be short and unique (e.g. "n1", "n2", ...). Connections reference these ids in "from"/"to".
- Aim for 6-20 nodes for a typical process.

${FIELD_REFERENCE}`;

export const EDIT_SYSTEM_PROMPT = `You are a process-mapping assistant with full edit access to an existing flowchart. You are given the CURRENT FLOWCHART and an INSTRUCTION from the user. Return the edits needed to carry out the instruction.

Output ONLY a JSON object of this exact shape (no markdown, no commentary):
{
  "summary": string,
  "operations": [ ... ]
}

"summary" is one sentence describing what you changed, in past tense.

Each operation is one of:
{ "op": "addNode", "id": "<new temporary id>", "type": ..., "label": ..., ...other node fields }
{ "op": "updateNode", "id": "<existing node id>", ...only the fields you want to change }
{ "op": "deleteNode", "id": "<existing node id>" }
{ "op": "addConnection", "from": "<node id>", "to": "<node id>", "label": ..., "type": ... }
{ "op": "updateConnection", "from": "<node id>", "to": "<node id>", ...only the fields you want to change }
{ "op": "deleteConnection", "from": "<node id>", "to": "<node id>" }
{ "op": "setTitle", "title": "<new diagram title>" }

CRITICAL:
- Reference EXISTING nodes by the exact id shown in the CURRENT FLOWCHART. Never invent ids for existing nodes.
- For new nodes, choose an id that does not already exist (e.g. "new1", "new2"); later operations in the
  same response may reference those new ids in "from"/"to".
- "updateNode" is a partial patch: include ONLY the fields that should change. Omitted fields are left alone.
  To clear a field, set it to an empty string.
- Deleting a node also removes its connections; you do not need separate deleteConnection operations for those.
- Return the SMALLEST set of operations that satisfies the instruction. Do not rewrite untouched parts of the flow.
- If the instruction is a question rather than an edit request, return an empty "operations" array and put the
  answer in "summary".

${FIELD_REFERENCE}`;

/**
 * Serializes the live document into a compact, id-labelled form for the model.
 * Positions are omitted (the model must not reason about layout) and long text is
 * clipped to keep the prompt affordable on large diagrams.
 */
export function describeFlow(data: FlowData, title?: string): string {
  const clip = (s: unknown, n: number) => (typeof s === "string" && s ? s.replace(/\s+/g, " ").slice(0, n) : "");

  const lines: string[] = [];
  if (title) lines.push(`TITLE: ${title}`);
  lines.push(`NODES (${data.nodes.length}):`);
  for (const n of data.nodes) {
    const parts = [`[${n.id}]`, `type=${n.type}`, `label="${clip(n.label, 120)}"`];
    if (n.detail) parts.push(`detail="${clip(n.detail, 300)}"`);
    if (n.actor) parts.push(`actor=${n.actor}`);
    if (n.internalStage) parts.push(`internal_stage="${clip(n.internalStage, 80)}"`);
    if (n.externalStage) parts.push(`external_stage="${clip(n.externalStage, 80)}"`);
    if (n.sla) parts.push(`sla="${clip(n.sla, 40)}"`);
    if (n.inputs) parts.push(`inputs="${clip(n.inputs, 120)}"`);
    if (n.outputs) parts.push(`outputs="${clip(n.outputs, 120)}"`);
    if (n.tools?.length) parts.push(`tools=[${n.tools.slice(0, 12).map((t) => clip(t, 40)).join(", ")}]`);
    if (n.agentSteps?.length)
      parts.push(`agent_steps=[${n.agentSteps.slice(0, 12).map((t) => clip(t, 80)).join(" | ")}]`);
    if (n.color) parts.push(`color=${clip(n.color, 20)}`);
    lines.push("  " + parts.join(" "));
  }

  lines.push(`CONNECTIONS (${data.connections.length}):`);
  for (const c of data.connections) {
    const parts = [`${c.from} -> ${c.to}`];
    if (c.type) parts.push(`type=${c.type}`);
    if (c.label) parts.push(`label="${clip(c.label, 80)}"`);
    if (c.bold) parts.push("bold=true");
    lines.push("  " + parts.join(" "));
  }

  return lines.join("\n");
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

const inSet = <T extends string>(allowed: readonly T[], v: unknown): T | undefined =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;

const str = (v: unknown, max: number): string | undefined => (typeof v === "string" ? v.slice(0, max) : undefined);

const strArray = (v: unknown, maxItems: number, maxLen: number): string[] | undefined =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === "string")
        .slice(0, maxItems)
        .map((x) => x.slice(0, maxLen))
    : undefined;

/**
 * Whitelists model output down to the subset of [[FlowNode]] the AI is allowed to
 * set. Anything unrecognized — including x/y — is dropped rather than trusted.
 * Returns only the keys the model actually provided, so it doubles as a patch.
 */
export function sanitizeNodePatch(raw: unknown): Partial<FlowNode> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const out: Partial<FlowNode> = {};

  const type = inSet(NODE_TYPES, r.type);
  if (type) out.type = type;

  const label = str(r.label, 200);
  if (label !== undefined) out.label = label;
  const detail = str(r.detail, 2000);
  if (detail !== undefined) out.detail = detail;

  const actor = inSet(ACTORS, r.actor);
  if (actor) out.actor = actor;

  for (const key of ["internalStage", "externalStage", "sla"] as const) {
    const v = str(r[key], 120);
    if (v !== undefined) out[key] = v;
  }
  for (const key of ["inputs", "outputs"] as const) {
    const v = str(r[key], 1000);
    if (v !== undefined) out[key] = v;
  }

  const tools = strArray(r.tools, 20, 60);
  if (tools) out.tools = tools;
  const agentSteps = strArray(r.agentSteps, 30, 300);
  if (agentSteps) out.agentSteps = agentSteps;

  const color = str(r.color, 24);
  if (color !== undefined) out.color = color;

  const textPosition = inSet(TEXT_POSITIONS, r.textPosition);
  if (textPosition) out.textPosition = textPosition;
  const textAlign = inSet(TEXT_ALIGNS, r.textAlign);
  if (textAlign) out.textAlign = textAlign;
  const textSize = inSet(TEXT_SIZES, r.textSize);
  if (textSize) out.textSize = textSize;

  const width = inSet(NODE_WIDTHS, r.customWidth);
  if (width) out.customWidth = width;
  else if (typeof r.customWidth === "number" && Number.isFinite(r.customWidth)) {
    out.customWidth = Math.min(900, Math.max(120, Math.round(r.customWidth)));
  }

  return out;
}

/** Whitelists the connection fields the AI may set (excluding from/to and waypoints). */
export function sanitizeConnPatch(raw: unknown): Partial<FlowConnection> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const out: Partial<FlowConnection> = {};

  const type = inSet(CONN_TYPES, r.type);
  if (type !== undefined) out.type = type;

  const label = str(r.label, 80);
  if (label !== undefined) out.label = label;

  if (typeof r.bold === "boolean") out.bold = r.bold;

  const color = str(r.color, 24);
  if (color !== undefined) out.color = color;

  return out;
}

/* ------------------------------------------------------------------ *
 * Edit operations (the wire format between /api/ai/edit and the client)
 * ------------------------------------------------------------------ */

export type AIEditOp =
  | ({ op: "addNode"; id: string } & Partial<FlowNode>)
  | ({ op: "updateNode"; id: string } & Partial<FlowNode>)
  | { op: "deleteNode"; id: string }
  | ({ op: "addConnection"; from: string; to: string } & Partial<FlowConnection>)
  | ({ op: "updateConnection"; from: string; to: string } & Partial<FlowConnection>)
  | { op: "deleteConnection"; from: string; to: string }
  | { op: "setTitle"; title: string };

export interface AIEditPlan {
  summary: string;
  operations: AIEditOp[];
}

/**
 * Validates the model's edit plan. Operations that are malformed or reference
 * unknown ids are dropped here rather than at apply time, so the client only ever
 * receives operations it can actually run. `knownIds` is the set of node ids in the
 * live document; ids introduced by earlier `addNode` operations become known too.
 */
export function normalizeEditPlan(parsed: unknown, knownIds: Set<string>): AIEditPlan {
  const p = (parsed ?? {}) as Record<string, unknown>;
  const summary = typeof p.summary === "string" ? p.summary.slice(0, 500) : "";
  const rawOps = Array.isArray(p.operations) ? p.operations : [];

  const ids = new Set(knownIds);
  const pending = new Set<string>(); // ids created in this plan
  const operations: AIEditOp[] = [];

  for (const raw of rawOps.slice(0, 200)) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const op = typeof r.op === "string" ? r.op : "";
    const id = typeof r.id === "string" ? r.id.slice(0, 80) : "";
    const from = typeof r.from === "string" ? r.from.slice(0, 80) : "";
    const to = typeof r.to === "string" ? r.to.slice(0, 80) : "";

    switch (op) {
      case "addNode": {
        if (!id || ids.has(id)) break; // no id, or would collide with an existing node
        const patch = sanitizeNodePatch(raw);
        if (!patch.label) break; // a node with no label is not worth adding
        ids.add(id);
        pending.add(id);
        operations.push({ op: "addNode", id, ...patch });
        break;
      }
      case "updateNode": {
        if (!ids.has(id)) break;
        const patch = sanitizeNodePatch(raw);
        if (!Object.keys(patch).length) break; // nothing to change
        operations.push({ op: "updateNode", id, ...patch });
        break;
      }
      case "deleteNode": {
        if (!ids.has(id)) break;
        ids.delete(id);
        pending.delete(id);
        operations.push({ op: "deleteNode", id });
        break;
      }
      case "addConnection": {
        if (!ids.has(from) || !ids.has(to) || from === to) break;
        const patch = sanitizeConnPatch(raw);
        operations.push({ op: "addConnection", from, to, label: patch.label ?? "", type: patch.type ?? "", ...patch });
        break;
      }
      case "updateConnection": {
        if (!ids.has(from) || !ids.has(to)) break;
        const patch = sanitizeConnPatch(raw);
        if (!Object.keys(patch).length) break;
        operations.push({ op: "updateConnection", from, to, ...patch });
        break;
      }
      case "deleteConnection": {
        if (!from || !to) break;
        operations.push({ op: "deleteConnection", from, to });
        break;
      }
      case "setTitle": {
        const title = typeof r.title === "string" ? r.title.trim().slice(0, 120) : "";
        if (title) operations.push({ op: "setTitle", title });
        break;
      }
    }
  }

  return { summary, operations };
}

/**
 * Coerces a full generated document into safe FlowNode/FlowConnection shapes,
 * renumbering ids so model-chosen ids can never collide with app-generated ones.
 */
export function normalizeGenerated(parsed: { nodes?: unknown[]; connections?: unknown[] }) {
  const rawNodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
  const idMap = new Map<string, string>();

  const nodes: FlowNode[] = rawNodes.slice(0, 60).map((raw, i) => {
    const r = raw as Record<string, unknown>;
    idMap.set(String(r.id ?? `n${i + 1}`), `n_${i + 1}`);
    const patch = sanitizeNodePatch(raw);
    // Rough grid position; the client re-runs auto-layout after import.
    return {
      ...patch,
      id: `n_${i + 1}`,
      type: patch.type ?? "step",
      x: 240 + (i % 4) * 320,
      y: 200 + Math.floor(i / 4) * 200,
      label: patch.label || "Step",
      detail: patch.detail ?? "",
    };
  });

  const validIds = new Set(nodes.map((n) => n.id));
  const rawConns = Array.isArray(parsed.connections) ? parsed.connections : [];
  const connections: FlowConnection[] = [];
  rawConns.forEach((raw, i) => {
    const r = raw as Record<string, unknown>;
    const from = idMap.get(String(r.from));
    const to = idMap.get(String(r.to));
    if (!from || !to || !validIds.has(from) || !validIds.has(to) || from === to) return;
    const patch = sanitizeConnPatch(raw);
    connections.push({ ...patch, id: `c_ai_${i + 1}`, from, to, label: patch.label ?? "", type: patch.type ?? "" });
  });

  return { nodes, connections };
}
