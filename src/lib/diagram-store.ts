import { Actor, DiagramMetadata, FlowData, FlowNode, NodeType } from "./types";
import { DEFAULT_LEVEL } from "./levels";
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
    nodeCount: 11,
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

export function normalize(data: FlowData): FlowData {
  const nodes = (data.nodes || []).map((n) => coerceNodeShape(migrateNodeFields(n)));
  const ids = new Set(nodes.map((n) => n.id));
  // A pathway to a node that is not here draws into empty space, and a self-loop is
  // skipped by the router so it silently disappears — drop both rather than carry them.
  const connections = backfillConnIds(
    (data.connections || []).filter((c) => c && c.from !== c.to && ids.has(c.from) && ids.has(c.to))
  );
  return { nodes, connections };
}

/**
 * Bring older / imported diagrams up to the current node schema. Two migrations:
 *
 *  1. `newOmsStage` (from imported Revibe process JSON) folds into `stage` so nodes that
 *     never had the first-class field still light up the stage row.
 *
 *  2. The old typed `stageKind` + single `stage` combo folds into the new free-text
 *     `internalStage` / `externalStage` pair. Mapping:
 *       - "IS+ES"           → both = stage
 *       - "IS" | "internal" → internalStage = stage
 *       - "ES" | "external" → externalStage = stage
 *       - no kind but stage → both = stage (safe default — the stage appears everywhere)
 *     Nodes that already carry the new fields are left alone; nodes with `internalStage`
 *     already set (v5-imports use `internalStage` verbatim) keep those values.
 *
 * Every other property — including custom app-specific extras like `newOmsFlow` and
 * `oldAppStatus` — is left untouched so nothing is lost on save.
 */
/**
 * Values other tools write that mean something this schema already has.
 *
 * A node whose `type` is not one of ours falls through every shape branch and renders as
 * a plain rectangle, and a node whose `actor` is not one of ours gets `undefined` from
 * `ACTOR_STYLES` — no owner pill, no colour strip, and it is counted under nobody in the
 * "Who is involved" rail. Both fail *silently*, which is how the live claims map ended up
 * with an end node drawn as an ordinary step and six nodes that looked ownerless.
 *
 * Only unambiguous synonyms belong here. Anything genuinely unknown is left alone rather
 * than guessed at.
 */
const TYPE_ALIASES: Record<string, NodeType> = {
  end: "ok",
  terminator: "ok",
  stop: "ok",
  finish: "ok",
  success: "ok",
  done: "ok",
  error: "fail",
  failure: "fail",
  reject: "fail",
  rejected: "fail",
  begin: "start",
  entry: "start",
  process: "step",
  action: "step",
  task: "step",
  subprocess: "sub",
  subflow: "sub",
  comment: "note",
  sticky: "note",
  condition: "decision",
  branch: "decision",
  if: "decision",
  gateway: "decision",
};

const ACTOR_ALIASES: Record<string, Actor> = {
  thirdparty: "carrier",
  third_party: "carrier",
  "third-party": "carrier",
  "3pl": "carrier",
  courier: "carrier",
  shipping: "carrier",
  naif: "lab",
  qc: "lab",
  inspection: "lab",
  buyer: "customer",
  client: "customer",
  user: "customer",
  supplier: "seller",
  vendor: "seller",
  merchant: "seller",
  automated: "system",
  automatic: "system",
  bot: "system",
  ops: "revibe",
  agent: "revibe",
  team: "revibe",
};

const VALID_TYPES = new Set<string>(["start", "step", "decision", "sub", "ok", "fail", "note"]);
const VALID_ACTORS = new Set<string>([
  "customer",
  "revibe",
  "seller",
  "system",
  "carrier",
  "lab",
]);

