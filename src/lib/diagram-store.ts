import { DiagramMetadata, FlowData, FlowNode } from "./types";
import { getInitialNodes, getInitialConnections } from "./initial-data";
import { getKBNodes, getKBConnections } from "./kb-data";
import { backfillConnIds } from "./ops";

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

const BUILTIN_SLUGS = new Set(BUILTIN_DIAGRAMS.map((d) => d.slug));
const LIST_CACHE_KEY = "revibe_flowchart_list_cache";
const dataCacheKey = (slug: string) => `flowchart-${slug}`;

export function generateNodeId(): string {
  return `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function getDefaultData(slug: string): FlowData {
  if (slug === "revibe-kb") {
    return normalize({ nodes: getKBNodes(), connections: getKBConnections() });
  }
  if (slug === "order-to-delivery") {
    return normalize({ nodes: getInitialNodes(), connections: getInitialConnections() });
  }
  return normalize({
    nodes: [
      { id: "n1", type: "start", x: 560, y: 80, label: "Start Process", detail: "Describe the beginning of this process" },
      { id: "n2", type: "step", x: 560, y: 220, label: "First Action Step", detail: "Describe what happens here" },
      { id: "n3", type: "ok", x: 560, y: 360, label: "Process Completed", detail: "End of flow" },
    ],
    connections: [
      { from: "n1", to: "n2", label: "", type: "" },
      { from: "n2", to: "n3", label: "Success", type: "cyes" },
    ],
  });
}

function normalize(data: FlowData): FlowData {
  return { nodes: (data.nodes || []).map(migrateNodeFields), connections: backfillConnIds(data.connections || []) };
}

/**
 * Bring older / imported diagrams up to the current node schema:
 *  - `newOmsStage` (used by imported Revibe process JSON) is folded into the first-class
 *    `stage` field so the card renders its stage badge without callers having to know
 *    about the alias. Existing `stage` values win; the old key is preserved for round-trip.
 * We only touch these two fields; every other property (including custom app-specific
 * extras like `newOmsFlow`, `oldAppStatus`) is left untouched so nothing is lost on save.
 */
function migrateNodeFields(node: FlowNode & { newOmsStage?: string }): FlowNode {
  if (!node.stage && node.newOmsStage) {
    return { ...node, stage: node.newOmsStage };
  }
  return node;
}

/* ----------------------------- local cache ----------------------------- */

export function getCachedData(slug: string): FlowData | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem(dataCacheKey(slug));
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && Array.isArray(parsed.nodes)) return normalize(parsed);
    }
  } catch {}
  return null;
}

export function cacheData(slug: string, data: FlowData): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(dataCacheKey(slug), JSON.stringify(data));
  } catch {}
}

/** Instant initial data for first paint: cache → builtin default → null-for-custom starter. */
export function getInitialData(slug: string): FlowData {
  return getCachedData(slug) || getDefaultData(slug);
}

/* ----------------------------- cloud reads ----------------------------- */

/** Fetches the authoritative document from the cloud. Returns null if it doesn't exist there yet. */
export async function fetchCloudData(slug: string): Promise<FlowData | null> {
  try {
    const res = await fetch(`/api/flowcharts/${slug}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    const fc = json.flowchart;
    if (fc && Array.isArray(fc.nodes)) {
      const data = normalize({ nodes: fc.nodes, connections: fc.connections || [] });
      cacheData(slug, data);
      return data;
    }
  } catch {}
  return null;
}

/* ----------------------------- cloud writes ---------------------------- */

