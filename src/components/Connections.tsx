"use client";

import { FlowNode, FlowConnection, Port } from "@/lib/types";
import { Size, bestPorts, sizeOf, computeBounds } from "@/lib/graph";
import { connId } from "@/lib/ops";

interface Props {
  nodes: FlowNode[];
  connections: FlowConnection[];
  sizes: Map<string, Size>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  onEditLabel: (id: string) => void;
  ghost?: { x1: number; y1: number; x2: number; y2: number } | null;
}

const STROKE: Record<string, string> = {
  "": "stroke-zinc-400 dark:stroke-zinc-500",
  cyes: "stroke-emerald-500",
  cno: "stroke-red-500",
  camber: "stroke-amber-500",
};
const FILL: Record<string, string> = {
  "": "fill-zinc-400 dark:fill-zinc-500",
  cyes: "fill-emerald-500",
  cno: "fill-red-500",
  camber: "fill-amber-500",
};
const TEXT_FILL: Record<string, string> = {
  "": "fill-zinc-600 dark:fill-zinc-300",
  cyes: "fill-emerald-600 dark:fill-emerald-400",
  cno: "fill-red-600 dark:fill-red-400",
  camber: "fill-amber-600 dark:fill-amber-400",
};

type Pt = { x: number; y: number };
type Box = { id: string; x: number; y: number; w: number; h: number };

const STUB = 18; // fixed exit/entry length off a port
const CORNER = 12; // rounded-corner radius
const CHANNEL_STEP = 16; // spacing between parallel edge channels
const PAD = 12; // clearance kept between a pathway and a node it isn't attached to
const LANE_GAP = 40; // gap below the span before a back-edge's return lane
const LANE_STEP = 26; // vertical spacing between stacked back-edge lanes
const isHoriz = (p: Port) => p === "left" || p === "right";

function portPoint(node: FlowNode, side: Port, idx: number, cnt: number, sizes: Map<string, Size>): Pt {
  const s = sizeOf(node.id, sizes);
  const frac = (idx + 1) / (cnt + 1);
  switch (side) {
    case "right":
      return { x: node.x + s.w, y: node.y + s.h * frac };
    case "left":
      return { x: node.x, y: node.y + s.h * frac };
    case "top":
      return { x: node.x + s.w * frac, y: node.y };
    case "bottom":
      return { x: node.x + s.w * frac, y: node.y + s.h };
  }
}

function stub(pt: Pt, side: Port): Pt {
  switch (side) {
    case "right":
      return { x: pt.x + STUB, y: pt.y };
    case "left":
      return { x: pt.x - STUB, y: pt.y };
    case "top":
      return { x: pt.x, y: pt.y - STUB };
    case "bottom":
      return { x: pt.x, y: pt.y + STUB };
  }
}

/** True if an axis-aligned segment passes within `pad` of any box not in `skip`. */
function segHitsBoxes(a: Pt, b: Pt, boxes: Box[], skip: Set<string>, pad: number): boolean {
  const minx = Math.min(a.x, b.x) - pad;
  const maxx = Math.max(a.x, b.x) + pad;
  const miny = Math.min(a.y, b.y) - pad;
  const maxy = Math.max(a.y, b.y) + pad;
  for (const box of boxes) {
    if (skip.has(box.id)) continue;
    if (maxx < box.x || minx > box.x + box.w || maxy < box.y || miny > box.y + box.h) continue;
    return true;
  }
  return false;
}

function polyClear(pts: Pt[], boxes: Box[], skip: Set<string>, pad: number): boolean {
  for (let i = 1; i < pts.length; i++) {
    if (segHitsBoxes(pts[i - 1], pts[i], boxes, skip, pad)) return false;
  }
  return true;
}

