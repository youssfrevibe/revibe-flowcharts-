/**
 * Pathway routing engine.
 *
 * Everything geometric about a connection lives here: which sides it leaves and enters, the
 * orthogonal path it takes, how back-edges are grouped into non-crossing return lanes, how
 * manual waypoints override the automatic route, and where the label sits.
 *
 * It is deliberately free of React so the on-screen canvas (`Connections.tsx`) and the
 * SVG/PNG export (`export-svg.ts`) can share one implementation — the export used to draw
 * loose bezier curves while the screen drew orthogonal routes, so what you saw was never
 * what you exported. Being pure also makes it memoizable, which matters: routing runs for
 * every edge on every drag frame.
 */

import { FlowConnection, FlowNode, Port, Pt } from "./types";
import { Size, sizeOf, bestPorts } from "./graph";
import { connId } from "./ops";
import { measureText, LABEL_FONT, LABEL_FONT_BOLD } from "./text-measure";

export type { Pt };
export type Box = { id: string; x: number; y: number; w: number; h: number };

export const STUB = 18; // fixed exit/entry length off a port
export const CORNER = 12; // rounded-corner radius
export const CHANNEL_STEP = 16; // spacing between parallel edge channels
export const PAD = 12; // clearance kept between a pathway and a node it isn't attached to
export const LANE_GAP = 44; // gap past the span before a back-edge's return lane
export const LANE_STEP = 26; // spacing between stacked back-edge lanes
export const SPLIT = 3.5; // perpendicular offset used to split two overlapping pathways

export const isHoriz = (p: Port) => p === "left" || p === "right";

/* ------------------------------------------------------------------ *
 * Basic geometry
 * ------------------------------------------------------------------ */

