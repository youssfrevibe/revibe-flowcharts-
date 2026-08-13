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
}

export type ConnType = "" | "cyes" | "cno" | "camber";

export interface FlowConnection {
  from: string;
  to: string;
  label: string;
  type: ConnType;
}

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

