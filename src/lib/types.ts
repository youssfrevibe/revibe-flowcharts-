export type NodeType = "start" | "step" | "decision" | "sub" | "ok" | "fail" | "note";

export type TextPosition = "inside" | "top" | "bottom" | "left" | "right";
export type TextAlign = "left" | "center" | "right";
export type TextSize = "sm" | "base" | "lg";
export type NodeWidth = "compact" | "normal" | "wide" | "xwide";

/**
 * How much of the process a view shows. One document holds all three levels at once; a
 * node or connection belongs to exactly one of them, and a node on levels 1-2 names the
 * steps it collapses in `children`.
 *   1 → "The shape"  — the handful of steps a new joiner needs on day one
 *   2 → "Branches"   — every path that actually happens, and where each one ends
 *   3 → "Every step" — every loop, retry and per-market exception
 * Defaults to 3, so a document authored before levels existed reads as the fully
 * detailed view it already was. See `lib/levels.ts`.
 */
export type DetailLevel = 1 | 2 | 3;

/**
 * Who owns / performs the action at this step. Rendered as the card's border color so a
 * reader can scan the flow and see "who does what" at a glance.
 *   revibe  → Revibe team    (purple)
 *   seller  → Seller / supplier (orange)
 *   system  → Automated / system-driven (grey)
 *   carrier → Third party / carrier / lab (cyan)
 */
export type Actor = "revibe" | "seller" | "system" | "carrier";

/**
 * @deprecated Kept for backwards-compatibility with the old two-button picker. New nodes
 * use free-text `internalStage` / `externalStage` instead. On load, normalize() folds
 * `stage` + `stageKind` into the new fields; the deprecated fields are then removed on
 * next save. See [[FlowNode.internalStage]] and [[FlowNode.externalStage]].
 */
export type StageKind = "internal" | "external" | "IS" | "ES" | "IS+ES";

export interface FlowNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  label: string;
  detail: string;
  agentSteps?: string[];
  tools?: string[];
  sla?: string;
  inputs?: string;
  outputs?: string;
  /** Optional per-node accent override (preset name e.g. "emerald", "blue", or hex code "#3b82f6"). */
  color?: string;
  /** Optional text position to prevent overlapping (default: "inside"). */
  textPosition?: TextPosition;
  /** Optional text alignment (default: "center" for decision/terminator, "left" for others). */
  textAlign?: TextAlign;
  /** Optional text font size (default: "base"). */
  textSize?: TextSize;
  /** Optional node width override or preset. */
  customWidth?: number | NodeWidth;
  /** Frozen card geometry. Measured once from the DOM by the editor, then authoritative:
   * routing, layout, fit-to-view and export all prefer it over the live measurement.
   * Without it the same document routes differently in each chrome that renders it — a
   * viewer with simpler cards measures smaller boxes and re-collides pathways the editor
   * had hand-cleared. Absent on legacy nodes until an editor session captures it. */
  size?: { w: number; h: number };
  /** Which detail level shows this node. Defaults to 3 ("every step"). */
  level?: DetailLevel;
  /** The next-level-down node ids this one collapses into a single summary step. Only
   * meaningful on levels 1 and 2. `node.delete` strips ids from here as it cascades, so
   * this should not dangle — `childrenOf` still tolerates it if an older client wrote it. */
  children?: string[];
  /** The reader-facing facts shown in the detail panel. See [[NodeFacts]]. */
  facts?: NodeFacts;
  /** @deprecated Legacy single stage — migrated by normalize() into `internalStage` /
   * `externalStage`. Kept on the type so old JSON parses cleanly. */
  stage?: string;
  /** @deprecated Legacy typed kind — replaced by free-text `internalStage` /
   * `externalStage`. */
  stageKind?: StageKind;
  /** The stage name tracked internally by the team (e.g. "Send to LAB",
   * "Pending LAB collection"). Free text — anything the process uses. Renders as
   * `internal_stage = <value>` on the card. Omit to hide the internal line. */
  internalStage?: string;
  /** The stage name shown to the customer (e.g. "Expert revision", "Under QC"). Free
   * text. Renders as `external_stage = <value>`. Omit to hide the external line. */
  externalStage?: string;
  /** Who performs this action — controls the card's border color so responsibility is
   * visually scannable across the flow. See [[Actor]]. */
  actor?: Actor;
}

