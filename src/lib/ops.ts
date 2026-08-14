import { FlowData, FlowConnection, FlowNode, Op } from "./types";

/** Stable key for a connection, tolerant of legacy data that predates connection ids. */
export function connId(c: FlowConnection): string {
  return c.id || `${c.from}__${c.to}`;
}

export function newConnId(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/** Ensures every connection has a stable id (idempotent). Returns a new array only if changes were needed. */
export function backfillConnIds(connections: FlowConnection[]): FlowConnection[] {
  let changed = false;
  const out = connections.map((c) => {
    if (c.id) return c;
    changed = true;
    return { ...c, id: `${c.from}__${c.to}` };
  });
  return changed ? out : connections;
}

/**
 * Pure reducer: apply a single op to a document, returning a new document.
 * Used identically for local edits and for remote edits received over Realtime,
 * which guarantees both peers converge on the same state.
 */
export function applyOp(data: FlowData, op: Op): FlowData {
  switch (op.t) {
    case "node.upsert": {
      const exists = data.nodes.some((n) => n.id === op.node.id);
      return {
        ...data,
        nodes: exists
          ? data.nodes.map((n) => (n.id === op.node.id ? op.node : n))
          : [...data.nodes, op.node],
      };
    }
    case "nodes.move": {
      const byId = new Map(op.moves.map((m) => [m.id, m]));
      return {
        ...data,
        nodes: data.nodes.map((n) => {
          const m = byId.get(n.id);
          return m ? { ...n, x: m.x, y: m.y } : n;
        }),
      };
    }
    case "node.delete": {
      return {
        nodes: data.nodes.filter((n) => n.id !== op.id),
        connections: data.connections.filter((c) => c.from !== op.id && c.to !== op.id),
      };
    }
    case "conn.upsert": {
      const key = connId(op.conn);
      const exists = data.connections.some((c) => connId(c) === key);
      return {
        ...data,
        connections: exists
          ? data.connections.map((c) => (connId(c) === key ? op.conn : c))
          : [...data.connections, op.conn],
      };
    }
    case "conn.delete": {
      return {
        ...data,
        connections: data.connections.filter((c) => connId(c) !== op.id),
      };
    }
    case "doc.replace": {
      return { nodes: op.nodes, connections: op.connections };
    }
    default:
      return data;
  }
}

/** Applies a batch of ops in order. */
export function applyOps(data: FlowData, ops: Op[]): FlowData {
  return ops.reduce(applyOp, data);
}
