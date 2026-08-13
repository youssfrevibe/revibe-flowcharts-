export type NodeType = "start" | "step" | "decision" | "sub" | "ok" | "fail";

export interface FlowNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  label: string;
  detail: string;
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
