import { FlowConnection, FlowNode, Port } from "./types";

export interface Size {
  w: number;
  h: number;
}

export const DEFAULT_SIZE: Size = { w: 210, h: 84 };

export function sizeOf(id: string, sizes: Map<string, Size>): Size {
  return sizes.get(id) || DEFAULT_SIZE;
}

export function nodeCenter(n: FlowNode, sizes: Map<string, Size>) {
  const s = sizeOf(n.id, sizes);
  return { x: n.x + s.w / 2, y: n.y + s.h / 2 };
}

export function portPos(n: FlowNode, port: Port, sizes: Map<string, Size>) {
  const s = sizeOf(n.id, sizes);
  switch (port) {
    case "top":
      return { x: n.x + s.w / 2, y: n.y };
    case "bottom":
      return { x: n.x + s.w / 2, y: n.y + s.h };
    case "left":
      return { x: n.x, y: n.y + s.h / 2 };
    case "right":
      return { x: n.x + s.w, y: n.y + s.h / 2 };
  }
}

/** Chooses the pair of ports that gives the most natural connection between two nodes. */
export function bestPorts(
  a: FlowNode,
  b: FlowNode,
  sizes: Map<string, Size>
): { fp: Port; tp: Port } {
  const ac = nodeCenter(a, sizes);
  const bc = nodeCenter(b, sizes);
  const dx = bc.x - ac.x;
  const dy = bc.y - ac.y;
  if (Math.abs(dy) >= Math.abs(dx)) {
    return { fp: dy > 0 ? "bottom" : "top", tp: dy > 0 ? "top" : "bottom" };
  }
  return { fp: dx > 0 ? "right" : "left", tp: dx > 0 ? "left" : "right" };
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  w: number;
  h: number;
}

export function computeBounds(nodes: FlowNode[], sizes: Map<string, Size>): Bounds | null {
  if (nodes.length === 0) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const n of nodes) {
    const s = sizeOf(n.id, sizes);
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + s.w);
    maxY = Math.max(maxY, n.y + s.h);
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

/**
 * Layered left-to-right auto-layout (Sugiyama-lite), like a system/architecture diagram.
 * - Layers nodes by longest-path depth from source nodes → each layer is a COLUMN.
 * - Orders each column vertically by the barycenter of already-placed predecessors to
 *   reduce edge crossings.
 * - Generous, uniform gaps give the diagram "breathing room".
 * - Columns are centered on a shared vertical axis so the flow reads cleanly across.
 */
export function autoLayout(
  nodes: FlowNode[],
  connections: FlowConnection[],
  sizes: Map<string, Size>,
  opts: { xGap?: number; yGap?: number; startX?: number; centerY?: number } = {}
): FlowNode[] {
  if (nodes.length === 0) return nodes;
  const xGap = opts.xGap ?? 150; // horizontal breathing room between columns
  const yGap = opts.yGap ?? 48; // vertical gap between nodes stacked in a column
  const startX = opts.startX ?? 240;
  const centerY = opts.centerY ?? 1400; // shared vertical axis (kept well inside canvas)

  const ids = new Set(nodes.map((n) => n.id));
  const outAdj = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  nodes.forEach((n) => {
    outAdj.set(n.id, []);
    indeg.set(n.id, 0);
  });
  connections.forEach((c) => {
    if (ids.has(c.from) && ids.has(c.to) && c.from !== c.to) {
      outAdj.get(c.from)!.push(c.to);
      indeg.set(c.to, (indeg.get(c.to) || 0) + 1);
    }
  });

  // Assign layer = longest path from any source. Bounded relaxation guards against cycles.
  const layer = new Map<string, number>();
  const roots = nodes.filter((n) => (indeg.get(n.id) || 0) === 0).map((n) => n.id);
  const seeds = roots.length ? roots : [nodes[0].id];
  seeds.forEach((r) => layer.set(r, 0));

  for (let pass = 0; pass < nodes.length; pass++) {
    let changed = false;
    for (const [from, tos] of outAdj) {
      const lf = layer.get(from);
      if (lf === undefined) continue;
      for (const to of tos) {
        const want = lf + 1;
        if ((layer.get(to) ?? -1) < want) {
          layer.set(to, want);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  // Any unplaced (disconnected) nodes go to layer 0.
  nodes.forEach((n) => {
    if (!layer.has(n.id)) layer.set(n.id, 0);
  });

  // Group by layer (each layer becomes a column).
  const layers = new Map<number, string[]>();
  nodes.forEach((n) => {
    const l = layer.get(n.id)!;
    if (!layers.has(l)) layers.set(l, []);
    layers.get(l)!.push(n.id);
  });

  const posById = new Map<string, { x: number; y: number }>();
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const sortedLayers = [...layers.keys()].sort((a, b) => a - b);

  // Order within each column by barycenter of predecessors' y (falls back to original y).
  const predY = new Map<string, number>();
  let x = startX;
  for (const l of sortedLayers) {
    const colIds = layers.get(l)!;
    colIds.sort((a, b) => {
      const pa = predY.get(a) ?? nodeById.get(a)!.y;
      const pb = predY.get(b) ?? nodeById.get(b)!.y;
      return pa - pb;
    });

    const colW = Math.max(...colIds.map((id) => sizeOf(id, sizes).w));
    const totalH =
      colIds.reduce((acc, id) => acc + sizeOf(id, sizes).h, 0) + yGap * (colIds.length - 1);
    let y = centerY - totalH / 2;
    for (const id of colIds) {
      const s = sizeOf(id, sizes);
      // Center each node horizontally within its column's width.
      posById.set(id, { x: x + (colW - s.w) / 2, y });
      // Seed successors' barycenter with this node's center y.
      const cy = y + s.h / 2;
      for (const to of outAdj.get(id)!) {
        predY.set(to, ((predY.get(to) ?? cy) + cy) / 2);
      }
      y += s.h + yGap;
    }
    x += colW + xGap;
  }

  return nodes.map((n) => {
    const p = posById.get(n.id);
    return p ? { ...n, x: Math.round(p.x), y: Math.round(p.y) } : n;
  });
}
