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
 * Layered top-down auto-layout (Sugiyama-lite).
 * - Layers nodes by longest-path depth from source nodes.
 * - Orders each layer by the barycenter of already-placed predecessors to reduce edge crossings.
 * - Centers layers horizontally and spaces by measured node sizes.
 */
export function autoLayout(
  nodes: FlowNode[],
  connections: FlowConnection[],
  sizes: Map<string, Size>,
  opts: { xGap?: number; yGap?: number; startX?: number; startY?: number } = {}
): FlowNode[] {
  if (nodes.length === 0) return nodes;
  const xGap = opts.xGap ?? 60;
  const yGap = opts.yGap ?? 90;
  const startX = opts.startX ?? 200;
  const startY = opts.startY ?? 80;

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

  // Assign layer = longest path from any source. Handle cycles via visited guard.
  const layer = new Map<string, number>();
  const roots = nodes.filter((n) => (indeg.get(n.id) || 0) === 0).map((n) => n.id);
  const seeds = roots.length ? roots : [nodes[0].id];
  seeds.forEach((r) => layer.set(r, 0));

  // Relaxation passes (bounded to avoid infinite loops on cycles).
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

  // Group by layer.
  const layers = new Map<number, string[]>();
  nodes.forEach((n) => {
    const l = layer.get(n.id)!;
    if (!layers.has(l)) layers.set(l, []);
    layers.get(l)!.push(n.id);
  });

  const posById = new Map<string, { x: number; y: number }>();
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const sortedLayers = [...layers.keys()].sort((a, b) => a - b);

  // Order within each layer by barycenter of predecessors' x (falls back to original x).
  const predX = new Map<string, number>();
  let y = startY;
  for (const l of sortedLayers) {
    const layerIds = layers.get(l)!;
    layerIds.sort((a, b) => {
      const pa = predX.get(a) ?? nodeById.get(a)!.x;
      const pb = predX.get(b) ?? nodeById.get(b)!.x;
      return pa - pb;
    });

    const heights = layerIds.map((id) => sizeOf(id, sizes).h);
    const rowH = Math.max(...heights);
    const totalW =
      layerIds.reduce((acc, id) => acc + sizeOf(id, sizes).w, 0) + xGap * (layerIds.length - 1);
    let x = startX - totalW / 2 + 600; // shift into positive canvas space
    for (const id of layerIds) {
      const s = sizeOf(id, sizes);
      posById.set(id, { x, y: y + (rowH - s.h) / 2 });
      // Seed successors' barycenter with this node's center x.
      const cx = x + s.w / 2;
      for (const to of outAdj.get(id)!) {
        predX.set(to, ((predX.get(to) ?? cx) + cx) / 2);
      }
      x += s.w + xGap;
    }
    y += rowH + yGap;
  }

  return nodes.map((n) => {
    const p = posById.get(n.id);
    return p ? { ...n, x: Math.round(p.x), y: Math.round(p.y) } : n;
  });
}