/** Upserts a document to the cloud. Resolves to true on success. */
export async function saveToCloud(
  slug: string,
  data: FlowData,
  meta?: Partial<DiagramMetadata>
): Promise<boolean> {
  cacheData(slug, data);
  const known = getCachedDiagrams().find((d) => d.slug === slug);
  const title = meta?.title || known?.title || slug;
  const description = meta?.description ?? known?.description ?? "";
  const color = meta?.color || known?.color || (BUILTIN_SLUGS.has(slug) ? "bg-emerald-700" : "bg-purple-700");
  const isCustom = meta?.isCustom ?? known?.isCustom ?? !BUILTIN_SLUGS.has(slug);

  if (meta && typeof window !== "undefined") {
    try {
      const list = getCachedDiagrams();
      const nextList = list.map((d) =>
        d.slug === slug
          ? { ...d, title, description, color, isCustom, nodeCount: data.nodes.length, updatedAt: new Date().toISOString() }
          : d
      );
      if (!list.some((d) => d.slug === slug)) {
        nextList.push({
          slug,
          title,
          description,
          color,
          isCustom,
          nodeCount: data.nodes.length,
          updatedAt: new Date().toISOString(),
        });
      }
      localStorage.setItem(LIST_CACHE_KEY, JSON.stringify(nextList));
    } catch {}
  }

  try {
    const res = await fetch("/api/flowcharts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        title,
        description,
        nodes: data.nodes,
        connections: data.connections,
        color,
        isCustom,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/* ------------------------------ diagram list --------------------------- */

export function getCachedDiagrams(): DiagramMetadata[] {
  if (typeof window === "undefined") return BUILTIN_DIAGRAMS;
  try {
    const raw = localStorage.getItem(LIST_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {}
  return BUILTIN_DIAGRAMS;
}

function mergeList(cloud: DiagramMetadata[]): DiagramMetadata[] {
  const cloudBySlug = new Map(cloud.map((d) => [d.slug, d]));
  const builtin = BUILTIN_DIAGRAMS.map((b) => {
    const c = cloudBySlug.get(b.slug);
    return c ? { ...b, nodeCount: c.nodeCount ?? b.nodeCount, updatedAt: c.updatedAt } : b;
  });
  const custom = cloud
    .filter((d) => !BUILTIN_SLUGS.has(d.slug))
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  return [...builtin, ...custom];
}

/** Cloud-authoritative list of all diagrams (builtin + custom), cached for offline/instant paint. */
export async function fetchCloudDiagrams(): Promise<DiagramMetadata[]> {
  try {
    const res = await fetch("/api/flowcharts", { cache: "no-store" });
    if (res.ok) {
      const json = await res.json();
      const cloud: DiagramMetadata[] = json.flowcharts || [];
      const merged = mergeList(cloud);
      try {
        localStorage.setItem(LIST_CACHE_KEY, JSON.stringify(merged));
      } catch {}
      return merged;
    }
  } catch {}
  return getCachedDiagrams();
}

export async function createCustomDiagram(title: string, description: string): Promise<DiagramMetadata> {
  const slug = `custom-${Date.now().toString(36)}`;
  const meta: DiagramMetadata = {
    slug,
    title: title || "New Process Flow",
    description: description || "Custom workflow mapping",
    nodeCount: 3,
    color: "bg-purple-700",
    isCustom: true,
    updatedAt: new Date().toISOString(),
  };
  const data = getDefaultData(slug);
  await saveToCloud(slug, data, meta);
  // Optimistically update cache list.
  const list = getCachedDiagrams().filter((d) => d.slug !== slug);
  try {
    localStorage.setItem(LIST_CACHE_KEY, JSON.stringify([...list, meta]));
  } catch {}
  return meta;
}

/** Soft-delete: hides the diagram from the main list but keeps it recoverable. */
export async function archiveDiagram(slug: string): Promise<boolean> {
  if (typeof window !== "undefined") {
    const list = getCachedDiagrams().filter((d) => d.slug !== slug);
    try {
      localStorage.setItem(LIST_CACHE_KEY, JSON.stringify(list));
    } catch {}
  }
  try {
    const res = await fetch(`/api/flowcharts/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function unarchiveDiagram(slug: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/flowcharts/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: false }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchArchivedDiagrams(): Promise<DiagramMetadata[]> {
  try {
    const res = await fetch("/api/flowcharts?archived=1", { cache: "no-store" });
    if (res.ok) {
      const json = await res.json();
      return (json.flowcharts || []) as DiagramMetadata[];
    }
  } catch {}
  return [];
}

/** Permanent delete — used from the archived view. */
export async function deleteCustomDiagram(slug: string): Promise<void> {
  if (typeof window !== "undefined") {
    localStorage.removeItem(dataCacheKey(slug));
    const list = getCachedDiagrams().filter((d) => d.slug !== slug);
    try {
      localStorage.setItem(LIST_CACHE_KEY, JSON.stringify(list));
    } catch {}
  }
  try {
    await fetch(`/api/flowcharts/${slug}`, { method: "DELETE" });
  } catch {}
}

export async function updateDiagramMetadata(
  slug: string,
  updates: { title?: string; description?: string; color?: string }
): Promise<boolean> {
  const currentList = getCachedDiagrams();
  const existing = currentList.find((d) => d.slug === slug);
  const updatedMeta: DiagramMetadata = {
    slug,
    title: updates.title ?? existing?.title ?? slug,
    description: updates.description ?? existing?.description ?? "",
    nodeCount: existing?.nodeCount ?? 0,
    color: updates.color ?? existing?.color ?? (BUILTIN_SLUGS.has(slug) ? "bg-emerald-700" : "bg-purple-700"),
    isCustom: existing?.isCustom ?? !BUILTIN_SLUGS.has(slug),
    updatedAt: new Date().toISOString(),
  };

  const nextList = currentList.map((d) => (d.slug === slug ? updatedMeta : d));
  if (!existing) nextList.push(updatedMeta);
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(LIST_CACHE_KEY, JSON.stringify(nextList));
    } catch {}
  }

  const currentData = getCachedData(slug) || getDefaultData(slug);
  return saveToCloud(slug, currentData, updatedMeta);
}

export async function resetToDefault(slug: string): Promise<FlowData> {
  const data = getDefaultData(slug);
  await saveToCloud(slug, data);
  return data;
}
