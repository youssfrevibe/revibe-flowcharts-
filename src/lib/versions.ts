import { FlowData } from "./types";

export interface VersionMeta {
  id: string;
  label: string | null;
  author_name: string | null;
  node_count: number;
  created_at: string;
}

/** Saves a snapshot of the current document. Returns the created version metadata, or null. */
export async function saveVersion(
  slug: string,
  data: FlowData,
  opts: { label?: string; author?: string } = {}
): Promise<VersionMeta | null> {
  try {
    const res = await fetch(`/api/flowcharts/${slug}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nodes: data.nodes,
        connections: data.connections,
        label: opts.label,
        author: opts.author,
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.version || null;
  } catch {
    return null;
  }
}

export async function listVersions(slug: string): Promise<VersionMeta[]> {
  try {
    const res = await fetch(`/api/flowcharts/${slug}/versions`, { cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return json.versions || [];
  } catch {
    return [];
  }
}

export async function fetchVersion(slug: string, id: string): Promise<FlowData | null> {
  try {
    const res = await fetch(`/api/flowcharts/${slug}/versions?id=${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    const v = json.version;
    if (v && Array.isArray(v.nodes)) return { nodes: v.nodes, connections: v.connections || [] };
    return null;
  } catch {
    return null;
  }
}