/** Orthogonal route between two ports that tries to avoid crossing other nodes. */
function route(st: Pt, en: Pt, fp: Port, tp: Port, stagger: number, boxes: Box[], skip: Set<string>): Pt[] {
  const s = stub(st, fp);
  const e = stub(en, tp);
  const fH = isHoriz(fp);
  const tH = isHoriz(tp);

  if (fH && tH) {
    const base = (s.x + e.x) / 2;
    // Try the staggered midpoint first, then channels near the target/source, then wider offsets.
    const tries = [base + stagger, base, e.x - 46, s.x + 46, base + 40, base - 40, e.x - 92, s.x + 92, base + 84, base - 84, base + 140, base - 140];
    for (const mx of tries) {
      const pts = simplify([st, s, { x: mx, y: s.y }, { x: mx, y: e.y }, e, en]);
      if (polyClear(pts, boxes, skip, PAD)) return pts;
    }
    // Same-row escape: source and target sit at close y, and every mid-x channel above still
    // draws the leg from s→(mx, s.y) or (mx, e.y)→e straight through an obstacle sitting at
    // that y. Detour up or down past the highest/lowest obstacle in the horizontal span, then
    // come back — the vertical analog of the same-column jog below.
    if (Math.abs(s.y - e.y) < 40) {
      const jogs = [60, -60, 90, -90, 130, -130, 180, -180];
      for (const dy of jogs) {
        for (const t of [0.35, 0.5, 0.65]) {
          const mx = s.x + (e.x - s.x) * t;
          const pts = simplify([st, s, { x: mx, y: s.y }, { x: mx, y: s.y + dy }, { x: mx, y: e.y + dy }, { x: mx, y: e.y }, e, en]);
          if (polyClear(pts, boxes, skip, PAD)) return pts;
        }
      }
    }
    // Corridor fallback: thread the long run through a clear horizontal lane between rows.
    const corridor = threadCorridor(st, s, e, en, "h", boxes, skip);
    if (corridor) return corridor;
    return simplify([st, s, { x: base + stagger, y: s.y }, { x: base + stagger, y: e.y }, e, en]);
  }

  if (!fH && !tH) {
    const base = (s.y + e.y) / 2;
    // Parity with the horizontal case — same set of channel offsets, so tall stacks get the same
    // rescue attempts as wide ones before falling back to the corridor threader.
    const tries = [base + stagger, base, e.y - 46, s.y + 46, base + 40, base - 40, e.y - 92, s.y + 92, base + 84, base - 84, base + 140, base - 140];
    for (const my of tries) {
      const pts = simplify([st, s, { x: s.x, y: my }, { x: e.x, y: my }, e, en]);
      if (polyClear(pts, boxes, skip, PAD)) return pts;
    }
    // Extra: when source and target sit on the same column (or nearly so), every "channel" above
    // collapses to a single straight vertical — nothing dodges. Try jogging one leg sideways so
    // the pathway steps around obstacles between them.
    if (Math.abs(s.x - e.x) < 40) {
      const jogs = [60, -60, 90, -90, 130, -130, 180, -180];
      for (const dx of jogs) {
        for (const t of [0.35, 0.5, 0.65]) {
          const my = s.y + (e.y - s.y) * t;
          const pts = simplify([st, s, { x: s.x, y: my }, { x: s.x + dx, y: my }, { x: e.x + dx, y: my }, { x: e.x, y: my }, e, en]);
          if (polyClear(pts, boxes, skip, PAD)) return pts;
        }
      }
    }
    const corridor = threadCorridor(st, s, e, en, "v", boxes, skip);
    if (corridor) return corridor;
    return simplify([st, s, { x: s.x, y: base + stagger }, { x: e.x, y: base + stagger }, e, en]);
  }

  // Mixed (one horizontal, one vertical): two L-shaped options; pick the clear one. If
  // neither clears, add a Z-detour on the perpendicular axis before giving up — packed
  // hubs often need one extra bend to sidestep a node that both L-shapes clip.
  const optA = simplify([st, s, { x: e.x, y: s.y }, e, en]);
  const optB = simplify([st, s, { x: s.x, y: e.y }, e, en]);
  if (polyClear(optA, boxes, skip, PAD)) return optA;
  if (polyClear(optB, boxes, skip, PAD)) return optB;
  const midX = (s.x + e.x) / 2;
  const midY = (s.y + e.y) / 2;
  const zTries = fH
    ? [
        [midX, s.y, midX, e.y],
        [midX + 60, s.y, midX + 60, e.y],
        [midX - 60, s.y, midX - 60, e.y],
      ]
    : [
        [s.x, midY, e.x, midY],
        [s.x, midY + 60, e.x, midY + 60],
        [s.x, midY - 60, e.x, midY - 60],
      ];
  for (const [ax, ay, bx, by] of zTries) {
    const pts = simplify([st, s, { x: ax, y: ay }, { x: bx, y: by }, e, en]);
    if (polyClear(pts, boxes, skip, PAD)) return pts;
  }
  return optA;
}

