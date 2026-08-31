import { FlowNode, NodeType, Actor } from "./types";

export interface NodeTemplate {
  id: string;
  name: string;
  type: NodeType;
  label: string;
  detail: string;
  actor?: Actor;
  sla?: string;
  internalStage?: string;
  externalStage?: string;
  color?: string;
  tools?: string[];
  createdAt: number;
}

const STORAGE_KEY = "flow_node_templates";

function load(): NodeTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(templates: NodeTemplate[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch {}
}

/** List all saved templates, newest first. */
export function listTemplates(): NodeTemplate[] {
  return load().sort((a, b) => b.createdAt - a.createdAt);
}

/** Save a node as a reusable template. */
export function saveTemplate(name: string, node: Partial<FlowNode>): NodeTemplate {
  const templates = load();
  const t: NodeTemplate = {
    id: "tpl_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: name.trim() || node.label || "Untitled Template",
    type: node.type || "step",
    label: node.label || "",
    detail: node.detail || "",
    actor: node.actor,
    sla: node.sla,
    internalStage: node.internalStage,
    externalStage: node.externalStage,
    color: node.color,
    tools: node.tools,
    createdAt: Date.now(),
  };
  templates.push(t);
  save(templates);
  return t;
}

/** Delete a template by id. */
export function deleteTemplate(id: string) {
  const templates = load().filter((t) => t.id !== id);
  save(templates);
}

/** Rename a template. */
export function renameTemplate(id: string, name: string) {
  const templates = load().map((t) => (t.id === id ? { ...t, name } : t));
  save(templates);
}

/** Convert a template into a partial FlowNode (caller adds id, x, y). */
export function templateToNode(template: NodeTemplate): Partial<FlowNode> {
  return {
    type: template.type,
    label: template.label,
    detail: template.detail,
    actor: template.actor,
    sla: template.sla,
    internalStage: template.internalStage,
    externalStage: template.externalStage,
    color: template.color,
    tools: template.tools,
  };
}