/** Bring an imported node onto the schema the renderer actually understands. */
function coerceNodeShape(node: FlowNode): FlowNode {
  let next = node;

  const rawType = String(next.type ?? "").toLowerCase().trim();
  if (!VALID_TYPES.has(rawType)) {
    // Unknown but recognisable → the type it means. Unknown and unrecognisable → "step",
    // which is what it already rendered as, but now the document says so honestly.
    next = { ...next, type: TYPE_ALIASES[rawType] ?? "step" };
  } else if (rawType !== next.type) {
    next = { ...next, type: rawType as NodeType };
  }

  if (next.actor !== undefined) {
    const rawActor = String(next.actor).toLowerCase().trim();
    if (!VALID_ACTORS.has(rawActor)) {
      const mapped = ACTOR_ALIASES[rawActor];
      // Drop an unmappable actor rather than keep a value that renders as nothing while
      // still reading as "this step has an owner".
      next = mapped ? { ...next, actor: mapped } : { ...next, actor: undefined };
    } else if (rawActor !== next.actor) {
      next = { ...next, actor: rawActor as Actor };
    }
  }

  // A level outside 1-3 filters the node out of every view — it exists and is saved, but
  // can never be seen or reached.
  if (next.level !== undefined && next.level !== 1 && next.level !== 2 && next.level !== 3) {
    next = { ...next, level: DEFAULT_LEVEL };
  }

  // A non-positive or malformed frozen box collapses the card and sends every pathway
  // into its centre. Better to have no frozen size and re-measure.
  if (next.size !== undefined) {
    const s = next.size as { w?: unknown; h?: unknown } | null;
    const ok =
      s &&
      typeof s.w === "number" &&
      typeof s.h === "number" &&
      Number.isFinite(s.w) &&
      Number.isFinite(s.h) &&
      s.w > 0 &&
      s.h > 0;
    if (!ok) {
      const { size, ...rest } = next;
      void size;
      next = rest;
    }
  }

  // NaN coordinates put a card nowhere and poison computeBounds, so fit-to-view and
  // export break for the whole diagram, not just this node.
  if (!Number.isFinite(next.x)) next = { ...next, x: 0 };
  if (!Number.isFinite(next.y)) next = { ...next, y: 0 };

  return next;
}

function migrateNodeFields(
  node: FlowNode & { newOmsStage?: string; return_internal_stage?: string; return_external_stage?: string }
): FlowNode {
  let next: FlowNode & { newOmsStage?: string } = node;

  // newOmsStage → stage (only when nothing better is set).
  if (!next.stage && !next.internalStage && !next.externalStage && next.newOmsStage) {
    next = { ...next, stage: next.newOmsStage };
  }

  // snake_case aliases → camelCase, so JSON exports written by hand still work.
  if (!next.internalStage && node.return_internal_stage) {
    next = { ...next, internalStage: node.return_internal_stage };
  }
  if (!next.externalStage && node.return_external_stage) {
    next = { ...next, externalStage: node.return_external_stage };
  }

  // stage + stageKind → internalStage / externalStage.
  if (!next.internalStage && !next.externalStage && next.stage) {
    const kind = (next.stageKind || "").toString().toLowerCase();
    const both = kind === "is+es" || kind === "" || kind === "both";
    const isInternal = both || kind === "is" || kind === "internal";
    const isExternal = both || kind === "es" || kind === "external";
    next = {
      ...next,
      internalStage: isInternal ? next.stage : next.internalStage,
      externalStage: isExternal ? next.stage : next.externalStage,
    };
  }

  return next;
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

/* --------------------------- unsaved recovery -------------------------- */

/**
 * A document that failed to reach the server, kept aside so the next session can offer
 * it back.
 *
 * The ordinary cache is not enough: it lives under the same key the cloud read writes
 * to, so the next successful load overwrote the very work that had not been saved, and
 * an editing session that ended during an outage was simply gone with nothing to say so.
 * This stash sits under its own key and is only ever cleared by a successful save or by
 * the user declining it.
 */
export interface UnsavedWork {
  data: FlowData;
  at: string;
}

const unsavedKey = (slug: string) => `flowchart-${slug}-unsaved`;

export function stashUnsaved(slug: string, data: FlowData): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(unsavedKey(slug), JSON.stringify({ data, at: new Date().toISOString() }));
  } catch {}
}

export function getUnsaved(slug: string): UnsavedWork | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(unsavedKey(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.data && Array.isArray(parsed.data.nodes)) {
      return { data: normalize(parsed.data), at: String(parsed.at || "") };
    }
  } catch {}
  return null;
}

export function clearUnsaved(slug: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(unsavedKey(slug));
  } catch {}
}

/** Instant initial data for first paint: cache → builtin default → null-for-custom starter. */
export function getInitialData(slug: string): FlowData {
  return getCachedData(slug) || getDefaultData(slug);
}

/* ----------------------------- cloud reads ----------------------------- */