/** Where a pathway attaches on a node side. `idx`/`cnt` fan several edges across the side. */
export function portPoint(node: FlowNode, side: Port, idx: number, cnt: number, sizes: Map<string, Size>): Pt {
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

export function stub(pt: Pt, side: Port): Pt {
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
export function segHitsBoxes(a: Pt, b: Pt, boxes: Box[], skip: Set<string>, pad: number): boolean {
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

export function polyClear(pts: Pt[], boxes: Box[], skip: Set<string>, pad: number): boolean {
  for (let i = 1; i < pts.length; i++) {
    if (segHitsBoxes(pts[i - 1], pts[i], boxes, skip, pad)) return false;
  }
  return true;
}

export function pathLen(pts: Pt[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return l;
}

/** Drops duplicate and collinear points so the path has one vertex per actual corner. */
export function simplify(raw: Pt[]): Pt[] {
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

export function roundedPath(pts: Pt[], r: number): string {
  if (pts.length < 2) return "";
  if (pts.length === 2) return `M${round(pts[0].x)},${round(pts[0].y)} L${round(pts[1].x)},${round(pts[1].y)}`;
  let d = `M${round(pts[0].x)},${round(pts[0].y)}`;
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
    d += ` L${round(a.x)},${round(a.y)} Q${round(p.x)},${round(p.y)} ${round(b.x)},${round(b.y)}`;
  }
  const last = pts[pts.length - 1];
  d += ` L${round(last.x)},${round(last.y)}`;
  return d;
}

const round = (v: number) => Math.round(v * 100) / 100;

function unit(from: Pt, to: Pt): Pt {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/** Point a fraction `t` (0–1) along the polyline, measured by arc length. */
export function pointAt(pts: Pt[], t: number): Pt {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1) return pts[0];
  const segs: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    segs.push(l);
    total += l;
  }
  if (total === 0) return pts[0];
  let want = total * Math.max(0, Math.min(1, t));
  for (let i = 1; i < pts.length; i++) {
    const l = segs[i - 1];
    if (want <= l) {
      const f = l === 0 ? 0 : want / l;
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f };
    }
    want -= l;
  }
  return pts[pts.length - 1];
}

export const midpointOf = (pts: Pt[]) => pointAt(pts, 0.5);

/* ------------------------------------------------------------------ *
 * Automatic routing
 * ------------------------------------------------------------------ */

/** Orthogonal route between two ports that tries to avoid crossing other nodes. */
export function route(st: Pt, en: Pt, fp: Port, tp: Port, stagger: number, boxes: Box[], skip: Set<string>): Pt[] {
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
    // that y. Detour up or down past the obstacles in the horizontal span, then come back —
    // the vertical analog of the same-column jog below.
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
    const tries = [base + stagger, base, e.y - 46, s.y + 46, base + 40, base - 40, e.y - 92, s.y + 92, base + 84, base - 84, base + 140, base - 140];
    for (const my of tries) {
      const pts = simplify([st, s, { x: s.x, y: my }, { x: e.x, y: my }, e, en]);
      if (polyClear(pts, boxes, skip, PAD)) return pts;
    }
    // When source and target sit on the same column, every "channel" above collapses to one
    // straight vertical — nothing dodges. Jog a leg sideways so the pathway steps around.
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
 * Scans candidate lanes outward from the midpoint and returns the first fully-clear route.
 */
function threadCorridor(st: Pt, s: Pt, e: Pt, en: Pt, axis: "h" | "v", boxes: Box[], skip: Set<string>): Pt[] | null {
  const OFF = 34;
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

/**
 * When a pathway is forced across a node by a bad exit side, retry every port-side combination
 * and keep the shortest route that's actually clear. Sides the author pinned by hand (or by
 * dragging from a specific port) are held fixed — silently moving a pathway to the other side
 * of a node the moment it can't find a clear route was itself a source of "why did my arrow
 * jump?". Returns null if no combination clears.
 */
const SIDES: Port[] = ["right", "left", "top", "bottom"];
export function tryAltPorts(
  fn: FlowNode,
  tn: FlowNode,
  boxes: Box[],
  skip: Set<string>,
  sizes: Map<string, Size>,
  pinFrom?: Port,
  pinTo?: Port
): Pt[] | null {
  let best: Pt[] | null = null;
  let bestLen = Infinity;
  const fromSides = pinFrom ? [pinFrom] : SIDES;
  const toSides = pinTo ? [pinTo] : SIDES;
  // Two passes: prefer routes with a full PAD clearance, but fall back to a tighter 6px pass
  // for packed hubs where no port pair clears 12px. Tighter routes still avoid interior
  // collisions — they just hug edges — which is far better than piercing a node.
  for (const pad of [PAD, 6]) {
    for (const fpx of fromSides) {
      for (const tpx of toSides) {
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

/**
 * Loop a backwards pathway UNDER everything in its span: down out of the source, across a
 * clear return lane, up into the target. `laneY` is assigned by the lane planner so edges in
 * the same cluster nest instead of crossing; if the planned lane is still blocked the route
 * steps down one lane at a time rather than punching through.
 */
export function routeLoopUnder(st: Pt, en: Pt, boxes: Box[], skip: Set<string>, laneY: number): Pt[] {
  const findClear = (from: Pt, ly: number): number => {
    for (const dx of [0, 26, -26, 52, -52, 84, -84, 124, -124, 180, -180]) {
      const x = from.x + dx;
      if (!segHitsBoxes({ x, y: from.y }, { x, y: ly }, boxes, skip, PAD)) return x;
    }
    return from.x;
  };
  let last: Pt[] = [];
  for (let bump = 0; bump < 8; bump++) {
    const ly = laneY + bump * LANE_STEP;
    const sx = findClear(st, ly);
    const ex = findClear(en, ly);
    last = simplify([st, { x: sx, y: st.y }, { x: sx, y: ly }, { x: ex, y: ly }, { x: ex, y: en.y }, en]);
    if (polyClear(last, boxes, skip, PAD)) return last;
  }
  return last;
}

/**
 * Loop a backwards pathway around the SIDE. Top-to-bottom flows have their back-edges running
 * upward; sending those "under" (the old behaviour, which forced both ends onto the bottom
 * port regardless of flow direction) drove the pathway down out of the source, back up past
 * it, and into the underside of a node sitting above — the tangle behind "bottom pathways are
 * messed up". Going around the side is the correct shape for a vertical flow.
 */
export function routeLoopSide(st: Pt, en: Pt, boxes: Box[], skip: Set<string>, laneX: number, dir: 1 | -1): Pt[] {
  const findClear = (from: Pt, lx: number): number => {
    for (const dy of [0, 26, -26, 52, -52, 84, -84, 124, -124, 180, -180]) {
      const y = from.y + dy;
      if (!segHitsBoxes({ x: from.x, y }, { x: lx, y }, boxes, skip, PAD)) return y;
    }
    return from.y;
  };
  let last: Pt[] = [];
  for (let bump = 0; bump < 8; bump++) {
    const lx = laneX + dir * bump * LANE_STEP;
    const sy = findClear(st, lx);
    const ey = findClear(en, lx);
    last = simplify([st, { x: st.x, y: sy }, { x: lx, y: sy }, { x: lx, y: ey }, { x: en.x, y: ey }, en]);
    if (polyClear(last, boxes, skip, PAD)) return last;
  }
  return last;
}

/**
 * Obstacle-avoiding orthogonal router (grid A*), used only for pathways the cheap router
 * can't keep off a node. Builds a sparse "Hanan" grid from node edges + clearance, then
 * searches shortest bend-penalised path from the source stub to the target stub. Returns
 * null if no clear route exists (caller falls back to the cheap route — nothing breaks).
 */
export function routeAStar(st: Pt, en: Pt, fp: Port, tp: Port, boxes: Box[]): Pt[] | null {
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

/* ------------------------------------------------------------------ *
 * Manual routes (waypoints)
 * ------------------------------------------------------------------ */

/**
 * Builds an orthogonal path from the source port, through every hand-placed waypoint, into
 * the target port. Consecutive points that don't already share an axis get one elbow; the
 * elbow flips orientation relative to the previous segment so the pathway keeps stepping
 * instead of doubling back on itself.
 */
export function routeThroughWaypoints(st: Pt, en: Pt, fp: Port, tp: Port, waypoints: Pt[]): Pt[] {
  const s = stub(st, fp);
  const e = stub(en, tp);
  const nodes: Pt[] = [s, ...waypoints, e];
  const out: Pt[] = [st, s];
  // Whether the pathway is currently travelling horizontally. The stub always leaves
  // perpendicular to its side, so this starts out matching the source port's axis.
  let horizontal = isHoriz(fp);

  for (let i = 1; i < nodes.length; i++) {
    const a = out[out.length - 1];
    const b = nodes[i];
    const alignedX = Math.abs(a.x - b.x) < 0.5;
    const alignedY = Math.abs(a.y - b.y) < 0.5;
    if (alignedX && alignedY) continue; // same point — nothing to draw
    if (alignedX || alignedY) {
      out.push(b);
      horizontal = alignedY; // sharing a y means this leg ran horizontally
      continue;
    }
    // Turn before running on: if the last leg was horizontal, go vertical out of it. Carrying
    // straight on and turning at the far end instead makes the pathway overshoot the waypoint
    // and double back on itself — a spike that then collapses when collinear points are merged.
    // The final hop is the exception: it has to arrive along the target port's own axis so the
    // arrowhead points into the node rather than sliding along its edge.
    const lastHop = i === nodes.length - 1;
    const elbowHorizFirst = lastHop ? !isHoriz(tp) : !horizontal;
    out.push(elbowHorizFirst ? { x: b.x, y: a.y } : { x: a.x, y: b.y });
    out.push(b);
    horizontal = !elbowHorizFirst;
  }
  out.push(en);
  return simplify(out);
}

/* ------------------------------------------------------------------ *
 * Back-edge lane planning
 * ------------------------------------------------------------------ */

interface LanePlan {
  laneY?: number;
  laneX?: number;
  dir?: 1 | -1;
}

/**
 * Groups backwards pathways into non-crossing return lanes.
 *
 * Two things used to go wrong and both showed up as tangled bottom pathways:
 *   1. Lane order was inverted — the widest span was handed lane 0, the lane closest to the
 *      nodes, so every narrower pathway had to cross it. Widest must sit furthest out so the
 *      lanes nest like brackets.
 *   2. Every edge computed its own baseline from whichever nodes happened to sit in its own
 *      span, so two overlapping back-edges could be assigned lanes measured from different
 *      floors and cross each other. Edges whose spans overlap now share one baseline.
 *
 * Edges whose spans don't overlap are independent, so they each start at lane 0 instead of
 * being pushed needlessly far from the diagram.
 */
function planLanes(
  items: { key: string; lo: number; hi: number; extent: number }[],
  boxes: Box[],
  axis: "y" | "x",
  sign: 1 | -1
): Map<string, { baseline: number; index: number }> {
  const out = new Map<string, { baseline: number; index: number }>();
  if (items.length === 0) return out;
  const outward = (v: number, w: number) => (sign > 0 ? Math.max(v, w) : Math.min(v, w));

  // Cluster by overlapping spans (sweep over span starts).
  const sorted = [...items].sort((a, b) => a.lo - b.lo);
  const clusters: (typeof sorted)[] = [];
  let cur: typeof sorted = [];
  let curHi = -Infinity;
  for (const it of sorted) {
    if (cur.length && it.lo > curHi) {
      clusters.push(cur);
      cur = [];
      curHi = -Infinity;
    }
    cur.push(it);
    curHi = Math.max(curHi, it.hi);
  }
  if (cur.length) clusters.push(cur);

  for (const cluster of clusters) {
    const lo = Math.min(...cluster.map((c) => c.lo));
    const hi = Math.max(...cluster.map((c) => c.hi));
    // Baseline = the far edge of every node the cluster passes, so no lane runs through one.
    let baseline = cluster.reduce((acc, c) => outward(acc, c.extent), cluster[0].extent);
    for (const box of boxes) {
      const bLo = axis === "y" ? box.x : box.y;
      const bHi = axis === "y" ? box.x + box.w : box.y + box.h;
      if (bHi < lo || bLo > hi) continue;
      const far = axis === "y" ? (sign > 0 ? box.y + box.h : box.y) : sign > 0 ? box.x + box.w : box.x;
      baseline = outward(baseline, far);
    }
    // Narrowest span hugs the diagram; widest swings out furthest so the lanes nest.
    const byWidth = [...cluster].sort((a, b) => a.hi - a.lo - (b.hi - b.lo));
    byWidth.forEach((c, i) => out.set(c.key, { baseline, index: i }));
  }
  return out;
}

/**
 * For a back-edge that has to loop around the outside, decides whether swinging right or
 * left is the shorter detour, by measuring how far the nodes sitting between the two ends
 * extend on each side.
 */
function cheaperSide(fn: FlowNode, tn: FlowNode, boxes: Box[], sizes: Map<string, Size>): 1 | -1 {
  const fs = sizeOf(fn.id, sizes);
  const ts = sizeOf(tn.id, sizes);
  const lo = Math.min(fn.y, tn.y);
  const hi = Math.max(fn.y + fs.h, tn.y + ts.h);
  const ownRight = Math.max(fn.x + fs.w, tn.x + ts.w);
  const ownLeft = Math.min(fn.x, tn.x);
  let maxRight = ownRight;
  let minLeft = ownLeft;
  for (const b of boxes) {
    if (b.y + b.h < lo || b.y > hi) continue;
    maxRight = Math.max(maxRight, b.x + b.w);
    minLeft = Math.min(minLeft, b.x);
  }
  return maxRight - ownRight <= ownLeft - minLeft ? 1 : -1;
}

/* ------------------------------------------------------------------ *
 * Edge-vs-edge separation
 * ------------------------------------------------------------------ */

/**
 * Nudges apart pathway segments that lie exactly on top of one another.
 *
 * The router only ever avoided node boxes, so two pathways sharing a channel drew as a
 * single line and the reader lost one of them entirely. This pass finds collinear,
 * overlapping segments belonging to different pathways and fans them a few pixels apart —
 * small enough that node clearance is unaffected, large enough to read as two lines.
 */
function separateOverlaps(routes: { id: string; pts: Pt[]; manual: boolean }[]): void {
  type Seg = { r: number; i: number; axis: "h" | "v"; at: number; lo: number; hi: number };
  const segs: Seg[] = [];
  routes.forEach((r, ri) => {
    if (r.manual) return; // hand-placed routes are the author's call — never move them
    for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1];
      const b = r.pts[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 26) continue; // ignore stubs and corner nubs
      if (Math.abs(a.y - b.y) < 0.5) segs.push({ r: ri, i, axis: "h", at: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x) });
      else if (Math.abs(a.x - b.x) < 0.5) segs.push({ r: ri, i, axis: "v", at: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y) });
    }
  });

  // Bucket by axis + rounded position so only plausibly-overlapping segments are compared.
  const buckets = new Map<string, Seg[]>();
  for (const s of segs) {
    const k = `${s.axis}:${Math.round(s.at / 4)}`;
    const arr = buckets.get(k);
    if (arr) arr.push(s);
    else buckets.set(k, [s]);
  }

  for (const arr of buckets.values()) {
    if (arr.length < 2) continue;
    // Group segments that actually overlap in range, then fan the group symmetrically.
    arr.sort((a, b) => a.lo - b.lo);
    let group: Seg[] = [];
    let groupHi = -Infinity;
    const flush = () => {
      const distinct = new Set(group.map((g) => g.r));
      if (group.length > 1 && distinct.size > 1) {
        // Stable order so the same pathway keeps the same side across renders.
        group.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r - b.r));
        const n = group.length;
        group.forEach((g, i) => {
          const off = (i - (n - 1) / 2) * SPLIT;
          if (off === 0) return;
          const pts = routes[g.r].pts;
          if (g.axis === "h") {
            pts[g.i - 1] = { ...pts[g.i - 1], y: pts[g.i - 1].y + off };
            pts[g.i] = { ...pts[g.i], y: pts[g.i].y + off };
          } else {
            pts[g.i - 1] = { ...pts[g.i - 1], x: pts[g.i - 1].x + off };
            pts[g.i] = { ...pts[g.i], x: pts[g.i].x + off };
          }
        });
      }
      group = [];
      groupHi = -Infinity;
    };
    for (const s of arr) {
      if (group.length && s.lo > groupHi - 24) flush();
      group.push(s);
      groupHi = Math.max(groupHi, s.hi);
    }
    flush();
  }
}

/* ------------------------------------------------------------------ *
 * Label placement
 * ------------------------------------------------------------------ */

export interface LabelBox {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

const LABEL_H = 17;
const LABEL_H_BOLD = 20;

/**
 * Places each label along its own pathway, sliding it away from the midpoint until it stops
 * covering a node or another label. Previously every label was pinned to the geometric
 * midpoint, so "Yes"/"No" pairs out of one decision landed on top of each other.
 */
function placeLabels(
  routes: { id: string; pts: Pt[]; label: string; bold: boolean; labelBox: LabelBox | null }[],
  boxes: Box[],
  fast = false
): void {
  const placed: LabelBox[] = [];
  const overlaps = (a: LabelBox, b: { x: number; y: number; w: number; h: number }) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  for (const r of routes) {
    if (!r.label) continue;
    const w = measureText(r.label, r.bold ? LABEL_FONT_BOLD : LABEL_FONT) + 16;
    const h = r.bold ? LABEL_H_BOLD : LABEL_H;
    let best: LabelBox | null = null;
    let bestScore = Infinity;
    // In draft mode every label just sits at its midpoint; the de-collision scan is
    // quadratic in the number of labels and gets redone the moment the drag ends.
    for (const t of fast ? [0.5] : [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82]) {
      const p = pointAt(r.pts, t);
      const cand: LabelBox = { x: p.x - w / 2, y: p.y - h - 3, w, h, cx: p.x, cy: p.y - h / 2 - 3 };
      let score = Math.abs(t - 0.5) * 40;
      for (const b of boxes) if (overlaps(cand, b)) score += 1000;
      for (const p2 of placed) if (overlaps(cand, p2)) score += 600;
      if (score < bestScore) {
        bestScore = score;
        best = cand;
      }
      if (score < 1) break;
    }
    if (best) {
      placed.push(best);
      r.labelBox = best;
    }
  }
}

/* ------------------------------------------------------------------ *
 * Orchestrator
 * ------------------------------------------------------------------ */

export interface RoutedEdge {
  id: string;
  conn: FlowConnection;
  from: FlowNode;
  to: FlowNode;
  fp: Port;
  tp: Port;
  /** Port attachment points, before any waypoints. */
  start: Pt;
  end: Pt;
  pts: Pt[];
  d: string;
  /** True when the author has pinned the route with waypoints. */
  manual: boolean;
  labelBox: LabelBox | null;
  label: string;
  bold: boolean;
}

/** Obstacle footprints used for routing. */
export function buildBoxes(nodes: FlowNode[], sizes: Map<string, Size>): Box[] {
  return nodes.map((n) => {
    const s = sizeOf(n.id, sizes);
    // Decision nodes are diamonds — only their centre is solid, so inset the box and let
    // pathways use the empty corner triangles.
    const inset = n.type === "decision" ? Math.min(s.w, s.h) * 0.22 : 0;
    return { id: n.id, x: n.x + inset, y: n.y + inset, w: s.w - inset * 2, h: s.h - inset * 2 };
  });
}

export interface RouteOptions {
  /**
   * Draft quality: skip the two expensive rescue passes (retrying every port pair, then an
   * A* search) and the label de-collision scan.
   *
   * Those passes are what make a finished diagram read well, but they also dominate the cost
   * of a solve, and during a drag the geometry is thrown away on the very next frame anyway.
   * Routing in draft while the pointer is down and re-solving properly on release keeps a
   * drag at frame rate on a large flow without any visible loss of quality once you let go.
   */
  fast?: boolean;
}

/**
 * Routes every connection in the document. Pure and deterministic for a given
 * (nodes, connections, sizes, opts) tuple, so callers can memoize on those.
 */
export function computeRoutes(
  nodes: FlowNode[],
  connections: FlowConnection[],
  sizes: Map<string, Size>,
  opts: RouteOptions = {}
): RoutedEdge[] {
  const fast = opts.fast === true;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const boxes = buildBoxes(nodes, sizes);
  const centerOf = (n: FlowNode) => {
    const s = sizeOf(n.id, sizes);
    return { x: n.x + s.w / 2, y: n.y + s.h / 2 };
  };

  interface Work {
    id: string;
    c: FlowConnection;
    fn: FlowNode;
    tn: FlowNode;
    fp: Port;
    tp: Port;
    pinFrom?: Port;
    pinTo?: Port;
    loop: "under" | "side" | null;
    manual: boolean;
    fromIdx: number;
    fromCnt: number;
    toIdx: number;
    toCnt: number;
  }

  // 1) Resolve ports and detect back-edges (routed around the layout).
  const work: Work[] = [];
  for (const c of connections) {
    const fn = byId.get(c.from);
    const tn = byId.get(c.to);
    if (!fn || !tn || c.from === c.to) continue;
    const auto = bestPorts(fn, tn, sizes);
    let fp = c.fromPort || auto.fp;
    let tp = c.toPort || auto.tp;
    const manual = Array.isArray(c.waypoints) && c.waypoints.length > 0;
    // A back-edge flows against the layout direction and needs to be looped clear of the
    // nodes between its ends. Only take that over when the author hasn't pinned the sides
    // themselves and hasn't drawn the route by hand — the old code overwrote an explicit
    // fromPort/toPort with bottom/bottom, so a pathway the author had deliberately placed
    // would silently jump to the underside of both nodes.
    let loop: "under" | "side" | null = null;
    if (!manual && !c.fromPort && !c.toPort) {
      const fc = centerOf(fn);
      const tc = centerOf(tn);
      if (isHoriz(fp) && isHoriz(tp) && tc.x < fc.x - 8) {
        loop = "under";
        fp = "bottom";
        tp = "bottom";
      } else if (!isHoriz(fp) && !isHoriz(tp) && tc.y < fc.y - 8) {
        // Vertical flow running backwards: go around the side, not underneath. Pick the side
        // with the shorter detour so the loop hugs the diagram instead of swinging across it.
        loop = "side";
        fp = cheaperSide(fn, tn, boxes, sizes) > 0 ? "right" : "left";
        tp = fp;
      }
    }
    work.push({
      id: connId(c),
      c,
      fn,
      tn,
      fp,
      tp,
      pinFrom: c.fromPort,
      pinTo: c.toPort,
      loop,
      manual,
      fromIdx: 0,
      fromCnt: 1,
      toIdx: 0,
      toCnt: 1,
    });
  }

  // 2) Fan out pathways sharing a node side; order by where the far end sits so they don't cross.
  const groups = new Map<string, { w: Work; role: "from" | "to" }[]>();
  const add = (k: string, v: { w: Work; role: "from" | "to" }) => {
    const arr = groups.get(k);
    if (arr) arr.push(v);
    else groups.set(k, [v]);
  };
  work.forEach((w) => {
    add(`${w.c.from}|${w.fp}`, { w, role: "from" });
    add(`${w.c.to}|${w.tp}`, { w, role: "to" });
  });
  const farPerp = (m: { w: Work; role: "from" | "to" }): number => {
    const side = m.role === "from" ? m.w.fp : m.w.tp;
    // A hand-routed pathway should fan toward its FIRST waypoint, not toward the far node —
    // otherwise dragging a pathway aside makes its port slide the wrong way along the side.
    const wps = m.w.c.waypoints;
    if (wps && wps.length) {
      const p = m.role === "from" ? wps[0] : wps[wps.length - 1];
      return isHoriz(side) ? p.y : p.x;
    }
    const far = m.role === "from" ? m.w.tn : m.w.fn;
    const s = sizeOf(far.id, sizes);
    return isHoriz(side) ? far.y + s.h / 2 : far.x + s.w / 2;
  };
  for (const arr of groups.values()) {
    arr.sort((a, b) => farPerp(a) - farPerp(b) || a.w.id.localeCompare(b.w.id));
    arr.forEach((m, i) => {
      if (m.role === "from") {
        m.w.fromIdx = i;
        m.w.fromCnt = arr.length;
      } else {
        m.w.toIdx = i;
        m.w.toCnt = arr.length;
      }
    });
  }

  // 3) Plan non-crossing return lanes for back-edges, clustered by overlapping span.
  const span = (w: Work) => ({
    a: portPoint(w.fn, w.fp, w.fromIdx, w.fromCnt, sizes),
    b: portPoint(w.tn, w.tp, w.toIdx, w.toCnt, sizes),
  });
  const lane = new Map<string, LanePlan>();

  const unders = work.filter((w) => w.loop === "under");
  const underPlan = planLanes(
    unders.map((w) => {
      const { a, b } = span(w);
      return { key: w.id, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x), extent: Math.max(a.y, b.y) };
    }),
    boxes,
    "y",
    1
  );
  for (const w of unders) {
    const p = underPlan.get(w.id);
    if (p) lane.set(w.id, { laneY: p.baseline + LANE_GAP + p.index * LANE_STEP });
  }

  // Side loops are planned per direction: right-hand loops nest outward to the right, and
  // left-hand loops outward to the left, so the two families never share a lane.
  for (const dir of [1, -1] as const) {
    const fam = work.filter((w) => w.loop === "side" && (dir > 0 ? w.fp === "right" : w.fp === "left"));
    if (!fam.length) continue;
    const plan = planLanes(
      fam.map((w) => {
        const { a, b } = span(w);
        return {
          key: w.id,
          lo: Math.min(a.y, b.y),
          hi: Math.max(a.y, b.y),
          extent: dir > 0 ? Math.max(a.x, b.x) : Math.min(a.x, b.x),
        };
      }),
      boxes,
      "x",
      dir
    );
    for (const w of fam) {
      const p = plan.get(w.id);
      if (p) lane.set(w.id, { laneX: p.baseline + dir * (LANE_GAP + p.index * LANE_STEP), dir });
    }
  }

  // 4) Route each pathway.
  const out: RoutedEdge[] = [];
  for (const w of work) {
    const st = portPoint(w.fn, w.fp, w.fromIdx, w.fromCnt, sizes);
    const en = portPoint(w.tn, w.tp, w.toIdx, w.toCnt, sizes);
    const skip = new Set([w.fn.id, w.tn.id]);
    let pts: Pt[];

    if (w.manual) {
      pts = routeThroughWaypoints(st, en, w.fp, w.tp, w.c.waypoints!);
    } else if (w.loop === "under") {
      pts = routeLoopUnder(st, en, boxes, skip, lane.get(w.id)?.laneY ?? Math.max(st.y, en.y) + LANE_GAP);
    } else if (w.loop === "side") {
      const l = lane.get(w.id);
      const dir = l?.dir ?? 1;
      pts = routeLoopSide(st, en, boxes, skip, l?.laneX ?? Math.max(st.x, en.x) + dir * LANE_GAP, dir);
    } else {
      const stagger = (w.fromIdx - (w.fromCnt - 1) / 2) * CHANNEL_STEP;
      pts = route(st, en, w.fp, w.tp, stagger, boxes, skip);
    }

    // If a pathway still crosses a node, try to clear it — first by picking a better exit or
    // entry side (honouring any side the author pinned), then by the obstacle-avoiding
    // router. Nothing is applied unless it's actually clear, so a good route is never made
    // worse, and hand-routed pathways are left exactly where the author put them.
    if (!fast && !w.manual && !polyClear(pts, boxes, skip, PAD)) {
      const alt = tryAltPorts(w.fn, w.tn, boxes, skip, sizes, w.pinFrom, w.pinTo);
      if (alt) {
        pts = alt;
      } else {
        const astar = routeAStar(st, en, w.fp, w.tp, boxes);
        if (astar && polyClear(astar, boxes, skip, 6)) {
          const straight = Math.hypot(en.x - st.x, en.y - st.y) || 1;
          // Back-edges get a looser budget — a legitimate loop can be far longer than the
          // straight-line distance between its ends.
          const budget = w.loop ? 6 : 2.6;
          if (pathLen(astar) <= straight * budget) pts = astar;
        }
      }
    }

    out.push({
      id: w.id,
      conn: w.c,
      from: w.fn,
      to: w.tn,
      fp: w.fp,
      tp: w.tp,
      start: st,
      end: en,
      pts,
      d: "",
      manual: w.manual,
      labelBox: null,
      label: w.c.label || "",
      bold: Boolean(w.c.bold),
    });
  }

  // 5) Split pathways that ended up drawn on top of one another, then place labels and
  //    build the final path strings.
  if (!fast) separateOverlaps(out);
  placeLabels(out, boxes, fast);
  for (const r of out) r.d = roundedPath(r.pts, CORNER);
  return out;
}

/**
 * Drag handles for a selected pathway: one per existing waypoint, plus a "ghost" on each
 * straight run that creates a new waypoint when dragged. Ghosts are skipped on the very
 * short corner segments where a handle would be unusable.
 */
export interface RouteHandle {
  kind: "point" | "ghost";
  /** Index into `waypoints` — the point to move, or where a new one gets inserted. */
  index: number;
  x: number;
  y: number;
}

/**
 * The straight runs of a pathway that can be grabbed and slid sideways as a unit — the
 * draw.io gesture. Only interior runs qualify: the first and last legs are anchored to a
 * port, so sliding them would just detach the arrow from the node.
 */
export interface RouteSegment {
  /** Index of the segment's end vertex in `pts` (the segment is pts[i-1] → pts[i]). */
  index: number;
  axis: "h" | "v";
  a: Pt;
  b: Pt;
  /** Midpoint, where the grab affordance is drawn. */
  mid: Pt;
}

export function routeSegments(edge: RoutedEdge): RouteSegment[] {
  const pts = edge.pts;
  const out: RouteSegment[] = [];
  for (let i = 1; i < pts.length; i++) {
    // Skip the port stubs at either end — those belong to the node, not the route.
    if (i <= 1 || i >= pts.length - 1) continue;
    const a = pts[i - 1];
    const b = pts[i];
    const horiz = Math.abs(a.y - b.y) < 0.5;
    const vert = Math.abs(a.x - b.x) < 0.5;
    if (!horiz && !vert) continue;
    if (Math.hypot(b.x - a.x, b.y - a.y) < 34) continue;
    out.push({ index: i, axis: horiz ? "h" : "v", a, b, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } });
  }
  return out;
}

/**
 * Recomputes a pathway's waypoints after one of its segments has been dragged sideways.
 *
 * Sliding a run has to move both of its ends, and each end may or may not already be a
 * waypoint — so the whole path is re-expressed as an explicit waypoint list with the two
 * moved vertices in place. That's what makes the gesture stick: after the drag the pathway
 * is fully hand-routed, and the automatic router won't pull it back.
 */
export function waypointsAfterSegmentDrag(edge: RoutedEdge, index: number, axis: "h" | "v", delta: number): Pt[] {
  const pts = edge.pts;
  const moved = pts.map((p, i) => {
    if (i !== index - 1 && i !== index) return p;
    return axis === "h" ? { x: p.x, y: p.y + delta } : { x: p.x + delta, y: p.y };
  });
  // Interior vertices become the waypoint list; the first two and last two points are the
  // port and its stub, which are derived from the node, not stored.
  return simplify(moved).slice(1, -1);
}

export function routeHandles(edge: RoutedEdge): RouteHandle[] {
  const handles: RouteHandle[] = [];
  const wps = edge.conn.waypoints ?? [];
  wps.forEach((p, i) => handles.push({ kind: "point", index: i, x: p.x, y: p.y }));

  // A ghost sits at the middle of each long run. Its insert index is the number of
  // waypoints that lie before that run along the path.
  const pts = edge.pts;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (Math.hypot(b.x - a.x, b.y - a.y) < 46) continue;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    // Skip a ghost that would sit on top of an existing waypoint handle.
    if (wps.some((p) => Math.abs(p.x - mx) < 14 && Math.abs(p.y - my) < 14)) continue;
    const before = wps.filter((p) => nearestIndexOnPath(pts, p) < i).length;
    handles.push({ kind: "ghost", index: before, x: mx, y: my });
  }
  return handles;
}

/** Index of the path vertex a waypoint is closest to — used to order ghost insertions. */
function nearestIndexOnPath(pts: Pt[], p: Pt): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - p.x, pts[i].y - p.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