/** Where a number really lives, so an authored figure can later be replaced by a live
 * query without reshaping the document. Resolved server-side only — the browser has no
 * service-role key, and these tables are not the flowchart database. */
export interface DataBinding {
  table: string;
  column?: string;
  filter?: string;
  agg?: "count" | "sum";
}

/** A figure in the facts table. `value` is what the panel shows today; when `source` is
 * present a live query can replace it and `value` becomes the offline fallback. */
export interface Metric {
  value: string | number;
  note?: string;
  source?: DataBinding;
}

/** Who actually moves a stage, as observed counts rather than who is nominally
 * responsible for it. The gap between those two is usually the whole point. */
export interface Mover {
  actor: Actor;
  count: number;
}

/** A few real rows from the screen this stage is worked on, so a reader recognises it. */
export interface FactPreview {
  caption?: string;
  columns: string[];
  rows: string[][];
}

/** The reader-facing facts for one step: shown as a table in the detail panel's Human
 * view and serialised verbatim into its Claude view. Every field is optional, so a step
 * with no facts renders its description alone rather than an empty table. */
export interface NodeFacts {
  /** Where the work happens — e.g. "New OMS · QuiQup · Supplier portal". */
  where?: string;
  /** Volume over the reporting window. */
  volume?: Metric;
  /** Observed movers, rendered as a 100% bar. */
  movers?: Mover[];
  /** The column a reader can look this stage up by — e.g. "order_product_claims_new stage". */
  dataRef?: string;
  /** A sample of the list this stage appears in. */
  preview?: FactPreview;
}

export type ConnType = "" | "cyes" | "cno" | "camber";

export interface FlowConnection {
  /** Stable id — required for reliable realtime + multi-user editing. Backfilled on load for legacy data. */
  id?: string;
  from: string;
  to: string;
  label: string;
  type: ConnType;
  /** Which detail level draws this connection. Defaults to 3, matching its endpoints. */
  level?: DetailLevel;
  /** Optional explicit source/target ports; falls back to auto-routing when absent. */
  fromPort?: Port;
  toPort?: Port;
  /** Optional bold / highlighted pathway for critical or primary process flow. */
  bold?: boolean;
  /** Optional custom connection pathway color override. */
  color?: string;
  /**
   * Manual route override — world-space points the pathway is dragged through, in order.
   * When present the automatic router steps aside and the pathway is drawn orthogonally
   * from the source port, through every waypoint, into the target port. This is what lets
   * two pathways that would otherwise overlap be pulled onto separate lanes by hand.
   * Cleared by "Reset route" and by a full auto-layout (which invalidates world positions).
   */
  waypoints?: Pt[];
}

/** A point in canvas world coordinates. */
export interface Pt {
  x: number;
  y: number;
}

export type Port = "top" | "bottom" | "left" | "right";

export interface FlowData {
  nodes: FlowNode[];
  connections: FlowConnection[];
}

export interface DiagramMetadata {
  slug: string;
  title: string;
  description: string;
  nodeCount: number;
  color: string;
  isCustom?: boolean;
  updatedAt?: string;
}

/** A person editing a diagram (shared-link identity — no auth). */
export interface Collaborator {
  userId: string;
  name: string;
  color: string;
}

/** Realtime operations broadcast between collaborators. Each carries the origin userId to suppress echo. */
export type Op =
  | { t: "node.upsert"; origin: string; node: FlowNode }
  | { t: "nodes.move"; origin: string; moves: { id: string; x: number; y: number }[] }
  | { t: "node.delete"; origin: string; id: string }
  | { t: "conn.upsert"; origin: string; conn: FlowConnection }
  | { t: "conn.waypoints"; origin: string; id: string; waypoints?: Pt[] }
  | { t: "conn.delete"; origin: string; id: string }
  | { t: "doc.replace"; origin: string; nodes: FlowNode[]; connections: FlowConnection[] };