/** Fetches the authoritative document from the cloud. Returns null if it doesn't exist there yet. */
/**
 * The outcome of reading a document from the cloud.
 *
 * "absent" and "error" must stay distinguishable. They were both `null`, and the caller
 * reasonably read that as "nothing is stored here, seed it" — so a failed request caused
 * the starter template to be written over a real document. Only a definite 404 now means
 * absent; every other outcome, including a 200 whose body cannot be parsed, is an error.
 */
export type CloudRead =
  | { status: "ok"; data: FlowData }
  | { status: "absent" }
  | { status: "error" };

export async function readCloudDoc(slug: string): Promise<CloudRead> {
  try {
    const res = await fetch(`/api/flowcharts/${slug}`, { cache: "no-store" });
    if (res.status === 404) return { status: "absent" };
    if (!res.ok) return { status: "error" };
    const json = await res.json();
    const fc = json.flowchart;
    if (fc && Array.isArray(fc.nodes)) {
      const data = normalize({ nodes: fc.nodes, connections: fc.connections || [] });
      cacheData(slug, data);
      return { status: "ok", data };
    }
    return { status: "error" };
  } catch {
    return { status: "error" };
  }
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
  // `undefined` title = "save the document, leave the name alone". Only an explicit
  // title (or one we genuinely know from the gallery cache) is sent; guessing `slug`
  // here is how autosaves used to rename diagrams behind the user's back. The server
  // treats a missing title as a document-only update.
  const title = meta?.title || known?.title;
  const description = meta?.description ?? known?.description;
  const color = meta?.color || known?.color || (BUILTIN_SLUGS.has(slug) ? "bg-emerald-700" : "bg-purple-700");
  const isCustom = meta?.isCustom ?? known?.isCustom ?? !BUILTIN_SLUGS.has(slug);

  if (meta && typeof window !== "undefined") {
    try {
      const list = getCachedDiagrams();
      const nextList = list.map((d) =>
        d.slug === slug
          ? {
              ...d,
              // Never downgrade a known name to a placeholder in the gallery either.
              title: title ?? d.title,
              description: description ?? d.description,
              color,
              isCustom,
              nodeCount: data.nodes.length,
              updatedAt: new Date().toISOString(),
            }
          : d
      );
      if (!list.some((d) => d.slug === slug)) {
        nextList.push({
          slug,
          title: title ?? slug,
          description: description ?? "",
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
        // Omitted entirely when unknown — see the note above.
        ...(title ? { title } : {}),
        ...(description !== undefined ? { description } : {}),
        nodes: data.nodes,
        connections: data.connections,
        color,
        isCustom,
      }),
    });
    // Keep a copy of anything that did not land, so the next session can offer it back
    // instead of the cloud read quietly replacing it.
    if (res.ok) clearUnsaved(slug);
    else stashUnsaved(slug, data);
    return res.ok;
  } catch {
    stashUnsaved(slug, data);
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
  // The cloud row wins for everything the user can edit. This used to keep the
  // hardcoded BUILTIN_DIAGRAMS title/description/color and take only nodeCount and
  // updatedAt from the cloud, which silently reverted every rename of a builtin: the
  // POST reached Supabase, then the next list fetch overwrote it again. The constants
  // are a seed and an offline fallback, not the source of truth. `isCustom` still comes
  // from BUILTIN_SLUGS so a renamed builtin keeps its grouping and stays unarchivable.
  const builtin = BUILTIN_DIAGRAMS.map((b) => {
    const c = cloudBySlug.get(b.slug);
    if (!c) return b;
    return {
      ...b,
      title: c.title || b.title,
      description: c.description ?? b.description,
      color: c.color || b.color,
      nodeCount: c.nodeCount ?? b.nodeCount,
      updatedAt: c.updatedAt,
    };
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

  // Metadata-only PATCH. This used to call saveToCloud, which writes the whole document,
  // with `getCachedData(slug) || getDefaultData(slug)` as the nodes — so renaming a
  // diagram from the list pushed whatever that browser had cached (or the 24-node builtin
  // starter, if it had never opened it) over the live document. Renames must never carry
  // node data; the editor is the only writer of nodes.
  try {
    const res = await fetch(`/api/flowcharts/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: updatedMeta.title,
        description: updatedMeta.description,
        color: updatedMeta.color,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function resetToDefault(slug: string): Promise<FlowData> {
  const data = getDefaultData(slug);
  await saveToCloud(slug, data);
  return data;
}
