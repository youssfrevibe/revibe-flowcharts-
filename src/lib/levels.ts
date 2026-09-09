import { DetailLevel, FlowConnection, FlowData, FlowNode } from "./types";
import { connId } from "./ops";

/** Levels are a *filter over one document*, not three separate documents.
 *
 * Every node and connection belongs to exactly one level, and a level-N node names the
 * level-(N+1) nodes it collapses in `children`. Keeping it as one flat pair of arrays is
 * what lets `applyOp` stay unchanged — a level is just a field, so realtime convergence,
 * undo and persistence all work on levels without knowing they exist.
 *
 * Level 3 is the default so a document authored before levels existed reads as "every
 * step" and renders exactly as it always did. */

export const DEFAULT_LEVEL: DetailLevel = 3;

export const LEVELS: readonly DetailLevel[] = [1, 2, 3];

export const LEVEL_LABELS: Record<DetailLevel, { title: string; blurb: string }> = {
  1: { title: "The shape", blurb: "What a new joiner needs on day one." },
  2: { title: "Branches", blurb: "Every path that actually happens, and where each one ends." },
  3: { title: "Every step", blurb: "Every loop, every retry and the one-market exceptions." },
};

export function levelOf(item: { level?: DetailLevel }): DetailLevel {
  return item.level ?? DEFAULT_LEVEL;
}

/** The subgraph one level shows.
 *
 * Connections are kept only when both endpoints survive the filter. A connection whose
 * level was never set defaults to 3 like everything else, so a legacy document returns
 * itself unchanged at level 3 and empty at levels 1 and 2. */
export function atLevel(data: FlowData, level: DetailLevel): FlowData {
  const nodes = data.nodes.filter((n) => levelOf(n) === level);
  const ids = new Set(nodes.map((n) => n.id));
  const connections = data.connections.filter(
    (c) => levelOf(c) === level && ids.has(c.from) && ids.has(c.to)
  );
  return { nodes, connections };
}

/** Levels this document actually has nodes for, lowest first.
 *
 * The UI offers only these. A document that has never been through level authoring has
 * content at level 3 alone, and offering it an empty "The shape" would just look broken. */
export function populatedLevels(data: FlowData): DetailLevel[] {
  const seen = new Set<DetailLevel>();
  for (const n of data.nodes) seen.add(levelOf(n));
  return LEVELS.filter((l) => seen.has(l));
}

/** Node counts per level, for the sidebar. */
export function levelCounts(data: FlowData): Record<DetailLevel, number> {
  const counts: Record<DetailLevel, number> = { 1: 0, 2: 0, 3: 0 };
  for (const n of data.nodes) counts[levelOf(n)] += 1;
  return counts;
}

/** The nodes one level-N node collapses, resolved one level down.
 *
 * Ids that no longer exist are dropped rather than returned as holes — `node.delete`
 * cascades child references, but a document edited by an older client, or one imported
 * with a stale plan, can still name a node that isn't there. */
export function childrenOf(data: FlowData, node: FlowNode): FlowNode[] {
  if (!node.children?.length) return [];
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  return node.children.map((id) => byId.get(id)).filter((n): n is FlowNode => Boolean(n));
}

/** Every node reachable through `children`, at any depth below this one. */
export function descendantsOf(data: FlowData, node: FlowNode): FlowNode[] {
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  const out: FlowNode[] = [];
  const seen = new Set<string>([node.id]);
  const queue = [...(node.children ?? [])];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const child = byId.get(id);
    if (!child) continue;
    out.push(child);
    if (child.children?.length) queue.push(...child.children);
  }
  return out;
}

/** The level-N node that collapses a given node, if any. */
export function parentOf(data: FlowData, nodeId: string): FlowNode | null {
  return data.nodes.find((n) => n.children?.includes(nodeId)) ?? null;
}

/** Splice one level's re-laid nodes back into the whole document.
 *
 * Auto-layout, fix-overlaps and friends run on a single level's subgraph, but they commit
 * through `doc.replace`, which swaps the *entire* document. Handing it the laid-out array
 * directly would delete every node belonging to the levels that were not laid out. Merging
 * by id keeps them, untouched and in their original order. */