/**
 * 3-bend route that threads the long run through a clear lane between node rows/columns.
 * For "h" flow: exit near the source, jump to a clear horizontal lane, cross, drop into the target.
 * Scans candidate lanes outward from the midpoint and returns the first fully-clear route.
 */
function threadCorridor(st: Pt, s: Pt, e: Pt, en: Pt, axis: "h" | "v", boxes: Box[], skip: Set<string>): Pt[] | null {
  const OFF = 34;
  // Shift the two turn verticals/horizontals to find a clear lane in packed hubs.
  const shifts = [0, 40, 80, 140];
  if (axis === "h") {
    if (Math.abs(e.x - s.x) < OFF * 2 + 8) return null;
    const dir = e.x >= s.x ? 1 : -1;
    const mid = (s.y + e.y) / 2;
    for (let d = 0; d <= 700; d += 22) {
      for (const y of d === 0 ? [mid] : [mid + d, mid - d]) {
        for (const sh of shifts) {
          const x1 = s.x + dir * (OFF + sh);
          const x2 = e.x - dir * (OFF + sh);
          if (dir > 0 ? x1 >= x2 : x1 <= x2) continue;
          const pts = simplify([st, s, { x: x1, y: s.y }, { x: x1, y }, { x: x2, y }, { x: x2, y: e.y }, e, en]);
          if (polyClear(pts, boxes, skip, PAD)) return pts;
        }
      }
    }
    return null;
  }
  if (Math.abs(e.y - s.y) < OFF * 2 + 8) return null;
  const dir = e.y >= s.y ? 1 : -1;
  const mid = (s.x + e.x) / 2;
  for (let d = 0; d <= 700; d += 22) {
    for (const x of d === 0 ? [mid] : [mid + d, mid - d]) {
      for (const sh of shifts) {
        const y1 = s.y + dir * (OFF + sh);
        const y2 = e.y - dir * (OFF + sh);
        if (dir > 0 ? y1 >= y2 : y1 <= y2) continue;
        const pts = simplify([st, s, { x: s.x, y: y1 }, { x, y: y1 }, { x, y: y2 }, { x: e.x, y: y2 }, e, en]);
        if (polyClear(pts, boxes, skip, PAD)) return pts;
      }
    }
  }
  return null;
}

