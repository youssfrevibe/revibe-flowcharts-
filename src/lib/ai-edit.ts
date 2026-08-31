/**
 * Applies an AI edit plan to the live document.
 *
 * The plan arrives from `/api/ai/edit` already validated (see
 * [[normalizeEditPlan]]); this module turns it into a new [[FlowData]] plus the
 * matching [[Op]] list so the change replays identically for every collaborator
 * over Realtime, exactly like a hand edit.
 *
 * New nodes get real app-generated ids here — the model's temporary ids are only
 * used to wire up connections within the same plan.
 */

import { generateNodeId } from "./diagram-store";
import { connId, newConnId } from "./ops";
import { AIEditOp } from "./ai-schema";
import { FlowConnection, FlowData, FlowNode, Op } from "./types";

export interface AIEditResult {
  data: FlowData;
  ops: Op[];
  /** New diagram title, when the plan asked for one. */
  title?: string;
  /** Human-readable counts for the confirmation shown after applying. */
  counts: { added: number; updated: number; deleted: number; connected: number; disconnected: number };
}

/**
 * Strips the keys the plan is never allowed to set: the discriminator, the
 * endpoint references, and node identity/layout, which stay ours.
 */
function fields<T>(op: object): Partial<T> {
  const rest = { ...op } as Record<string, unknown>;
  for (const k of ["op", "id", "from", "to", "x", "y"]) delete rest[k];
  return rest as Partial<T>;
}

export function applyAIEdits(data: FlowData, operations: AIEditOp[], uid: string): AIEditResult {
  let nodes = [...data.nodes];
  let connections = [...data.connections];
  const ops: Op[] = [];
  const counts = { added: 0, updated: 0, deleted: 0, connected: 0, disconnected: 0 };
  let title: string | undefined;

  /** Model id -> real id. Only new nodes need an entry; existing ids map to themselves. */
  const realId = new Map<string, string>();
  const resolve = (id: string) => realId.get(id) ?? id;

  // Place new nodes on a spare row; auto-layout runs afterwards and overrides this.
  const maxY = nodes.reduce((m, n) => Math.max(m, n.y), 0);
  let placed = 0;

  for (const op of operations) {
    switch (op.op) {
      case "addNode": {
        const patch = fields<FlowNode>(op);
        const id = generateNodeId();
        realId.set(op.id, id);
        const node: FlowNode = {
          ...patch,
          id,
          type: patch.type ?? "step",
          label: patch.label ?? "Step",
          detail: patch.detail ?? "",
          x: 240 + (placed % 5) * 320,
          y: maxY + 220 + Math.floor(placed / 5) * 200,
        };
        placed++;
        nodes.push(node);
        ops.push({ t: "node.upsert", origin: uid, node });
        counts.added++;
        break;
      }

      case "updateNode": {
        const patch = fields<FlowNode>(op);
        const id = resolve(op.id);
        const idx = nodes.findIndex((n) => n.id === id);
        if (idx < 0) break;
        const node = { ...nodes[idx], ...patch };
        nodes[idx] = node;
        ops.push({ t: "node.upsert", origin: uid, node });
        counts.updated++;
        break;
      }

      case "deleteNode": {
        const id = resolve(op.id);
        if (!nodes.some((n) => n.id === id)) break;
        nodes = nodes.filter((n) => n.id !== id);
        connections = connections.filter((c) => c.from !== id && c.to !== id);
        ops.push({ t: "node.delete", origin: uid, id });
        counts.deleted++;
        break;
      }

      case "addConnection": {
        const patch = fields<FlowConnection>(op);
        const from = resolve(op.from);
        const to = resolve(op.to);
        if (from === to) break;
        if (!nodes.some((n) => n.id === from) || !nodes.some((n) => n.id === to)) break;
        if (connections.some((c) => c.from === from && c.to === to)) break; // already wired
        const conn: FlowConnection = {
          ...patch,
          id: newConnId(),
          from,
          to,
          label: patch.label ?? "",
          type: patch.type ?? "",
        };
        connections.push(conn);
        ops.push({ t: "conn.upsert", origin: uid, conn });
        counts.connected++;
        break;
      }

      case "updateConnection": {
        const patch = fields<FlowConnection>(op);
        const from = resolve(op.from);
        const to = resolve(op.to);
        const idx = connections.findIndex((c) => c.from === from && c.to === to);
        if (idx < 0) break;
        const conn: FlowConnection = { ...connections[idx], ...patch, id: connections[idx].id || newConnId() };
        connections[idx] = conn;
        ops.push({ t: "conn.upsert", origin: uid, conn });
        counts.updated++;
        break;
      }

      case "deleteConnection": {
        const from = resolve(op.from);
        const to = resolve(op.to);
        const target = connections.find((c) => c.from === from && c.to === to);
        if (!target) break;
        const key = connId(target);
        connections = connections.filter((c) => connId(c) !== key);
        ops.push({ t: "conn.delete", origin: uid, id: key });
        counts.disconnected++;
        break;
      }

      case "setTitle": {
        title = op.title;
        break;
      }
    }
  }

  return { data: { nodes, connections }, ops, title, counts };
}

/** One-line summary of what an edit plan actually changed, for the toast/status line. */
export function describeCounts(c: AIEditResult["counts"]): string {
  const parts: string[] = [];
  if (c.added) parts.push(`${c.added} step${c.added > 1 ? "s" : ""} added`);
  if (c.updated) parts.push(`${c.updated} updated`);
  if (c.deleted) parts.push(`${c.deleted} removed`);
  if (c.connected) parts.push(`${c.connected} pathway${c.connected > 1 ? "s" : ""} added`);
  if (c.disconnected) parts.push(`${c.disconnected} pathway${c.disconnected > 1 ? "s" : ""} removed`);
  return parts.length ? parts.join(", ") : "no changes";
}