export function mergeNodes(all: FlowNode[], updated: FlowNode[]): FlowNode[] {
  if (!updated.length) return all;
  const byId = new Map(updated.map((n) => [n.id, n]));
  return all.map((n) => byId.get(n.id) ?? n);
}

/** The connection counterpart of `mergeNodes`, keyed the same way `applyOp` keys them. */
export function mergeConnections(all: FlowConnection[], updated: FlowConnection[]): FlowConnection[] {
  if (!updated.length) return all;
  const byId = new Map(updated.map((c) => [connId(c), c]));
  return all.map((c) => byId.get(connId(c)) ?? c);
}

/** Connections that belong to a level, regardless of whether their endpoints survive.
 *
 * Used by validation rather than rendering — `atLevel` deliberately drops dangling
 * connections so nothing routes to a node that isn't on screen. */
export function connectionsAtLevel(data: FlowData, level: DetailLevel): FlowConnection[] {
  return data.connections.filter((c) => levelOf(c) === level);
}

/** A deterministic walk of one level, for the guided tour.
 *
 * Starts at the entry points — an explicit `start` node if the level has one, otherwise
 * every node nothing points at — then follows outgoing connections depth-first in stored
 * order, so two readers are walked through the process identically.
 *
 * Anything unreachable is appended rather than dropped. An orphaned step is exactly the
 * kind of thing a reader should be shown; hiding it would make the tour quietly lie about
 * how many steps the process has. Cycles terminate on the visited set. */
export function tourOrder(data: FlowData): FlowNode[] {
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  const outgoing = new Map<string, string[]>();
  for (const c of data.connections) {
    if (!outgoing.has(c.from)) outgoing.set(c.from, []);
    outgoing.get(c.from)!.push(c.to);
  }
  const hasIncoming = new Set(data.connections.map((c) => c.to));
  const starts = data.nodes.filter((n) => n.type === "start");
  const entries = starts.length ? starts : data.nodes.filter((n) => !hasIncoming.has(n.id));

  const order: string[] = [];
  const seen = new Set<string>();
  const stack: string[] = [];
  const walk = (root: string) => {
    stack.length = 0;
    stack.push(root);
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id) || !byId.has(id)) continue;
      seen.add(id);
      order.push(id);
      const next = outgoing.get(id) ?? [];
      // Reversed because the stack pops last-in first: this preserves stored order.
      for (let i = next.length - 1; i >= 0; i--) stack.push(next[i]);
    }
  };
  for (const e of entries) walk(e.id);
  for (const n of data.nodes) walk(n.id);
  return order.map((id) => byId.get(id)!);
}

/** Rewrite a copied node's `children` through an id map, dropping anything not copied.
 *
 * Duplicate, paste and alt-drag all spread the source node, which carried `children`
 * verbatim — leaving two summary cards claiming the *same* level-3 steps. `parentOf`
 * then resolves drill-up to whichever appears first in array order, so the reader sees
 * one set of steps collapsed under two different parents. A child that was not part of
 * the copy is dropped rather than shared. */
export function remapChildren(node: FlowNode, idMap: Map<string, string>): FlowNode {
  if (!node.children?.length) return node;
  const mapped = node.children.map((c) => idMap.get(c)).filter((c): c is string => Boolean(c));
  return { ...node, children: mapped.length ? mapped : undefined };
}

/** Drop a deleted id from every other node's `children`.
 *
 * `applyOp`'s `node.delete` already does this, but local producers that filter nodes
 * themselves must do it too — otherwise the deleting client keeps a dangling child id
 * while every peer (which went through `applyOp`) does not, and the deleter's copy is
 * the one that gets saved. */
export function stripChildRefs(nodes: FlowNode[], removed: Set<string>): FlowNode[] {
  return nodes.map((n) =>
    n.children?.some((c) => removed.has(c)) ? { ...n, children: n.children.filter((c) => !removed.has(c)) } : n
  );
}
