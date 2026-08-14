export type NodeType = "start" | "step" | "decision" | "sub" | "ok" | "fail";

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
  /** Optional per-node accent override (e.g. "emerald" | "blue" | "amber" | "rose" | "violet" | "zinc"). */
  color?: string;
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
