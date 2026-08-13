import { FlowNode, FlowConnection, DiagramMetadata, FlowData } from "./types";
import { getInitialNodes, getInitialConnections } from "./initial-data";
import { getKBNodes, getKBConnections } from "./kb-data";

export const BUILTIN_DIAGRAMS: DiagramMetadata[] = [
  {
    slug: "order-to-delivery",
    title: "Order-to-Delivery Process",
    description: "Customer journey from checkout to doorstep",
    nodeCount: 24,
    color: "bg-emerald-700",
  },
  {
    slug: "revibe-kb",
    title: "Revibe KB & Claims Resolution",
    description: "Knowledge base tier routing and claims resolution process",
    nodeCount: 4,
    color: "bg-blue-700",
  },
];

const CUSTOM_LIST_KEY = "revibe_flowchart_custom_list";

export function generateNodeId(): string {
  return `n_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
}

export function getDefaultData(slug: string): FlowData {
  if (slug === "revibe-kb") {
    return { nodes: getKBNodes(), connections: getKBConnections() };
  }
  if (slug === "order-to-delivery") {
    return { nodes: getInitialNodes(), connections: getInitialConnections() };
  }
  return {
    nodes: [
      { id: "n1", type: "start", x: 400, y: 50, label: "Start Process", detail: "Describe the beginning of this process" },
      { id: "n2", type: "step", x: 400, y: 180, label: "First Action Step", detail: "Describe what happens here" },
      { id: "n3", type: "ok", x: 400, y: 320, label: "Process Completed", detail: "End of flow" },
    ],
    connections: [
      { from: "n1", to: "n2", label: "", type: "" },
      { from: "n2", to: "n3", label: "Success", type: "cyes" },
    ],
  };
}

export function loadFlowchartData(slug: string): FlowData {
  if (typeof window === "undefined") return getDefaultData(slug);
  try {
    const saved = localStorage.getItem(`flowchart-${slug}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && Array.isArray(parsed.nodes)) {
        return {
          nodes: parsed.nodes,
          connections: parsed.connections || [],
        };
      }
    }
  } catch (err) {
    console.error("Failed to load flowchart from local storage:", err);
  }
  return getDefaultData(slug);
}

export function saveFlowchartData(slug: string, data: FlowData): void {
  if (typeof window === "undefined") return;
  // Local storage save
  try {
    localStorage.setItem(`flowchart-${slug}`, JSON.stringify(data));
    const customList = getCustomDiagrams();
    const idx = customList.findIndex((d) => d.slug === slug);
    if (idx !== -1) {
      customList[idx].nodeCount = data.nodes.length;
      customList[idx].updatedAt = new Date().toISOString();
      localStorage.setItem(CUSTOM_LIST_KEY, JSON.stringify(customList));
    }
  } catch (err) {
    console.error("Failed to save flowchart to local storage:", err);
  }

  // Cloud API async save
  const meta = getAllDiagrams().find((d) => d.slug === slug);
  fetch("/api/flowcharts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slug,
      title: meta?.title || slug,
      description: meta?.description || "",
      nodes: data.nodes,
      connections: data.connections,
      color: meta?.color || "bg-purple-700",
      isCustom: meta?.isCustom ?? true,
    }),
  }).catch(() => {});
}

export function resetFlowchartData(slug: string): FlowData {
  const defaultData = getDefaultData(slug);
  if (typeof window !== "undefined") {
    localStorage.removeItem(`flowchart-${slug}`);
  }
  saveFlowchartData(slug, defaultData);
  return defaultData;
}

export function getCustomDiagrams(): DiagramMetadata[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CUSTOM_LIST_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

export function getAllDiagrams(): DiagramMetadata[] {
  const custom = getCustomDiagrams();
  const builtInMap = BUILTIN_DIAGRAMS.map((d) => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`flowchart-${d.slug}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed?.nodes) {
            return { ...d, nodeCount: parsed.nodes.length };
          }
        } catch {}
      }
    }
    return d;
  });
  return [...builtInMap, ...custom];
}

export function createCustomDiagram(title: string, description: string): DiagramMetadata {
  const slug = `custom-${Date.now()}`;
  const newMeta: DiagramMetadata = {
    slug,
    title: title || "New Process Flow",
    description: description || "Custom workflow mapping",
    nodeCount: 3,
    color: "bg-purple-700",
    isCustom: true,
    updatedAt: new Date().toISOString(),
  };
  const list = getCustomDiagrams();
  list.push(newMeta);
  if (typeof window !== "undefined") {
    localStorage.setItem(CUSTOM_LIST_KEY, JSON.stringify(list));
    saveFlowchartData(slug, getDefaultData(slug));
  }
  return newMeta;
}

export function deleteCustomDiagram(slug: string): void {
  if (typeof window === "undefined") return;
  const list = getCustomDiagrams().filter((d) => d.slug !== slug);
  localStorage.setItem(CUSTOM_LIST_KEY, JSON.stringify(list));
  localStorage.removeItem(`flowchart-${slug}`);

  fetch(`/api/flowcharts/${slug}`, { method: "DELETE" }).catch(() => {});
}