function pathLen(pts: Pt[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return l;
}

/**
 * When a pathway is forced across a node by a bad exit side, retry every port-side combination
 * and keep the shortest route that's actually clear. This fixes the common "wrong side" cut
 * far more reliably than nudging channels. Returns null if no combination clears.
 */
const SIDES: Port[] = ["right", "left", "top", "bottom"];
function tryAltPorts(fn: FlowNode, tn: FlowNode, boxes: Box[], skip: Set<string>, sizes: Map<string, Size>): Pt[] | null {
  let best: Pt[] | null = null;
  let bestLen = Infinity;
  // Two passes: prefer routes with a full PAD clearance, but fall back to a tighter 6px pass
  // for packed hubs where no port pair clears 12px. Tighter routes still avoid interior
  // collisions — they just hug edges — which is far better than piercing a node.
  for (const pad of [PAD, 6]) {
    for (const fpx of SIDES) {
      for (const tpx of SIDES) {
        const st2 = portPoint(fn, fpx, 0, 1, sizes);
        const en2 = portPoint(tn, tpx, 0, 1, sizes);
        const p = route(st2, en2, fpx, tpx, 0, boxes, skip);
        if (polyClear(p, boxes, skip, pad)) {
          const l = pathLen(p);
          if (l < bestLen) {
            bestLen = l;
            best = p;
          }
        }
      }
    }
    if (best) return best;
  }
  return best;
}

/** Loop a back-edge under everything in its span: down, across a clear lane, up into the target. */
function routeLoopUnder(st: Pt, en: Pt, boxes: Box[], skip: Set<string>, laneIndex: number): Pt[] {
  const minX = Math.min(st.x, en.x);
  const maxX = Math.max(st.x, en.x);
  let maxBottom = Math.max(st.y, en.y);
  for (const box of boxes) {
    if (skip.has(box.id)) continue;
    if (box.x + box.w < minX || box.x > maxX) continue; // only nodes within the horizontal span
    maxBottom = Math.max(maxBottom, box.y + box.h);
  }
  const laneY = maxBottom + LANE_GAP + laneIndex * LANE_STEP;
  // Base route: straight down, across, straight up.
  const base = simplify([st, { x: st.x, y: laneY }, { x: en.x, y: laneY }, en]);
  if (polyClear(base, boxes, skip, PAD)) return base;
  // A node sits directly below the source or target port — jog each vertical outward until
  // a clear column is found, then meet the lane. Without this the pathway punches through
  // whatever obstacle happens to sit under either endpoint.
  const findClearX = (from: Pt): number => {
    for (const dx of [0, 24, -24, 48, -48, 80, -80, 120, -120, 180, -180]) {
      const x = from.x + dx;
      if (!segHitsBoxes({ x, y: from.y }, { x, y: laneY }, boxes, skip, PAD)) return x;
    }
    return from.x;
  };
  const sx = findClearX(st);
  const ex = findClearX(en);
  const jogged = simplify([
    st,
    { x: sx, y: st.y },
    { x: sx, y: laneY },
    { x: ex, y: laneY },
    { x: ex, y: en.y },
    en,
  ]);
  return jogged;
}

/**
 * Obstacle-avoiding orthogonal router (grid A*), used only for pathways the cheap router
 * can't keep off a node. Builds a sparse "Hanan" grid from node edges + clearance, then
 * searches shortest bend-penalised path from the source stub to the target stub. Returns
 * null if no clear route exists (caller falls back to the cheap route — nothing breaks).
 */
function routeAStar(st: Pt, en: Pt, fp: Port, tp: Port, boxes: Box[]): Pt[] | null {
  const CL = 9; // clearance kept from every node (small enough to thread packed hubs)
  const BEND = 45; // penalty per corner (prefers straighter routes)
  const s2 = stub(st, fp);
  const e2 = stub(en, tp);
  const obs = boxes.map((b) => ({ x: b.x - CL, y: b.y - CL, r: b.x + b.w + CL, bo: b.y + b.h + CL }));

  const xset = new Set<number>();
  const yset = new Set<number>();
  for (const o of obs) {
    xset.add(o.x);
    xset.add(o.r);
    yset.add(o.y);
    yset.add(o.bo);
  }
  xset.add(s2.x);
  xset.add(e2.x);
  yset.add(s2.y);
  yset.add(e2.y);
  const xs = [...xset].sort((a, b) => a - b);
  const ys = [...yset].sort((a, b) => a - b);
  const X = xs.length;
  const Y = ys.length;
  if (X * Y > 120000) return null; // safety cap for very large graphs

  const xIndex = new Map(xs.map((v, i) => [v, i]));
  const yIndex = new Map(ys.map((v, i) => [v, i]));
  const sIx = xIndex.get(s2.x)!;
  const sIy = yIndex.get(s2.y)!;
  const gIx = xIndex.get(e2.x)!;
  const gIy = yIndex.get(e2.y)!;

  const segClear = (ax: number, ay: number, bx: number, by: number): boolean => {
    const minx = Math.min(ax, bx);
    const maxx = Math.max(ax, bx);
    const miny = Math.min(ay, by);
    const maxy = Math.max(ay, by);
    for (const o of obs) {
      if (maxx <= o.x || minx >= o.r || maxy <= o.y || miny >= o.bo) continue;
      return false;
    }
    return true;
  };

  const H = (ix: number, iy: number) => Math.abs(xs[ix] - e2.x) + Math.abs(ys[iy] - e2.y);
  const key = (ix: number, iy: number, dir: number) => (iy * X + ix) * 5 + dir;
  const gScore = new Map<number, number>();
  const came = new Map<number, { ix: number; iy: number; dir: number }>();
  const heap = new MinHeap();
  gScore.set(key(sIx, sIy, 4), 0);
  heap.push(H(sIx, sIy), { ix: sIx, iy: sIy, dir: 4 });
  const steps = [
    [1, 0, 0],
    [-1, 0, 1],
    [0, 1, 2],
    [0, -1, 3],
  ];

  while (heap.size) {
    const cur = heap.pop()!.v;
    const cg = gScore.get(key(cur.ix, cur.iy, cur.dir))!;
    if (cur.ix === gIx && cur.iy === gIy) {
      const pts: Pt[] = [];
      let node: { ix: number; iy: number; dir: number } | undefined = cur;
      while (node) {
        pts.push({ x: xs[node.ix], y: ys[node.iy] });
        node = came.get(key(node.ix, node.iy, node.dir));
      }
      pts.reverse();
      return simplify([st, ...pts, en]);
    }
    for (const [ddx, ddy, dir] of steps) {
      const nix = cur.ix + ddx;
      const niy = cur.iy + ddy;
      if (nix < 0 || nix >= X || niy < 0 || niy >= Y) continue;
      if (!segClear(xs[cur.ix], ys[cur.iy], xs[nix], ys[niy])) continue;
      const len = Math.abs(xs[nix] - xs[cur.ix]) + Math.abs(ys[niy] - ys[cur.iy]);
      const bend = cur.dir !== 4 && cur.dir !== dir ? BEND : 0;
      const ng = cg + len + bend;
      const nk = key(nix, niy, dir);
      if (ng < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, ng);
        came.set(nk, cur);
        heap.push(ng + H(nix, niy), { ix: nix, iy: niy, dir });
      }
    }
  }
  return null;
}

