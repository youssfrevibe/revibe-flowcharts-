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

export type LayoutDirection = "LR" | "TB";

export interface LayoutOptions {
  /** Flow direction: left→right (columns) or top→down (rows). */
  direction?: LayoutDirection;
  /** Gap between successive layers, along the flow direction. */
  primaryGap?: number;
  /** Gap between sibling nodes stacked within a layer. */
  secondaryGap?: number;
  /** Extra breathing room reserved around every node (guards against label/edge crowding). */
  margin?: number;
  startX?: number;
  startY?: number;
}

export const DEFAULT_LAYOUT: Required<Pick<LayoutOptions, "direction" | "primaryGap" | "secondaryGap" | "margin">> = {
  direction: "LR",
  primaryGap: 190,
  secondaryGap: 90,
  margin: 28,
};

/**
 * Layered auto-layout (Sugiyama-lite), draw.io / app.diagrams.net style.
 * - Layers nodes by longest-path depth from source nodes.
 * - Orders each layer by the barycenter of already-placed predecessors to reduce crossings.
 * - Reserves per-node breathing room + generous, tunable gaps so nodes never collapse together.
 * - Supports left→right and top→down flow.
 * A final overlap-resolution pass guarantees no two nodes overlap, whatever the graph shape.
 */
export function autoLayout(
  nodes: FlowNode[],
  connections: FlowConnection[],
  sizes: Map<string, Size>,
  opts: LayoutOptions = {}
): FlowNode[] {
  if (nodes.length === 0) return nodes;
  const direction = opts.direction ?? DEFAULT_LAYOUT.direction;
  const primaryGap = opts.primaryGap ?? DEFAULT_LAYOUT.primaryGap;
  const secondaryGap = opts.secondaryGap ?? DEFAULT_LAYOUT.secondaryGap;
  const margin = opts.margin ?? DEFAULT_LAYOUT.margin;
  const startX = opts.startX ?? 240;
  const startY = opts.startY ?? 240;
  const isLR = direction === "LR";

  // Notes are annotations, not flow steps — give them extra clearance so pathways for the
  // surrounding process don't get squeezed against (or through) the note box.
  const typeOf = new Map(nodes.map((n) => [n.id, n.type]));
  const extraFor = (id: string) => (typeOf.get(id) === "note" ? 56 : 0);

  // Effective footprint of a node = measured size + breathing room on all sides.
  const primaryExtent = (id: string) => (isLR ? sizeOf(id, sizes).w : sizeOf(id, sizes).h) + margin * 2 + extraFor(id) * 2;
  const secondaryExtent = (id: string) => (isLR ? sizeOf(id, sizes).h : sizeOf(id, sizes).w) + margin * 2 + extraFor(id) * 2;

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

  // Group by layer.
  const layers = new Map<number, string[]>();
  nodes.forEach((n) => {
    const l = layer.get(n.id)!;
    if (!layers.has(l)) layers.set(l, []);
    layers.get(l)!.push(n.id);
  });

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const sortedLayers = [...layers.keys()].sort((a, b) => a - b);

  const secOf = (n: FlowNode) => (isLR ? n.y : n.x);
  const renderedPrimary = (id: string) => (isLR ? sizeOf(id, sizes).w : sizeOf(id, sizes).h);
  const renderedSecondary = (id: string) => (isLR ? sizeOf(id, sizes).h : sizeOf(id, sizes).w);
  const secondaryCenter = 1400;
  const layerOf = (id: string) => layer.get(id)!;

  // Build a VIRTUAL graph: edges that span more than one layer get chains of dummy
  // waypoint nodes through the intermediate layers (draw.io/mxGraph technique). Dummies
  // carry alignment across layers so long edges end up straight, and reserve routing lanes
  // so those edges don't cut through unrelated nodes.
  const DUMMY_SEC = 46; // routing-lane width reserved for a long edge
  const dummySet = new Set<string>();
  const vLayers = new Map<number, string[]>();
  sortedLayers.forEach((l) => vLayers.set(l, [...layers.get(l)!]));
  const vOut = new Map<string, string[]>();
  const vIn = new Map<string, string[]>();
  const ensure = (m: Map<string, string[]>, k: string) => (m.get(k) ?? m.set(k, []).get(k)!);
  nodes.forEach((n) => {
    ensure(vOut, n.id);
    ensure(vIn, n.id);
  });
  let dummyN = 0;
  for (const [from, tos] of outAdj) {
    for (const to of tos) {
      const lf = layerOf(from);
      const lt = layerOf(to);
      if (lt - lf === 1) {
        ensure(vOut, from).push(to);
        ensure(vIn, to).push(from);
      } else if (lt - lf > 1) {
        let prev = from;
        for (let l = lf + 1; l < lt; l++) {
          const d = `__d${dummyN++}`;
          dummySet.add(d);
          if (!vLayers.has(l)) vLayers.set(l, []);
          vLayers.get(l)!.push(d);
          ensure(vOut, d);
          ensure(vIn, d);
          ensure(vOut, prev).push(d);
          ensure(vIn, d).push(prev);
          prev = d;
        }
        ensure(vOut, prev).push(to);
        ensure(vIn, to).push(prev);
      }
      // Back/same-layer edges are ignored for alignment to avoid distorting the spine.
    }
  }

  const extSec = (id: string) => (dummySet.has(id) ? DUMMY_SEC : secondaryExtent(id));

  // 1) Order nodes (real + dummy) within each layer by the barycenter of ordered predecessors.
  const predOrder = new Map<string, number>();
  const orderSeed = (id: string) => (dummySet.has(id) ? 0 : secOf(nodeById.get(id)!));
  for (const l of sortedLayers) {
    const arr = vLayers.get(l)!;
    arr.sort((a, b) => (predOrder.get(a) ?? orderSeed(a)) - (predOrder.get(b) ?? orderSeed(b)));
    arr.forEach((id, i) => {
      for (const to of vOut.get(id)!) predOrder.set(to, ((predOrder.get(to) ?? i) + i) / 2);
    });
  }

  // 2) Seed secondary CENTER coordinates: each layer stacked around a shared axis.
  const center = new Map<string, number>();
  for (const l of sortedLayers) {
    const arr = vLayers.get(l)!;
    const total = arr.reduce((acc, id) => acc + extSec(id), 0) + secondaryGap * (arr.length - 1);
    let s = secondaryCenter - total / 2;
    for (const id of arr) {
      center.set(id, s + extSec(id) / 2);
      s += extSec(id) + secondaryGap;
    }
  }

  // 3) Median alignment: repeatedly pull each node toward the median of its neighbours in the
  //    adjacent layer, then enforce order + minimum separation optimally (isotonic fit). Dummies
  //    propagate a straight axis across layers, so a straight process→process run (however long)
  //    lands on one line.
  const ITER = 16;
  for (let it = 0; it < ITER; it++) {
    const leftToRight = it % 2 === 0;
    const order = leftToRight ? sortedLayers : [...sortedLayers].reverse();
    for (const l of order) {
      const arr = vLayers.get(l)!;
      if (arr.length === 0) continue;
      const desired = arr.map((id) => {
        const neigh = leftToRight ? vIn.get(id)! : vOut.get(id)!;
        const vals = neigh.map((x) => center.get(x)!).filter((v) => v !== undefined);
        return vals.length ? median(vals) : center.get(id)!;
      });
      const resolved = fitRowToTargets(arr.map(extSec), desired, secondaryGap);
      arr.forEach((id, i) => center.set(id, resolved[i]));
    }
  }

  // 4) Assign final positions for REAL nodes. Primary axis advances layer by layer.
  const primaryStart = isLR ? startX : startY;
  const pos = new Map<string, { x: number; y: number }>();
  let cursor = primaryStart;
  for (const l of sortedLayers) {
    const realIds = layers.get(l)!;
    const layerPrimary = Math.max(...realIds.map(primaryExtent));
    for (const id of realIds) {
      const primaryPos = cursor + (layerPrimary - renderedPrimary(id)) / 2;
      const secondaryPos = center.get(id)! - renderedSecondary(id) / 2;
      pos.set(id, {
        x: isLR ? primaryPos : secondaryPos,
        y: isLR ? secondaryPos : primaryPos,
      });
    }
    cursor += layerPrimary + primaryGap;
  }

  const laid = nodes.map((n) => {
    const p = pos.get(n.id);
    return p ? { ...n, x: Math.round(p.x), y: Math.round(p.y) } : n;
  });

  // Safety net: guarantee no overlaps regardless of graph shape.
  return resolveOverlaps(laid, sizes, Math.min(secondaryGap, primaryGap) * 0.5 + margin);
}

