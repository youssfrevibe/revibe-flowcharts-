import { Actor, ConnType, DetailLevel, FlowConnection, FlowData, FlowNode, NodeType, Op } from "./types";
import { newConnId } from "./ops";
import { levelOf } from "./levels";

/**
 * Applying an AI-authored set of coarser views.
 *
 * Levels 1 and 2 are a *summary* of level 3, so authoring them is a whole-tier
 * replacement rather than a merge: re-running it must not leave last week's summary
 * steps stranded beside this week's. Level 3 — the real process, the thing people
 * hand-edited — is never touched.
 *
 * Kept separate from `ai-schema.ts` because that module imports server-only constants;
 * this one runs in the browser where the plan is applied through `commit`.
 */

export interface LevelPlanNode {
  id: string;
  label: string;
  type: NodeType;
  detail?: string;
  actor?: Actor;
  /** Level-3 node ids this summary step stands for. */
  children: string[];
}

export interface LevelPlanConn {
  from: string;
  to: string;
  label?: string;
  type?: ConnType;
}

export interface LevelPlanTier {
  level: 1 | 2;
  nodes: LevelPlanNode[];
  connections: LevelPlanConn[];
}

export interface LevelPlan {
  summary: string;
  tiers: LevelPlanTier[];
}

export interface LevelApplyResult {
  data: FlowData;
  ops: Op[];
  counts: {
    replacedNodes: number;
    addedNodes: number;
    addedConnections: number;
    /** Level-3 steps no level-1 summary claims. Surfaced, never silently tolerated. */
    uncovered: string[];
  };
}

const COLS = 4;
const GAP_X = 340;
const GAP_Y = 210;

export function applyLevelPlan(data: FlowData, plan: LevelPlan, uid: string): LevelApplyResult {
  const kept = data.nodes.filter((n) => levelOf(n) === 3);
  const keptConns = data.connections.filter((c) => levelOf(c) === 3);
  const replacedNodes = data.nodes.length - kept.length;

  const detailIds = new Set(kept.map((n) => n.id));
  const newNodes: FlowNode[] = [];
  const newConns: FlowConnection[] = [];

  for (const tier of plan.tiers) {
    const level = tier.level as DetailLevel;
    tier.nodes.forEach((n, i) => {
      newNodes.push({
        id: n.id,
        type: n.type,
        // Parked in a legible grid. The canvas auto-arranges this level immediately
        // afterwards, which is also when the cards get measured and their geometry
        // frozen — so these coordinates only have to avoid a pile at the origin.
        x: (i % COLS) * GAP_X,
        y: Math.floor(i / COLS) * GAP_Y,
        label: n.label,
        detail: n.detail ?? "",
        actor: n.actor,
        level,
        // Drop ids the model invented. A dangling child would make the summary claim
        // to collapse a step that does not exist.
        children: n.children.filter((c) => detailIds.has(c)),
      });
    });

    const tierIds = new Set(tier.nodes.map((n) => n.id));
    for (const c of tier.connections) {
      if (c.from === c.to) continue;
      if (!tierIds.has(c.from) || !tierIds.has(c.to)) continue;
      newConns.push({
        id: newConnId(),
        from: c.from,
        to: c.to,
        label: c.label ?? "",
        type: c.type ?? "",
        level,
      });
    }
  }

  // Coverage check against level 1 specifically: every real step should be reachable by
  // drilling down from "the shape". A step nobody claims is not a rendering bug, it is a
  // summary that quietly omits part of the process — so it is reported, not swallowed.
  const covered = new Set<string>();
  for (const n of newNodes) {
    if (n.level !== 1) continue;
    for (const c of n.children ?? []) covered.add(c);
  }
  const uncovered = kept.map((n) => n.id).filter((id) => !covered.has(id));

  const nodes = [...kept, ...newNodes];
  const connections = [...keptConns, ...newConns];

  return {
    data: { nodes, connections },
    ops: [{ t: "doc.replace", origin: uid, nodes, connections }],
    counts: { replacedNodes, addedNodes: newNodes.length, addedConnections: newConns.length, uncovered },
  };
}

/** One-line result for the modal, in the same voice as `describeCounts`. */
export function describeLevelPlan(c: LevelApplyResult["counts"]): string {
  const bits = [`${c.addedNodes} summary steps`, `${c.addedConnections} pathways`];
  if (c.replacedNodes) bits.push(`replaced ${c.replacedNodes} previous`);
  const head = bits.join(" · ");
  return c.uncovered.length ? `${head} — ${c.uncovered.length} detail steps left uncovered` : head;
}