/** Minimal binary min-heap for A*. */
class MinHeap {
  private a: { p: number; v: { ix: number; iy: number; dir: number } }[] = [];
  get size() {
    return this.a.length;
  }
  push(p: number, v: { ix: number; iy: number; dir: number }) {
    this.a.push({ p, v });
    let i = this.a.length - 1;
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (this.a[par].p <= this.a[i].p) break;
      [this.a[par], this.a[i]] = [this.a[i], this.a[par]];
      i = par;
    }
  }
  pop() {
    const top = this.a[0];
    const last = this.a.pop()!;
    if (this.a.length) {
      this.a[0] = last;
      let i = 0;
      const n = this.a.length;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let m = i;
        if (l < n && this.a[l].p < this.a[m].p) m = l;
        if (r < n && this.a[r].p < this.a[m].p) m = r;
        if (m === i) break;
        [this.a[m], this.a[i]] = [this.a[i], this.a[m]];
        i = m;
      }
    }
    return top;
  }
}

function simplify(raw: Pt[]): Pt[] {
  const clean: Pt[] = [];
  for (const p of raw) {
    const q = clean[clean.length - 1];
    if (!q || Math.abs(p.x - q.x) > 0.5 || Math.abs(p.y - q.y) > 0.5) clean.push(p);
  }
  const out: Pt[] = [];
  for (let i = 0; i < clean.length; i++) {
    if (i > 0 && i < clean.length - 1) {
      const a = clean[i - 1];
      const b = clean[i];
      const c = clean[i + 1];
      const collinear =
        (Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - c.x) < 0.5) ||
        (Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - c.y) < 0.5);
      if (collinear) continue;
    }
    out.push(clean[i]);
  }
  return out;
}