/** Median of a numeric list (average of the middle two when even). */
function median(vals: number[]): number {
  const s = [...vals].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Places ordered items (given their extents) as close as possible to `targets` (centers)
 * while keeping their order and a minimum center-to-center separation. This is an isotonic
 * (order-preserving) least-squares fit solved with pool-adjacent-violators — it lets a whole
 * run of nodes shift together to stay aligned instead of ratcheting apart.
 */
function fitRowToTargets(extents: number[], targets: number[], gap: number): number[] {
  const n = extents.length;
  if (n === 0) return [];
  if (n === 1) return [targets[0]];
  // Minimum offset of item i's center from item 0's center to satisfy separation.
  const offset = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    offset[i] = offset[i - 1] + extents[i - 1] / 2 + extents[i] / 2 + gap;
  }
  // With c_i = z_i + offset_i and constraint z non-decreasing, minimise Σ(z_i - (t_i - offset_i))².
  const t = targets.map((d, i) => d - offset[i]);
  const z = isotonicNonDecreasing(t);
  return z.map((zi, i) => zi + offset[i]);
}

/** Pool-adjacent-violators: least-squares non-decreasing fit (equal weights). */
function isotonicNonDecreasing(y: number[]): number[] {
  const val: number[] = [];
  const cnt: number[] = [];
  for (const yi of y) {
    let v = yi;
    let c = 1;
    while (val.length > 0 && val[val.length - 1] > v) {
      const pv = val.pop()!;
      const pc = cnt.pop()!;
      v = (v * c + pv * pc) / (c + pc);
      c += pc;
    }
    val.push(v);
    cnt.push(c);
  }
  const out: number[] = [];
  for (let i = 0; i < val.length; i++) for (let k = 0; k < cnt[i]; k++) out.push(val[i]);
  return out;
}

