export type NodeType = "start" | "step" | "decision" | "sub" | "ok" | "fail" | "note";

export type TextPosition = "inside" | "top" | "bottom" | "left" | "right";
export type TextAlign = "left" | "center" | "right";
export type TextSize = "sm" | "base" | "lg";
export type NodeWidth = "compact" | "normal" | "wide" | "xwide";

/**
 * Who owns / performs the action at this step. Rendered as the card's border color so a
 * reader can scan the flow and see "who does what" at a glance.
 *   revibe  → Revibe team    (purple)
 *   seller  → Seller / supplier (orange)
 *   system  → Automated / system-driven (grey)
 *   carrier → Third party / carrier / lab (cyan)
 */
export type Actor = "revibe" | "seller" | "system" | "carrier";

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
  /** Business stage this card belongs to (e.g. "Under QC", "Ready for refund"). Rendered
   * above the label as an ALL-CAPS stage badge — meant for the process-tracking value,
   * not extra description. */
  stage?: string;
  /** Who performs this action — controls the card's border color so responsibility is
   * visually scannable across the flow. See [[Actor]]. */
  actor?: Actor;
}

export type ConnType = "" | "cyes" | "cno" | "camber";

export interface FlowConnection {
  /** Stable id — required for reliable realtime + multi-user editing. Backfilled on load for legacy data. */
  id?: string;
  from: string;
  to: string;
  label: string;
  type: ConnType;
  /** Optional explicit source/target ports; falls back to auto-routing when absent. */
  fromPort?: Port;
  toPort?: Port;
  /** Optional bold / highlighted pathway for critical or primary process flow. */
  bold?: boolean;
  /** Optional custom connection pathway color override. */
  color?: string;
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
  | { t: "conn.delete"; origin: string; id: string }
  | { t: "doc.replace"; origin: string; nodes: FlowNode[]; connections: FlowConnection[] };