function roundedPath(pts: Pt[], r: number): string {
  if (pts.length < 2) return "";
  if (pts.length === 2) return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`;
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const p = pts[i];
    const next = pts[i + 1];
    const d1 = Math.min(r, Math.hypot(prev.x - p.x, prev.y - p.y) / 2);
    const d2 = Math.min(r, Math.hypot(next.x - p.x, next.y - p.y) / 2);
    const u1 = unit(p, prev);
    const u2 = unit(p, next);
    const a = { x: p.x + u1.x * d1, y: p.y + u1.y * d1 };
    const b = { x: p.x + u2.x * d2, y: p.y + u2.y * d2 };
    d += ` L${a.x},${a.y} Q${p.x},${p.y} ${b.x},${b.y}`;
  }
  const last = pts[pts.length - 1];
  d += ` L${last.x},${last.y}`;
  return d;
}

function unit(from: Pt, to: Pt): Pt {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

function midpointOf(pts: Pt[]): Pt {
  const segs: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    segs.push(l);
    total += l;
  }
  let half = total / 2;
  for (let i = 1; i < pts.length; i++) {
    const l = segs[i - 1];
    if (half <= l) {
      const t = l === 0 ? 0 : half / l;
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
    }
    half -= l;
  }
  return pts[Math.floor(pts.length / 2)];
}

interface Routed {
  c: FlowConnection;
  fn: FlowNode;
  tn: FlowNode;
  fp: Port;
  tp: Port;
  reverse: boolean;
  fromIdx: number;
  fromCnt: number;
  toIdx: number;
  toCnt: number;
  laneIndex: number;
}

export default function Connections({
  nodes,
  connections,
  sizes,
  selectedId,
  onSelect,
  onContextMenu,
  onEditLabel,
  ghost,
}: Props) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  // Obstacle footprints for routing. Decision nodes are diamonds — only their centre is solid,
  // so we inset their box and let pathways use the empty corner triangles (this is where most
  // "collisions" near decisions actually were: empty space).
  const boxes: Box[] = nodes.map((n) => {
    const s = sizeOf(n.id, sizes);
    const inset = n.type === "decision" ? Math.min(s.w, s.h) * 0.22 : 0;
    return { id: n.id, x: n.x + inset, y: n.y + inset, w: s.w - inset * 2, h: s.h - inset * 2 };
  });
  const centerOf = (n: FlowNode) => {
    const s = sizeOf(n.id, sizes);
    return { x: n.x + s.w / 2, y: n.y + s.h / 2 };
  };

  // 1) Resolve ports and detect back-edges (routed under the layout).
  const routed: Routed[] = [];
  for (const c of connections) {
    const fn = byId.get(c.from);
    const tn = byId.get(c.to);
    if (!fn || !tn || c.from === c.to) continue;
    const auto = bestPorts(fn, tn, sizes);
    let fp = c.fromPort || auto.fp;
    let tp = c.toPort || auto.tp;
    const fc = centerOf(fn);
    const tc = centerOf(tn);
    // A back-edge flows against the layout direction. Send those under, both ends on the bottom.
    const horiz = isHoriz(fp) && isHoriz(tp);
    const vert = !isHoriz(fp) && !isHoriz(tp);
    const reverse = (horiz && tc.x < fc.x - 8) || (vert && tc.y < fc.y - 8);
    if (reverse) {
      fp = "bottom";
      tp = "bottom";
    }
    routed.push({ c, fn, tn, fp, tp, reverse, fromIdx: 0, fromCnt: 1, toIdx: 0, toCnt: 1, laneIndex: 0 });
  }

  // 2) Fan out edges sharing a node side; order by where the far end sits so they don't cross.
  const groups = new Map<string, { r: Routed; role: "from" | "to" }[]>();
  const add = (k: string, v: { r: Routed; role: "from" | "to" }) => {
    const arr = groups.get(k);
    if (arr) arr.push(v);
    else groups.set(k, [v]);
  };
  routed.forEach((r) => {
    add(`${r.c.from}|${r.fp}`, { r, role: "from" });
    add(`${r.c.to}|${r.tp}`, { r, role: "to" });
  });
  const farPerp = (m: { r: Routed; role: "from" | "to" }): number => {
    const side = m.role === "from" ? m.r.fp : m.r.tp;
    const far = m.role === "from" ? m.r.tn : m.r.fn;
    const s = sizeOf(far.id, sizes);
    return isHoriz(side) ? far.y + s.h / 2 : far.x + s.w / 2;
  };
  for (const arr of groups.values()) {
    arr.sort((a, b) => farPerp(a) - farPerp(b));
    arr.forEach((m, i) => {
      if (m.role === "from") {
        m.r.fromIdx = i;
        m.r.fromCnt = arr.length;
      } else {
        m.r.toIdx = i;
        m.r.toCnt = arr.length;
      }
    });
  }

  // 3) Assign stacked return-lane indices to back-edges (widest span sits lowest).
  const backEdges = routed.filter((r) => r.reverse);
  backEdges.sort((a, b) => {
    const sa = Math.abs(centerOf(a.fn).x - centerOf(a.tn).x);
    const sb = Math.abs(centerOf(b.fn).x - centerOf(b.tn).x);
    return sb - sa;
  });
  backEdges.forEach((r, i) => (r.laneIndex = i));

  // Size the SVG viewport to the actual world extent, plus margin big enough to hold
  // back-edge return lanes (which drop LANE_GAP + n*LANE_STEP below the lowest node)
  // and any threading-corridor lanes that swing sideways. A fixed rectangle was clipping
  // pathways once flows grew past its edges — this scales with the graph, and shifts left
  // with `viewBox`/CSS offset so negative world coordinates render too.
  const bounds = computeBounds(nodes, sizes);
  const backLaneReach = backEdges.length > 0 ? LANE_GAP + backEdges.length * LANE_STEP + 60 : 0;
  const MARGIN = Math.max(600, backLaneReach, connections.length * 4);
  const vbX = bounds ? bounds.minX - MARGIN : 0;
  const vbY = bounds ? bounds.minY - MARGIN : 0;
  const vbW = bounds ? bounds.w + MARGIN * 2 : 12000;
  const vbH = bounds ? bounds.h + MARGIN * 2 + backLaneReach : 12000;

  return (
    <svg
      width={vbW}
      height={vbH}
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      className="absolute pointer-events-none z-[5]"
      style={{ left: vbX, top: vbY }}
    >
      <defs>
        {["", "cyes", "cno", "camber", "sel"].map((t) => (
          <marker key={`std-${t}`} id={`arrow${t ? "-" + t : ""}`} markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto">
            <polygon points="0,0 8,4 0,8" className={t === "sel" ? "fill-emerald-500" : FILL[t]} />
          </marker>
        ))}
        {["", "cyes", "cno", "camber", "sel"].map((t) => (
          <marker key={`bold-${t}`} id={`arrow-bold${t ? "-" + t : ""}`} markerWidth="11" markerHeight="11" refX="8" refY="4.5" orient="auto">
            <polygon points="0,0 9,4.5 0,9" className={t === "sel" ? "fill-emerald-500" : FILL[t]} />
          </marker>
        ))}
      </defs>

      {routed.map((r) => {
        const { c, fn, tn, fp, tp, fromIdx, fromCnt, toIdx, toCnt, reverse, laneIndex } = r;
        const st = portPoint(fn, fp, fromIdx, fromCnt, sizes);
        const en = portPoint(tn, tp, toIdx, toCnt, sizes);
        const skip = new Set([fn.id, tn.id]);
        const stagger = (fromIdx - (fromCnt - 1) / 2) * CHANNEL_STEP;
        let pts = reverse ? routeLoopUnder(st, en, boxes, skip, laneIndex) : route(st, en, fp, tp, stagger, boxes, skip);
        // If the pathway still crosses a node, try to clear it — first by picking a better
        // exit/entry side, then by the obstacle-avoiding router. Nothing is applied unless
        // it's actually clear, so a good edge is never made worse. Back-edges get the same
        // rescue as forward edges: their under-loop can also punch through nodes stacked in
        // the vertical drop zone.
        if (!polyClear(pts, boxes, skip, PAD)) {
          const alt = tryAltPorts(fn, tn, boxes, skip, sizes);
          if (alt) {
            pts = alt;
          } else {
            const astar = routeAStar(st, en, fp, tp, boxes);
            if (astar && polyClear(astar, boxes, skip, 6)) {
              const straight = Math.hypot(en.x - st.x, en.y - st.y) || 1;
              // Give back-edges a looser length budget — a legitimate loop-under can be much
              // longer than the straight-line distance between its endpoints.
              const budget = reverse ? 6 : 2.6;
              if (pathLen(astar) <= straight * budget) pts = astar;
            }
          }
        }
        const d = roundedPath(pts, CORNER);
        const mid = midpointOf(pts);
        const id = connId(c);
        const selected = selectedId === id;
        const isBold = Boolean(c.bold);

        return (
          <g key={id}>
            {isBold && (
              <path d={d} className="fill-none stroke-emerald-400/20 dark:stroke-emerald-400/25" strokeWidth={selected ? 8 : 7} strokeLinejoin="round" strokeLinecap="round" style={{ pointerEvents: "none" }} />
            )}

            <path
              d={d}
              className={`fill-none ${selected ? "stroke-emerald-500" : STROKE[c.type]}`}
              strokeWidth={selected ? (isBold ? 4.5 : 3) : isBold ? 3.5 : 1.75}
              strokeLinejoin="round"
              strokeLinecap="round"
              markerEnd={`url(#arrow${isBold ? "-bold" : ""}${selected ? "-sel" : c.type ? "-" + c.type : ""})`}
              style={{ pointerEvents: "none" }}
            />

            <path
              d={d}
              fill="none"
              stroke="transparent"
              strokeWidth={16}
              style={{ pointerEvents: "stroke", cursor: "pointer" }}
              onMouseDown={(e) => {
                e.stopPropagation();
                onSelect(id);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onEditLabel(id);
              }}
              onContextMenu={(e) => onContextMenu(e, id)}
            />

            {c.label && (
              <g style={{ pointerEvents: "none" }}>
                <rect
                  x={mid.x - c.label.length * (isBold ? 3.8 : 3.3) - 7}
                  y={mid.y - (isBold ? 18 : 16)}
                  width={c.label.length * (isBold ? 7.6 : 6.6) + 14}
                  height={isBold ? 18 : 15}
                  rx={5}
                  className={`fill-white/95 dark:fill-zinc-900/95 stroke-zinc-200 dark:stroke-zinc-700 ${isBold ? "stroke-[1.5px]" : "stroke-[0.5px]"}`}
                />
                <text x={mid.x} y={mid.y - 4.5} textAnchor="middle" className={`${isBold ? "text-[11px] font-extrabold" : "text-[10px] font-bold"} ${TEXT_FILL[c.type]}`}>
                  {c.label}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {ghost && (
        <path
          d={`M${ghost.x1},${ghost.y1} C${ghost.x1},${ghost.y1 + 40} ${ghost.x2},${ghost.y2 - 40} ${ghost.x2},${ghost.y2}`}
          className="fill-none stroke-emerald-400"
          strokeWidth={2}
          strokeDasharray="5 4"
          markerEnd="url(#arrow-sel)"
        />
      )}
    </svg>
  );
}