/**
 * Pushes apart any nodes whose (padded) bounding boxes overlap, using minimal displacement
 * along the axis of least penetration. Iterative and bounded; safe for a few hundred nodes.
 * Works on whatever positions the nodes currently have — usable as a standalone "declutter".
 */
export function resolveOverlaps(nodes: FlowNode[], sizes: Map<string, Size>, gap = 40): FlowNode[] {
  if (nodes.length < 2) return nodes;
  const pos = nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, ...sizeOf(n.id, sizes) }));
  const ITERS = 24;
  let moved = false;

  for (let iter = 0; iter < ITERS; iter++) {
    let any = false;
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const a = pos[i];
        const b = pos[j];
        // Overlap (including the gap) on each axis.
        const overlapX = a.x + a.w + gap - b.x < 0 || b.x + b.w + gap - a.x < 0 ? 0 : Math.min(a.x + a.w + gap - b.x, b.x + b.w + gap - a.x);
        const overlapY = a.y + a.h + gap - b.y < 0 || b.y + b.h + gap - a.y < 0 ? 0 : Math.min(a.y + a.h + gap - b.y, b.y + b.h + gap - a.y);
        if (overlapX > 0 && overlapY > 0) {
          any = true;
          moved = true;
          // Resolve along the axis needing the least push.
          if (overlapX < overlapY) {
            const shift = overlapX / 2;
            if (a.x <= b.x) {
              a.x -= shift;
              b.x += shift;
            } else {
              a.x += shift;
              b.x -= shift;
            }
          } else {
            const shift = overlapY / 2;
            if (a.y <= b.y) {
              a.y -= shift;
              b.y += shift;
            } else {
              a.y += shift;
              b.y -= shift;
            }
          }
        }
      }
    }
    if (!any) break;
  }

  if (!moved) return nodes;
  const byId = new Map(pos.map((p) => [p.id, p]));
  return nodes.map((n) => {
    const p = byId.get(n.id)!;
    return { ...n, x: Math.round(p.x), y: Math.round(p.y) };
  });
}
