"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { FlowNode, FlowConnection, FlowData, NodeType, ConnType, Op, Collaborator, Port, TextPosition } from "@/lib/types";
import {
  getDefaultData,
  getCachedData,
  fetchCloudData,
  saveToCloud,
  resetToDefault,
  generateNodeId,
  updateDiagramMetadata,
} from "@/lib/diagram-store";
import { applyOp, connId, newConnId } from "@/lib/ops";
import { computeBounds, autoLayout, resolveOverlaps, Size } from "@/lib/graph";
import { LayoutPrefs, loadLayoutPrefs, saveLayoutPrefs, DEFAULT_PREFS } from "@/lib/layout-prefs";
import { buildDiagramSVG } from "@/lib/export-svg";
import { NODE_COLOR_PRESETS } from "@/lib/node-colors";
import { getUser } from "@/lib/user";
import { useRealtimeDoc } from "@/hooks/useRealtimeDoc";
import { saveVersion } from "@/lib/versions";
import FlowNodeCard from "./FlowNodeCard";
import Connections from "./Connections";
import EditModal from "./EditModal";
import ContextMenu, { ContextMenuItem } from "./ContextMenu";
import ProcessHandoverForm from "./ProcessHandoverForm";
import Minimap from "./Minimap";
import ShortcutsHelp from "./ShortcutsHelp";
import PresenceBar from "./PresenceBar";
import NamePrompt from "./NamePrompt";
import ThemeToggle from "./ThemeToggle";
import AIGenerateModal from "./AIGenerateModal";
import VersionHistory from "./VersionHistory";
import LayoutPanel from "./LayoutPanel";

interface FlowCanvasProps {
  slug: string;
  title: string;
  subtitle: string;
  exportFilename?: string;
  /** View-only mode: navigation works, editing is disabled. */
  readOnly?: boolean;
}

const GRID = 16;
const snapVal = (v: number, on: boolean) => (on ? Math.round(v / GRID) * GRID : Math.round(v));

// Collaborative flowchart editor: cloud-synced, live multi-user, full keyboard + editing suite.
export default function FlowCanvas({ slug, title, subtitle, exportFilename, readOnly = false }: FlowCanvasProps) {
  const [user, setUser] = useState<Collaborator | null>(null);
  const [askName, setAskName] = useState(false);

  // Initial state must be deterministic across server/client to avoid hydration mismatch;
  // cache and cloud are loaded after mount in the effect below.
  const [data, setData] = useState<FlowData>(() => getDefaultData(slug));
  const dataRef = useRef<FlowData>(data);
  const [loaded, setLoaded] = useState(false);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selRef = useRef<string[]>([]);
  const [selectedConn, setSelectedConn] = useState<string | null>(null);
  const selectedConnRef = useRef<string | null>(null);

  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const viewRef = useRef({ pan, zoom });
  viewRef.current = { pan, zoom };

  const [tool, setTool] = useState<"select" | "pan">("select");
  const [snap, setSnap] = useState(false);
  const [viewMode, setViewMode] = useState<"standard" | "detailed">("standard");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "offline">("saved");

  const [sizes, setSizes] = useState<Map<string, Size>>(new Map());
  const [editNode, setEditNode] = useState<FlowNode | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const [showHandover, setShowHandover] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [showLayoutPanel, setShowLayoutPanel] = useState(false);
  const [layoutPrefs, setLayoutPrefs] = useState<LayoutPrefs>(DEFAULT_PREFS);
  const layoutPrefsRef = useRef<LayoutPrefs>(layoutPrefs);
  layoutPrefsRef.current = layoutPrefs;
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [ghost, setGhost] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [labelEdit, setLabelEdit] = useState<{ id: string; sx: number; sy: number; value: string } | null>(null);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });

  const cwRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dragRef = useRef<{ sx: number; sy: number; origins: Map<string, { x: number; y: number }>; start: FlowData; moved: boolean } | null>(null);
  const panDragRef = useRef<{ sx: number; sy: number } | null>(null);
  const connectRef = useRef<{ fromId: string; fromPort: Port; startX: number; startY: number } | null>(null);
  const marqueeRef = useRef<{ sx: number; sy: number } | null>(null);
  const spaceRef = useRef(false);
  const histRef = useRef<{ past: FlowData[]; future: FlowData[] }>({ past: [], future: [] });
  const [, setHistVer] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSnapshotRef = useRef(0);
  const clipboardRef = useRef<{ nodes: FlowNode[]; conns: FlowConnection[] } | null>(null);
  const lastMoveBcast = useRef(0);
  const nudgeTs = useRef(0);
  const fitRef = useRef<() => void>(() => {});

  const [projectTitle, setProjectTitle] = useState(title);
  const [projectSubtitle, setProjectSubtitle] = useState(subtitle);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState(title);
  const [tempSubtitle, setTempSubtitle] = useState(subtitle);

  useEffect(() => {
    setProjectTitle(title);
    setTempTitle(title);
  }, [title]);

  useEffect(() => {
    setProjectSubtitle(subtitle);
    setTempSubtitle(subtitle);
  }, [subtitle]);

  /* ------------------------------ identity ----------------------------- */
  useEffect(() => {
    const u = getUser();
    if (u) setUser(u);
    else setAskName(true);
  }, []);

  /* --------------------------- realtime sync --------------------------- */
  const applyRemote = useCallback((op: Op) => {
    const next = applyOp(dataRef.current, op);
    dataRef.current = next;
    setData(next);
  }, []);
  // Per-tab client id: echo-suppression must be per editing session, not per user,
  // so the same person in two tabs still sees each other's live edits.
  const clientIdRef = useRef<string>("c_" + Math.random().toString(36).slice(2) + Date.now().toString(36));
  const { peers, status, broadcast } = useRealtimeDoc({
    slug,
    user,
    clientId: clientIdRef.current,
    onRemoteOp: applyRemote,
  });
  const bc = useCallback(
    (op: Op | Op[]) => {
      (Array.isArray(op) ? op : [op]).forEach(broadcast);
    },
    [broadcast]
  );
  const uid = clientIdRef.current;

  /* ------------------------------ history ------------------------------ */
  const record = useCallback((prev: FlowData) => {
    const h = histRef.current;
    h.past.push(prev);
    if (h.past.length > 80) h.past.shift();
    h.future = [];
    setHistVer((v) => v + 1);
  }, []);

  // Author name for version snapshots (kept in a ref to avoid re-creating callbacks).
  const userRef = useRef<Collaborator | null>(user);
  userRef.current = user;

  const snapshotNow = useCallback(
    (label?: string) => {
      lastSnapshotRef.current = Date.now();
      void saveVersion(slug, dataRef.current, { author: userRef.current?.name, label });
    },
    [slug]
  );

  const scheduleSave = useCallback(() => {
    setSaveStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const ok = await saveToCloud(slug, dataRef.current, { title: projectTitle, description: projectSubtitle });
      setSaveStatus(ok ? "saved" : "offline");
      // Auto-snapshot at most once every 3 minutes of active editing.
      const SNAP_INTERVAL = 180_000;
      if (Date.now() - lastSnapshotRef.current > SNAP_INTERVAL) {
        lastSnapshotRef.current = Date.now();
        void saveVersion(slug, dataRef.current, { author: userRef.current?.name });
      }
    }, 650);
  }, [slug, projectTitle, projectSubtitle]);

  const setTransient = useCallback((producer: (d: FlowData) => FlowData) => {
    const next = producer(dataRef.current);
    dataRef.current = next;
    setData(next);
  }, []);

  const commit = useCallback(
    (producer: (d: FlowData) => FlowData, ops: Op[]) => {
      if (readOnly) return; // view-only: block all local mutations at the source
      const prev = dataRef.current;
      const next = producer(prev);
      record(prev);
      dataRef.current = next;
      setData(next);
      scheduleSave();
      bc(ops);
    },
    [record, scheduleSave, bc, readOnly]
  );

  const select = useCallback((ids: string[]) => {
    selRef.current = ids;
    setSelectedIds(ids);
    if (ids.length) {
      selectedConnRef.current = null;
      setSelectedConn(null);
    }
  }, []);
  const selectConn = useCallback((id: string | null) => {
    selectedConnRef.current = id;
    setSelectedConn(id);
    if (id) select([]);
  }, [select]);

  /* ------------------------- layout preferences ------------------------ */
  useEffect(() => {
    setLayoutPrefs(loadLayoutPrefs(slug));
  }, [slug]);

  const updateLayoutPrefs = useCallback(
    (next: LayoutPrefs) => {
      setLayoutPrefs(next);
      saveLayoutPrefs(slug, next);
    },
    [slug]
  );

  /* --------------------------- cloud load ------------------------------ */
  useEffect(() => {
    let cancelled = false;
    // Navigating between diagrams reuses this component (same route), so reset per-slug view state.
    setLoaded(false);
    // Instant paint from local cache (post-mount, so no hydration mismatch).
    const cached = getCachedData(slug);
    if (cached) {
      dataRef.current = cached;
      setData(cached);
    }
    (async () => {
      const cloud = await fetchCloudData(slug);
      if (cancelled) return;
      if (cloud) {
        dataRef.current = cloud;
        setData(cloud);
      } else if (!cached) {
        // First time this diagram is opened anywhere — seed the cloud.
        saveToCloud(slug, dataRef.current, { title, description: subtitle });
      }
      setLoaded(true);
      // Fit after node sizes have been measured (rAF + short delay covers the measurement pass).
      setTimeout(() => fitRef.current(), 180);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  /* --------------------------- measurement ----------------------------- */
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const next = new Map<string, Size>();
      const root = canvasRef.current;
      if (root) {
        data.nodes.forEach((n) => {
          const el = root.querySelector(`[data-node-id="${n.id}"]`) as HTMLElement | null;
          if (el) next.set(n.id, { w: el.offsetWidth, h: el.offsetHeight });
        });
      }
      setSizes(next);
    });
    return () => cancelAnimationFrame(raf);
  }, [data, viewMode]);

  /* ----------------------- viewport size tracking ---------------------- */
  useEffect(() => {
    const update = () => {
      if (cwRef.current) {
        const r = cwRef.current.getBoundingClientRect();
        setViewport({ w: r.width, h: r.height });
      }
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  /* ------------------------------ helpers ------------------------------ */
  const screenToWorld = useCallback((clientX: number, clientY: number) => {
    const r = cwRef.current!.getBoundingClientRect();
    const { pan, zoom } = viewRef.current;
    return { x: (clientX - r.left - pan.x) / zoom, y: (clientY - r.top - pan.y) / zoom };
  }, []);

  const computeFit = useCallback(
    (subset?: FlowNode[]) => {
      const ns = subset && subset.length ? subset : dataRef.current.nodes;
      const b = computeBounds(ns, sizes);
      if (!b || !cwRef.current) return;
      const r = cwRef.current.getBoundingClientRect();
      const pad = 90;
      const z = Math.min((r.width - pad * 2) / b.w, (r.height - pad * 2) / b.h, 1.6);
      const nz = Math.max(0.1, Math.min(z, 2));
      setZoom(nz);
      setPan({
        x: r.width / 2 - (b.minX + b.w / 2) * nz,
        y: r.height / 2 - (b.minY + b.h / 2) * nz,
      });
    },
    [sizes]
  );
  const fitView = useCallback(() => computeFit(), [computeFit]);
  fitRef.current = fitView;

  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    const { pan, zoom } = viewRef.current;
    const nz = Math.max(0.1, Math.min(3, zoom * factor));
    setPan({ x: cx - (cx - pan.x) * (nz / zoom), y: cy - (cy - pan.y) * (nz / zoom) });
    setZoom(nz);
  }, []);

  const recenterWorld = useCallback((wx: number, wy: number) => {
    const r = cwRef.current!.getBoundingClientRect();
    const { zoom } = viewRef.current;
    setPan({ x: r.width / 2 - wx * zoom, y: r.height / 2 - wy * zoom });
  }, []);

  /* ------------------------------ mutations ---------------------------- */
  const addNode = useCallback(
    (type: NodeType, at?: { x: number; y: number }, openEdit = false) => {
      const labels: Record<NodeType, string> = {
        start: "Start",
        step: "New Step",
        decision: "Decision?",
        sub: "Sub-process",
        ok: "Success",
        fail: "Failed",
        note: "Write a comment...",
      };
      let pos = at;
      if (!pos) {
        const r = cwRef.current!.getBoundingClientRect();
        const { pan, zoom } = viewRef.current;
        pos = { x: (r.width / 2 - pan.x) / zoom - 105, y: (r.height / 2 - pan.y) / zoom - 42 };
      }
      const n: FlowNode = {
        id: generateNodeId(),
        type,
        x: snapVal(pos.x, snap),
        y: snapVal(pos.y, snap),
        label: labels[type],
        detail: "",
      };
      commit((prev) => ({ ...prev, nodes: [...prev.nodes, n] }), [{ t: "node.upsert", origin: uid, node: n }]);
      select([n.id]);
      if (openEdit) setEditNode(n);
    },
    [commit, select, snap, uid]
  );

  const saveNode = useCallback(
    (updated: FlowNode) => {
      commit(
        (prev) => ({ ...prev, nodes: prev.nodes.map((n) => (n.id === updated.id ? updated : n)) }),
        [{ t: "node.upsert", origin: uid, node: updated }]
      );
      setEditNode(null);
    },
    [commit, uid]
  );

  const deleteSelection = useCallback(() => {
    const ids = selRef.current;
    const cid = selectedConnRef.current;
    if (!ids.length && !cid) return;
    const ops: Op[] = [];
    commit(
      (prev) => {
        let nodes = prev.nodes;
        let connections = prev.connections;
        if (ids.length) {
          const set = new Set(ids);
          nodes = nodes.filter((n) => !set.has(n.id));
          connections = connections.filter((c) => !set.has(c.from) && !set.has(c.to));
          ids.forEach((id) => ops.push({ t: "node.delete", origin: uid, id }));
        }
        if (cid) {
          connections = connections.filter((c) => connId(c) !== cid);
          ops.push({ t: "conn.delete", origin: uid, id: cid });
        }
        return { nodes, connections };
      },
      ops
    );
    select([]);
    selectConn(null);
    setEditNode(null);
  }, [commit, select, selectConn, uid]);

  const duplicateNodes = useCallback(
    (ids: string[]) => {
      const src = dataRef.current.nodes.filter((n) => ids.includes(n.id));
      if (!src.length) return;
      const idMap = new Map<string, string>();
      const newNodes = src.map((n) => {
        const nid = generateNodeId();
        idMap.set(n.id, nid);
        return { ...n, id: nid, x: n.x + 40, y: n.y + 40 };
      });
      const set = new Set(ids);
      const newConns = dataRef.current.connections
        .filter((c) => set.has(c.from) && set.has(c.to))
        .map((c) => ({ ...c, id: newConnId(), from: idMap.get(c.from)!, to: idMap.get(c.to)! }));
      commit(
        (prev) => ({ nodes: [...prev.nodes, ...newNodes], connections: [...prev.connections, ...newConns] }),
        [
          ...newNodes.map((n) => ({ t: "node.upsert" as const, origin: uid, node: n })),
          ...newConns.map((c) => ({ t: "conn.upsert" as const, origin: uid, conn: c })),
        ]
      );
      select(newNodes.map((n) => n.id));
    },
    [commit, select, uid]
  );

  const copySelection = useCallback(() => {
    const nodes = dataRef.current.nodes.filter((n) => selRef.current.includes(n.id));
    if (!nodes.length) return;
    const set = new Set(nodes.map((n) => n.id));
    const conns = dataRef.current.connections.filter((c) => set.has(c.from) && set.has(c.to));
    clipboardRef.current = { nodes: JSON.parse(JSON.stringify(nodes)), conns: JSON.parse(JSON.stringify(conns)) };
  }, []);

  const paste = useCallback(() => {
    const cb = clipboardRef.current;
    if (!cb || !cb.nodes.length) return;
    const idMap = new Map<string, string>();
    const newNodes = cb.nodes.map((n) => {
      const nid = generateNodeId();
      idMap.set(n.id, nid);
      return { ...n, id: nid, x: n.x + 40, y: n.y + 40 };
    });
    const newConns = cb.conns.map((c) => ({ ...c, id: newConnId(), from: idMap.get(c.from)!, to: idMap.get(c.to)! }));
    commit(
      (prev) => ({ nodes: [...prev.nodes, ...newNodes], connections: [...prev.connections, ...newConns] }),
      [
        ...newNodes.map((n) => ({ t: "node.upsert" as const, origin: uid, node: n })),
        ...newConns.map((c) => ({ t: "conn.upsert" as const, origin: uid, conn: c })),
      ]
    );
    select(newNodes.map((n) => n.id));
  }, [commit, select, uid]);

  const runAutoLayout = useCallback(() => {
    const laid = autoLayout(dataRef.current.nodes, dataRef.current.connections, sizes, layoutPrefsRef.current);
    // Drop hand-set ports so each pathway picks the natural side for the NEW layout
    // (stale fromPort/toPort from the old arrangement cause awkward jogs otherwise).
    const conns = dataRef.current.connections.map((c) => {
      if (c.fromPort === undefined && c.toPort === undefined) return c;
      const { fromPort, toPort, ...rest } = c;
      void fromPort;
      void toPort;
      return rest;
    });
    commit(() => ({ nodes: laid, connections: conns }), [
      { t: "doc.replace", origin: uid, nodes: laid, connections: conns },
    ]);
    setTimeout(() => fitView(), 60);
  }, [commit, sizes, uid, fitView]);

  // Nudge only overlapping nodes apart, preserving the current arrangement.
  const runFixOverlaps = useCallback(() => {
    const gap = Math.min(layoutPrefsRef.current.secondaryGap, layoutPrefsRef.current.primaryGap) * 0.5 + layoutPrefsRef.current.margin;
    const fixed = resolveOverlaps(dataRef.current.nodes, sizes, gap);
    commit((prev) => ({ ...prev, nodes: fixed }), [
      { t: "doc.replace", origin: uid, nodes: fixed, connections: dataRef.current.connections },
    ]);
    setTimeout(() => fitView(), 60);
  }, [commit, sizes, uid, fitView]);

  const nudge = useCallback(
    (dx: number, dy: number) => {
      const ids = selRef.current;
      if (!ids.length) return;
      const set = new Set(ids);
      const now = Date.now();
      const coalesce = now - nudgeTs.current < 500;
      nudgeTs.current = now;
      const prev = dataRef.current;
      const nodes = prev.nodes.map((n) => (set.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n));
      if (!coalesce) record(prev);
      const next = { ...prev, nodes };
      dataRef.current = next;
      setData(next);
      scheduleSave();
      bc({ t: "nodes.move", origin: uid, moves: ids.map((id) => { const n = nodes.find((x) => x.id === id)!; return { id, x: n.x, y: n.y }; }) });
    },
    [record, scheduleSave, bc, uid]
  );

  const undo = useCallback(() => {
    const h = histRef.current;
    if (!h.past.length) return;
    const prev = h.past.pop()!;
    h.future.push(dataRef.current);
    dataRef.current = prev;
    setData(prev);
    scheduleSave();
    bc({ t: "doc.replace", origin: uid, nodes: prev.nodes, connections: prev.connections });
    setHistVer((v) => v + 1);
  }, [scheduleSave, bc, uid]);

  const redo = useCallback(() => {
    const h = histRef.current;
    if (!h.future.length) return;
    const next = h.future.pop()!;
    h.past.push(dataRef.current);
    dataRef.current = next;
    setData(next);
    scheduleSave();
    bc({ t: "doc.replace", origin: uid, nodes: next.nodes, connections: next.connections });
    setHistVer((v) => v + 1);
  }, [scheduleSave, bc, uid]);

  const setConnField = useCallback(
    (id: string, patch: Partial<FlowConnection>) => {
      let updated: FlowConnection | null = null;
      commit(
        (prev) => ({
          ...prev,
          connections: prev.connections.map((c) => {
            if (connId(c) !== id) return c;
            updated = { ...c, ...patch };
            return updated;
          }),
        }),
        []
      );
      if (updated) bc({ t: "conn.upsert", origin: uid, conn: updated });
    },
    [commit, bc, uid]
  );

  /* ------------------------- window mouse events ----------------------- */
  const handlersRef = useRef<{ move: (e: MouseEvent) => void; up: (e: MouseEvent) => void }>({
    move: () => {},
    up: () => {},
  });
  handlersRef.current.move = (e: MouseEvent) => {
    if (dragRef.current) {
      const d = dragRef.current;
      const { zoom } = viewRef.current;
      const dx = (e.clientX - d.sx) / zoom;
      const dy = (e.clientY - d.sy) / zoom;
      if (!d.moved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) d.moved = true;
      if (d.moved) {
        setTransient((prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) => {
            const o = d.origins.get(n.id);
            return o ? { ...n, x: snapVal(o.x + dx, snap), y: snapVal(o.y + dy, snap) } : n;
          }),
        }));
        const now = Date.now();
        if (now - lastMoveBcast.current > 55) {
          lastMoveBcast.current = now;
          const moves = [...d.origins.keys()].map((id) => {
            const n = dataRef.current.nodes.find((x) => x.id === id)!;
            return { id, x: n.x, y: n.y };
          });
          bc({ t: "nodes.move", origin: uid, moves });
        }
      }
      return;
    }
    if (panDragRef.current) {
      setPan({ x: e.clientX - panDragRef.current.sx, y: e.clientY - panDragRef.current.sy });
      return;
    }
    if (connectRef.current) {
      const w = screenToWorld(e.clientX, e.clientY);
      setGhost({ x1: connectRef.current.startX, y1: connectRef.current.startY, x2: w.x, y2: w.y });
      return;
    }
    if (marqueeRef.current) {
      const s = screenToWorld(marqueeRef.current.sx, marqueeRef.current.sy);
      const c = screenToWorld(e.clientX, e.clientY);
      setMarquee({ x: Math.min(s.x, c.x), y: Math.min(s.y, c.y), w: Math.abs(c.x - s.x), h: Math.abs(c.y - s.y) });
    }
  };
  handlersRef.current.up = (e: MouseEvent) => {
    if (dragRef.current) {
      const d = dragRef.current;
      if (d.moved) {
        record(d.start);
        scheduleSave();
        const moves = [...d.origins.keys()].map((id) => {
          const n = dataRef.current.nodes.find((x) => x.id === id)!;
          return { id, x: n.x, y: n.y };
        });
        bc({ t: "nodes.move", origin: uid, moves });
      }
      dragRef.current = null;
    }
    if (panDragRef.current) panDragRef.current = null;
    if (connectRef.current) {
      const el = e.target as HTMLElement;
      const portEl = el.closest("[data-port]") as HTMLElement | null;
      const nodeEl = el.closest("[data-node-id]") as HTMLElement | null;
      const targetId = portEl?.dataset.node || nodeEl?.dataset.nodeId;
      if (targetId && targetId !== connectRef.current.fromId) {
        const conn: FlowConnection = {
          id: newConnId(),
          from: connectRef.current.fromId,
          to: targetId,
          label: "",
          type: "",
          fromPort: connectRef.current.fromPort,
          toPort: (portEl?.dataset.port as Port) || undefined,
        };
        commit((prev) => ({ ...prev, connections: [...prev.connections, conn] }), [
          { t: "conn.upsert", origin: uid, conn },
        ]);
      }
      connectRef.current = null;
      setGhost(null);
    }
    if (marqueeRef.current) {
      const m = marquee;
      marqueeRef.current = null;
      setMarquee(null);
      if (m && (m.w > 4 || m.h > 4)) {
        const hits = dataRef.current.nodes
          .filter((n) => {
            const s = sizes.get(n.id) || { w: 210, h: 84 };
            return n.x + s.w >= m.x && n.x <= m.x + m.w && n.y + s.h >= m.y && n.y <= m.y + m.h;
          })
          .map((n) => n.id);
        select(hits);
      }
    }
  };
  useEffect(() => {
    const mv = (e: MouseEvent) => handlersRef.current.move(e);
    const up = (e: MouseEvent) => handlersRef.current.up(e);
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", mv);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  /* ------------------------------- wheel ------------------------------- */
  useEffect(() => {
    const cw = cwRef.current;
    if (!cw) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = cw.getBoundingClientRect();
      // Normalize delta across mouse wheels (line units) and trackpads (pixel units)
      // so both feel consistent.
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16; // lines → ~pixels
      else if (e.deltaMode === 2) dy *= r.height; // pages → ~pixels
      // Continuous exponential zoom: small trackpad deltas nudge gently, while a
      // mouse notch still steps a sensible amount. Per-event factor is clamped so a
      // fast flick can't jump the view.
      const factor = Math.min(1.22, Math.max(0.82, Math.exp(-dy * 0.0012)));
      zoomAt(factor, e.clientX - r.left, e.clientY - r.top);
    };
    cw.addEventListener("wheel", onWheel, { passive: false });
    return () => cw.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  /* ----------------------------- keyboard ------------------------------ */
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    const typing = t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable;
    if (typing) {
      if (e.key === "Escape") (t as HTMLElement).blur();
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();

    if (k === " ") {
      spaceRef.current = true;
      return;
    }
    if (mod && k === "z") {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
      return;
    }
    if (mod && k === "y") {
      e.preventDefault();
      redo();
      return;
    }
    if (mod && k === "a") {
      e.preventDefault();
      select(dataRef.current.nodes.map((n) => n.id));
      return;
    }
    if (mod && k === "c") {
      copySelection();
      return;
    }
    if (mod && k === "x") {
      copySelection();
      deleteSelection();
      return;
    }
    if (mod && k === "v") {
      paste();
      return;
    }
    if (mod && k === "d") {
      e.preventDefault();
      duplicateNodes(selRef.current);
      return;
    }
    if (mod && k === "s") {
      e.preventDefault();
      scheduleSave();
      return;
    }
    if (mod && k === "l") {
      e.preventDefault();
      runAutoLayout();
      return;
    }
    if (mod && (k === "=" || k === "+")) {
      e.preventDefault();
      const r = cwRef.current!.getBoundingClientRect();
      zoomAt(1.2, r.width / 2, r.height / 2);
      return;
    }
    if (mod && k === "-") {
      e.preventDefault();
      const r = cwRef.current!.getBoundingClientRect();
      zoomAt(0.8, r.width / 2, r.height / 2);
      return;
    }
    if (mod && k === "0") {
      e.preventDefault();
      setZoom(1);
      return;
    }
    if (e.shiftKey && k === "!") {
      fitView();
      return;
    } // Shift+1
    if (e.shiftKey && k === "@") {
      const sel = dataRef.current.nodes.filter((n) => selRef.current.includes(n.id));
      computeFit(sel);
      return;
    } // Shift+2
    if (k === "v" && !mod) setTool("select");
    if (k === "h" && !mod) setTool("pan");
    if (k === "g" && !mod) setSnap((s) => !s);
    if (k === "c" && !mod) addNode("note");
    if ((k === "?" || k === "/") && !mod) {
      setShowHelp((s) => !s);
      return;
    }
    if ((k === "delete" || k === "backspace") && !mod) {
      e.preventDefault();
      deleteSelection();
      return;
    }
    if (k === "enter" && selRef.current.length === 1 && !readOnly) {
      const n = dataRef.current.nodes.find((x) => x.id === selRef.current[0]);
      if (n) setEditNode(n);
      return;
    }
    if (k === "escape") {
      setCtxMenu(null);
      setShowHelp(false);
      setShowExport(false);
      select([]);
      selectConn(null);
      return;
    }
    const step = e.shiftKey ? 10 : 1;
    if (k === "arrowup") {
      e.preventDefault();
      nudge(0, -step);
    } else if (k === "arrowdown") {
      e.preventDefault();
      nudge(0, step);
    } else if (k === "arrowleft") {
      e.preventDefault();
      nudge(-step, 0);
    } else if (k === "arrowright") {
      e.preventDefault();
      nudge(step, 0);
    }
  };
  useEffect(() => {
    const kd = (e: KeyboardEvent) => keyRef.current(e);
    const ku = (e: KeyboardEvent) => {
      if (e.key === " ") spaceRef.current = false;
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, []);

  /* -------------------------- canvas handlers -------------------------- */
  const onCanvasMouseDown = (e: React.MouseEvent) => {
    const isBg = e.target === cwRef.current || e.target === canvasRef.current || (e.target as HTMLElement).tagName === "svg";
    if (!isBg) return;
    if (tool === "pan" || spaceRef.current || e.button === 1) {
      panDragRef.current = { sx: e.clientX - pan.x, sy: e.clientY - pan.y };
    } else {
      if (!e.shiftKey) {
        select([]);
        selectConn(null);
      }
      marqueeRef.current = { sx: e.clientX, sy: e.clientY };
    }
  };

  const onCanvasDoubleClick = (e: React.MouseEvent) => {
    if (readOnly) return;
    const isBg = e.target === cwRef.current || e.target === canvasRef.current || (e.target as HTMLElement).tagName === "svg";
    if (!isBg) return;
    const w = screenToWorld(e.clientX, e.clientY);
    addNode("step", { x: w.x - 105, y: w.y - 42 }, true);
  };

  const onNodeMouseDown = (e: React.MouseEvent, node: FlowNode) => {
    if (readOnly) {
      // Allow selection for inspection, but no dragging.
      select(e.shiftKey ? [...new Set([...selRef.current, node.id])] : [node.id]);
      return;
    }
    let ids: string[];
    if (e.shiftKey) {
      ids = selRef.current.includes(node.id)
        ? selRef.current.filter((id) => id !== node.id)
        : [...selRef.current, node.id];
    } else {
      ids = selRef.current.includes(node.id) ? selRef.current : [node.id];
    }
    select(ids);
    selectConn(null);
    const origins = new Map<string, { x: number; y: number }>();
    ids.forEach((id) => {
      const n = dataRef.current.nodes.find((x) => x.id === id);
      if (n) origins.set(id, { x: n.x, y: n.y });
    });
    if (!origins.has(node.id)) origins.set(node.id, { x: node.x, y: node.y });
    dragRef.current = { sx: e.clientX, sy: e.clientY, origins, start: dataRef.current, moved: false };
  };

  const onPortMouseDown = (e: React.MouseEvent, node: FlowNode, port: string) => {
    if (readOnly) return;
    const s = sizes.get(node.id) || { w: 210, h: 84 };
    const pos =
      port === "top"
        ? { x: node.x + s.w / 2, y: node.y }
        : port === "bottom"
        ? { x: node.x + s.w / 2, y: node.y + s.h }
        : port === "left"
        ? { x: node.x, y: node.y + s.h / 2 }
        : { x: node.x + s.w, y: node.y + s.h / 2 };
    connectRef.current = { fromId: node.id, fromPort: port as Port, startX: pos.x, startY: pos.y };
    setGhost({ x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y });
  };

  const openLabelEdit = useCallback(
    (id: string) => {
      const c = dataRef.current.connections.find((x) => connId(x) === id);
      if (!c) return;
      const fn = dataRef.current.nodes.find((n) => n.id === c.from);
      const tn = dataRef.current.nodes.find((n) => n.id === c.to);
      if (!fn || !tn) return;
      const fs = sizes.get(fn.id) || { w: 210, h: 84 };
      const ts = sizes.get(tn.id) || { w: 210, h: 84 };
      const mx = (fn.x + fs.w / 2 + tn.x + ts.w / 2) / 2;
      const my = (fn.y + fs.h / 2 + tn.y + ts.h / 2) / 2;
      const { pan, zoom } = viewRef.current;
      const r = cwRef.current!.getBoundingClientRect();
      setLabelEdit({ id, sx: r.left + mx * zoom + pan.x, sy: r.top + my * zoom + pan.y, value: c.label || "" });
    },
    [sizes]
  );

  /* ---------------------------- context menus -------------------------- */
  const setNodesColor = useCallback(
    (ids: string[], color?: string) => {
      const set = new Set(ids);
      const ops: Op[] = [];
      commit(
        (prev) => {
          const nodes = prev.nodes.map((n) => {
            if (set.has(n.id)) {
              const updated = { ...n, color: color || undefined };
              ops.push({ t: "node.upsert", origin: uid, node: updated });
              return updated;
            }
            return n;
          });
          return { ...prev, nodes };
        },
        ops
      );
    },
    [commit, uid]
  );

  const setNodesTextPosition = useCallback(
    (ids: string[], textPosition: TextPosition) => {
      const set = new Set(ids);
      const ops: Op[] = [];
      commit(
        (prev) => {
          const nodes = prev.nodes.map((n) => {
            if (set.has(n.id)) {
              const updated = { ...n, textPosition };
              ops.push({ t: "node.upsert", origin: uid, node: updated });
              return updated;
            }
            return n;
          });
          return { ...prev, nodes };
        },
        ops
      );
    },
    [commit, uid]
  );

  const handleSaveTitle = async () => {
    const t = tempTitle.trim() || "Process Flowchart";
    const s = tempSubtitle.trim();
    setProjectTitle(t);
    setProjectSubtitle(s);
    setIsEditingTitle(false);
    if (typeof document !== "undefined") {
      document.title = `${t} | Process Mapping`;
    }
    await updateDiagramMetadata(slug, { title: t, description: s });
    scheduleSave();
  };

  const setNodePathwaysBold = useCallback(
    (nodeIds: string[], bold: boolean) => {
      const nodeSet = new Set(nodeIds);
      const updatedConns: FlowConnection[] = [];
      commit(
        (prev) => {
          const connections = prev.connections.map((c) => {
            if (nodeSet.has(c.from) || nodeSet.has(c.to)) {
              const updated = { ...c, bold };
              updatedConns.push(updated);
              return updated;
            }
            return c;
          });
          return { ...prev, connections };
        },
        updatedConns.map((c) => ({ t: "conn.upsert", origin: uid, conn: c }))
      );
    },
    [commit, uid]
  );

  const nodeContextMenu = (e: React.MouseEvent, node: FlowNode) => {
    e.preventDefault();
    if (!selRef.current.includes(node.id)) select([node.id]);
    const targetIds = selRef.current.includes(node.id) && selRef.current.length > 1 ? selRef.current : [node.id];
    const isMultiple = targetIds.length > 1;

    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: isMultiple ? `Edit First Node` : "Edit Node Details", action: () => setEditNode(node) },
        { header: `Quick Color (${targetIds.length} node${targetIds.length > 1 ? "s" : ""})` },
        {
          swatches: [
            { id: "default", fill: "#71717a", name: "Default", onClick: () => setNodesColor(targetIds, "") },
            ...NODE_COLOR_PRESETS.slice(0, 10).map((c) => ({
              id: c.id,
              fill: c.fill,
              name: c.name,
              onClick: () => setNodesColor(targetIds, c.id),
            })),
          ],
        },
        { separator: true },
        { header: "Text Position" },
        { label: "Inside Shape", action: () => setNodesTextPosition(targetIds, "inside") },
        { label: "Top (Above)", action: () => setNodesTextPosition(targetIds, "top") },
        { label: "Bottom (Below)", action: () => setNodesTextPosition(targetIds, "bottom") },
        { label: "Left of Shape", action: () => setNodesTextPosition(targetIds, "left") },
        { label: "Right of Shape", action: () => setNodesTextPosition(targetIds, "right") },
        { separator: true },
        { header: "Pathways" },
        { label: "Bold Connected Pathways", action: () => setNodePathwaysBold(targetIds, true) },
        { label: "Regular Connected Pathways", action: () => setNodePathwaysBold(targetIds, false) },
        { separator: true },
        { label: isMultiple ? `Duplicate (${targetIds.length} Nodes)` : "Duplicate", action: () => duplicateNodes(targetIds) },
        { separator: true },
        { label: isMultiple ? `Delete (${targetIds.length} Nodes)` : "Delete", action: () => deleteSelection(), danger: true },
      ],
    });
  };

  const connContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    selectConn(id);
    const conn = dataRef.current.connections.find((c) => connId(c) === id);
    const isBold = Boolean(conn?.bold);
    const styles: [string, ConnType][] = [
      ["Default", ""],
      ["Yes (green)", "cyes"],
      ["No (red)", "cno"],
      ["Conditional (amber)", "camber"],
    ];
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: "Edit Label", action: () => openLabelEdit(id) },
        { separator: true },
        {
          label: isBold ? "✓ Bold Pathway (Thick)" : "Make Pathway Bold (Thick)",
          action: () => setConnField(id, { bold: !isBold }),
        },
        { separator: true },
        { header: "Pathway Style" },
        ...styles.map(([label, type]) => ({ label: `Style: ${label}`, action: () => setConnField(id, { type }) })),
        { separator: true },
        { label: "Delete Connection", action: () => deleteConn(id), danger: true },
      ],
    });
  };
  const deleteConn = useCallback(
    (id: string) => {
      commit((prev) => ({ ...prev, connections: prev.connections.filter((c) => connId(c) !== id) }), [
        { t: "conn.delete", origin: uid, id },
      ]);
      selectConn(null);
    },
    [commit, selectConn, uid]
  );

  /* ------------------------------ export ------------------------------- */
  const doExportJSON = () => {
    const blob = new Blob([JSON.stringify(dataRef.current, null, 2)], { type: "application/json" });
    triggerDownload(blob, `${exportFilename || slug}.json`);
    setShowExport(false);
  };
  const doExportSVG = () => {
    const { svg } = buildDiagramSVG(dataRef.current.nodes, dataRef.current.connections, sizes);
    triggerDownload(new Blob([svg], { type: "image/svg+xml" }), `${slug}.svg`);
    setShowExport(false);
  };
  const doExportPNG = () => {
    const { svg, width, height } = buildDiagramSVG(dataRef.current.nodes, dataRef.current.connections, sizes);
    const scale = 2;
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (blob) triggerDownload(blob, `${slug}.png`);
      }, "image/png");
    };
    img.src = url;
    setShowExport(false);
  };
  const triggerDownload = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target?.result as string);
        if (Array.isArray(parsed.nodes)) {
          const nodes = parsed.nodes as FlowNode[];
          const connections = (parsed.connections || []) as FlowConnection[];
          commit(() => ({ nodes, connections }), [{ t: "doc.replace", origin: uid, nodes, connections }]);
          setTimeout(() => fitView(), 80);
        } else alert("Invalid flowchart JSON format.");
      } catch {
        alert("Failed to parse flowchart JSON file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleReset = async () => {
    if (!window.confirm("Reset this flowchart to its default template? This affects everyone and cannot be undone.")) return;
    snapshotNow("Before reset");
    const d = await resetToDefault(slug);
    record(dataRef.current);
    dataRef.current = d;
    setData(d);
    bc({ t: "doc.replace", origin: uid, nodes: d.nodes, connections: d.connections });
    setTimeout(() => fitView(), 60);
  };

  // Apply an AI-generated draft: snapshot first, replace, then auto-arrange left-to-right.
  const applyGenerated = useCallback(
    (nodes: FlowNode[], connections: FlowConnection[]) => {
      snapshotNow("Before AI generation");
      commit(() => ({ nodes, connections }), [{ t: "doc.replace", origin: uid, nodes, connections }]);
      // Wait for node sizes to be measured, then arrange and fit.
      setTimeout(() => {
        const laid = autoLayout(dataRef.current.nodes, dataRef.current.connections, sizes, layoutPrefsRef.current);
        commit((prev) => ({ ...prev, nodes: laid }), [
          { t: "doc.replace", origin: uid, nodes: laid, connections: dataRef.current.connections },
        ]);
        setTimeout(() => fitView(), 80);
      }, 350);
    },
    [commit, uid, snapshotNow, sizes, fitView]
  );

  // Restore a version snapshot into the live document (broadcast to peers).
  const restoreVersion = useCallback(
    (restored: FlowData) => {
      record(dataRef.current);
      dataRef.current = restored;
      setData(restored);
      scheduleSave();
      bc({ t: "doc.replace", origin: uid, nodes: restored.nodes, connections: restored.connections });
      setShowHistory(false);
      setTimeout(() => fitView(), 60);
    },
    [record, scheduleSave, bc, uid, fitView]
  );

  const copyViewLink = useCallback(() => {
    if (typeof window === "undefined") return;
    const link = `${window.location.origin}/diagram/${slug}?view=1`;
    navigator.clipboard?.writeText(link).then(
      () => {
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 1800);
      },
      () => {}
    );
  }, [slug]);

  /* ------------------------------- render ------------------------------ */
  return (
    <div className="flex flex-col h-screen bg-zinc-100 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-2.5 bg-white dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 z-50 relative shadow-sm gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <a
            href="/"
            className="w-[34px] h-[34px] bg-emerald-700 dark:bg-emerald-600 rounded-lg flex items-center justify-center text-white font-bold text-base hover:bg-emerald-600 transition-colors shadow-sm shrink-0"
            title="Back to all flowcharts"
          >
            R
          </a>
          <div className="min-w-0">
            {isEditingTitle ? (
              <div className="flex items-center gap-2">
                <div className="flex flex-col gap-1">
                  <input
                    autoFocus
                    type="text"
                    value={tempTitle}
                    onChange={(e) => setTempTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveTitle();
                      if (e.key === "Escape") setIsEditingTitle(false);
                    }}
                    className="px-2.5 py-1 text-sm font-semibold rounded-lg border border-emerald-500 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 outline-none w-64 shadow-xs"
                    placeholder="Flowchart Title"
                  />
                  <input
                    type="text"
                    value={tempSubtitle}
                    onChange={(e) => setTempSubtitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveTitle();
                      if (e.key === "Escape") setIsEditingTitle(false);
                    }}
                    className="px-2.5 py-0.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 outline-none w-64 shadow-xs"
                    placeholder="Description / Subtitle"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleSaveTitle}
                    className="px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setIsEditingTitle(false)}
                    className="px-2 py-1.5 text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => {
                  if (readOnly) return;
                  setTempTitle(projectTitle);
                  setTempSubtitle(projectSubtitle);
                  setIsEditingTitle(true);
                }}
                className={`group/title p-1 -m-1 rounded-lg transition-colors ${
                  readOnly ? "" : "cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700/60"
                }`}
                title={readOnly ? undefined : "Click to edit flowchart name & description"}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-semibold font-display text-zinc-900 dark:text-zinc-100 tracking-tight truncate group-hover/title:text-emerald-700 dark:group-hover/title:text-emerald-400 flex items-center gap-1.5 transition-colors">
                    {projectTitle}
                    {!readOnly && (
                      <svg className="w-3.5 h-3.5 opacity-0 group-hover/title:opacity-80 transition-opacity text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    )}
                  </span>
                  {readOnly ? (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      View only
                    </span>
                  ) : (
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${
                        saveStatus === "saving"
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                          : saveStatus === "offline"
                          ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                          : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                      }`}
                    >
                      {saveStatus === "saving" ? "Saving…" : saveStatus === "offline" ? "Offline" : "Saved"}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-zinc-400 truncate">
                  {projectSubtitle || (!readOnly && <span className="italic opacity-60">Add description...</span>)}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <PresenceBar me={user} peers={peers} status={status} onEditName={() => setAskName(true)} />
          <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700" />

          <div className="flex items-center bg-zinc-100 dark:bg-zinc-900 p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-700">
            <button
              onClick={() => setViewMode("standard")}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                viewMode === "standard"
                  ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              Standard
            </button>
            <button
              onClick={() => setViewMode("detailed")}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1 ${
                viewMode === "detailed"
                  ? "bg-emerald-700 text-white shadow-xs"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
              Detailed
            </button>
          </div>

          {!readOnly && (
            <button
              onClick={() => setShowAI(true)}
              className="px-3 py-1.5 text-xs font-semibold rounded-md text-white bg-gradient-to-br from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 transition-colors shadow-sm flex items-center gap-1.5"
              title="Generate a flowchart from a description"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l1.9 5.1L19 9l-5.1 1.9L12 16l-1.9-5.1L5 9l5.1-1.9L12 2z" />
              </svg>
              AI
            </button>
          )}

          {!readOnly && (
            <button
              onClick={() => setShowHistory(true)}
              className="px-3 py-1.5 text-xs font-semibold border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 rounded-md transition-colors shadow-xs flex items-center gap-1.5"
              title="Version history"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M3 3v5h5M3.05 13A9 9 0 1 0 6 5.3L3 8" />
                <path d="M12 7v5l3 2" />
              </svg>
              History
            </button>
          )}

          {!readOnly && (
            <button
              onClick={() => setShowHandover(true)}
              className="px-3 py-1.5 text-xs font-semibold border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 rounded-md transition-colors shadow-xs flex items-center gap-1"
            >
              📋 Handover
            </button>
          )}

          {/* Export dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExport((s) => !s)}
              className="px-3 py-1.5 text-xs font-medium border border-zinc-300 dark:border-zinc-600 rounded-md bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors flex items-center gap-1"
            >
              Export ▾
            </button>
            {showExport && (
              <>
                <div className="fixed inset-0 z-[290]" onClick={() => setShowExport(false)} />
                <div className="absolute right-0 mt-1 w-40 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl z-[300] p-1">
                  {[
                    ["PNG image", doExportPNG],
                    ["SVG vector", doExportSVG],
                    ["JSON data", doExportJSON],
                  ].map(([label, fn]) => (
                    <button
                      key={label as string}
                      onClick={fn as () => void}
                      className="w-full text-left px-3 py-2 text-[12.5px] rounded-md text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                    >
                      {label as string}
                    </button>
                  ))}
                  <div className="h-px bg-zinc-200 dark:bg-zinc-700 my-1" />
                  <button
                    onClick={() => {
                      fileInputRef.current?.click();
                      setShowExport(false);
                    }}
                    className="w-full text-left px-3 py-2 text-[12.5px] rounded-md text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                  >
                    Import JSON…
                  </button>
                </div>
              </>
            )}
          </div>
          <input type="file" ref={fileInputRef} onChange={handleImportJSON} accept=".json" className="hidden" />

          <button
            onClick={copyViewLink}
            className="px-3 py-1.5 text-xs font-medium border border-zinc-300 dark:border-zinc-600 rounded-md bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors flex items-center gap-1.5"
            title="Copy a view-only link"
          >
            {shareCopied ? (
              <>
                <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" /></svg>
                Copied
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><path d="M16 6l-4-4-4 4" /><path d="M12 2v13" /></svg>
                Share
              </>
            )}
          </button>

          <button
            onClick={fitView}
            className="px-3 py-1.5 text-xs font-medium border border-zinc-300 dark:border-zinc-600 rounded-md bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
          >
            Fit
          </button>

          {!readOnly && (
            <button
              onClick={handleReset}
              className="px-3 py-1.5 text-xs font-medium border border-red-200 dark:border-red-900/50 rounded-md bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
            >
              Reset
            </button>
          )}

          <ThemeToggle />
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={cwRef}
        className="flex-1 relative overflow-hidden"
        onMouseDown={onCanvasMouseDown}
        onDoubleClick={onCanvasDoubleClick}
      >
        <div
          className="absolute inset-0 pointer-events-none z-0"
          style={{
            backgroundImage: "radial-gradient(circle, rgb(200 200 195 / 0.14) 1px, transparent 1px)",
            backgroundSize: `${GRID * zoom}px ${GRID * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
          }}
        />

        <div
          ref={canvasRef}
          className={`absolute top-0 left-0 w-[12000px] h-[12000px] origin-top-left ${
            tool === "pan" || spaceRef.current || panDragRef.current ? "cursor-grabbing" : ""
          }`}
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          <Connections
            nodes={data.nodes}
            connections={data.connections}
            sizes={sizes}
            selectedId={selectedConn}
            onSelect={selectConn}
            onContextMenu={connContextMenu}
            onEditLabel={openLabelEdit}
            ghost={ghost}
          />
          {marquee && (
            <div
              className="absolute border border-emerald-500 bg-emerald-500/10 z-[6] pointer-events-none"
              style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
            />
          )}
          <div className="relative z-10">
            {data.nodes.map((node) => (
              <FlowNodeCard
                key={node.id}
                node={node}
                isSelected={selectedIds.includes(node.id)}
                viewMode={viewMode}
                onMouseDown={(e) => onNodeMouseDown(e, node)}
                onDoubleClick={() => !readOnly && setEditNode(node)}
                onContextMenu={(e) => !readOnly && nodeContextMenu(e, node)}
                onPortMouseDown={(e, port) => onPortMouseDown(e, node, port)}
                onPortMouseUp={() => {}}
                onUpdate={saveNode}
                onDelete={(id) => {
                  select([id]);
                  deleteSelection();
                }}
              />
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="fixed top-[62px] right-3.5 bg-white/95 dark:bg-zinc-800/95 backdrop-blur border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 z-40 shadow-md text-[11px]">
          <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 mb-2">Legend</div>
          <div className="grid grid-cols-1 gap-1.5">
            {[
              ["bg-emerald-700", "Start / Success"],
              ["bg-zinc-700", "Process step"],
              ["bg-amber-700", "Decision"],
              ["bg-blue-700 border border-dashed border-blue-400", "Sub-process"],
              ["bg-red-600", "End (cancelled)"],
            ].map(([cls, label]) => (
              <div key={label} className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                <div className={`w-3 h-3 rounded ${cls} shrink-0`} />
                {label}
              </div>
            ))}
          </div>
        </div>

        {loaded && (
          <Minimap
            nodes={data.nodes}
            sizes={sizes}
            pan={pan}
            zoom={zoom}
            viewportW={viewport.w}
            viewportH={viewport.h}
            onRecenter={recenterWorld}
          />
        )}

        <div className="fixed bottom-20 right-5 flex items-center gap-2 z-40">
          {snap && (
            <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40 px-2 py-1 rounded-md">
              Grid snap
            </span>
          )}
          <span className="text-[11px] text-zinc-400 bg-white dark:bg-zinc-800 px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
        </div>
      </div>

      {/* Bottom toolbar */}
      {!readOnly && (
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-0.5 p-1.5 bg-white/95 dark:bg-zinc-800/95 backdrop-blur border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-xl z-50">
        <ToolBtn active={tool === "select"} onClick={() => setTool("select")} title="Select (V)">
          <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
        </ToolBtn>
        <ToolBtn active={tool === "pan"} onClick={() => setTool("pan")} title="Pan (H / Space)">
          <path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8M22 10v2a10 10 0 0 1-10 10H8" />
        </ToolBtn>
        <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 mx-1" />
        <ToolBtn onClick={() => addNode("step")} title="Add Step">
          <rect x="3" y="3" width="18" height="18" rx="3" />
        </ToolBtn>
        <ToolBtn onClick={() => addNode("decision")} title="Add Decision">
          <path d="M12 2l10 10-10 10L2 12z" />
        </ToolBtn>
        <ToolBtn onClick={() => addNode("sub")} title="Add Sub-process">
          <rect x="3" y="3" width="18" height="18" rx="3" strokeDasharray="4 2" />
        </ToolBtn>
        <ToolBtn onClick={() => addNode("start")} title="Add Start" fill>
          <circle cx="12" cy="12" r="8" />
        </ToolBtn>
        <ToolBtn onClick={() => addNode("ok")} title="Add Success">
          <circle cx="12" cy="12" r="9" />
          <path d="M9 12l2 2 4-4" />
        </ToolBtn>
        <ToolBtn onClick={() => addNode("fail")} title="Add Fail">
          <circle cx="12" cy="12" r="9" />
          <path d="M15 9l-6 6M9 9l6 6" />
        </ToolBtn>
        <ToolBtn onClick={() => addNode("note")} title="Add Comment / Note (C)">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </ToolBtn>
        <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 mx-1" />
        <div className="relative">
          {showLayoutPanel && (
            <>
              <div className="fixed inset-0 z-[490]" onClick={() => setShowLayoutPanel(false)} />
              <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 z-[500]">
                <LayoutPanel
                  prefs={layoutPrefs}
                  onChange={updateLayoutPrefs}
                  onOrganize={() => {
                    runAutoLayout();
                    setShowLayoutPanel(false);
                  }}
                  onFixOverlaps={() => {
                    runFixOverlaps();
                    setShowLayoutPanel(false);
                  }}
                  onClose={() => setShowLayoutPanel(false)}
                />
              </div>
            </>
          )}
          <ToolBtn active={showLayoutPanel} onClick={() => setShowLayoutPanel((s) => !s)} title="Layout & spacing settings">
            <path d="M4 6h10M4 12h16M4 18h7" />
            <circle cx="17" cy="6" r="2" fill="currentColor" stroke="none" />
            <circle cx="14" cy="18" r="2" fill="currentColor" stroke="none" />
          </ToolBtn>
        </div>
        <ToolBtn onClick={runAutoLayout} title="Auto-layout / Organize (Ctrl+L)">
          <path d="M3 3h7v7H3zM14 3h7v4h-7zM14 11h7v10h-7zM3 14h7v7H3z" />
        </ToolBtn>
        <ToolBtn active={snap} onClick={() => setSnap((s) => !s)} title="Snap to grid (G)">
          <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
        </ToolBtn>
        <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 mx-1" />
        <ToolBtn onClick={undo} title="Undo (Ctrl+Z)" disabled={histRef.current.past.length === 0}>
          <path d="M3 10h10a5 5 0 0 1 5 5v2M3 10l6-6M3 10l6 6" />
        </ToolBtn>
        <ToolBtn onClick={redo} title="Redo (Ctrl+Shift+Z)" disabled={histRef.current.future.length === 0}>
          <path d="M21 10H11a5 5 0 0 0-5 5v2M21 10l-6-6M21 10l-6 6" />
        </ToolBtn>
        <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 mx-1" />
        <ToolBtn onClick={() => setShowHelp(true)} title="Shortcuts (?)">
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 17h.01" />
        </ToolBtn>
      </div>
      )}

      {/* Inline connection label editor */}
      {labelEdit && (
        <input
          autoFocus
          value={labelEdit.value}
          onChange={(e) => setLabelEdit({ ...labelEdit, value: e.target.value })}
          onBlur={() => {
            setConnField(labelEdit.id, { label: labelEdit.value });
            setLabelEdit(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setConnField(labelEdit.id, { label: labelEdit.value });
              setLabelEdit(null);
            } else if (e.key === "Escape") setLabelEdit(null);
          }}
          className="fixed z-[400] -translate-x-1/2 -translate-y-1/2 px-2 py-1 text-xs rounded border border-emerald-500 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-lg outline-none"
          style={{ left: labelEdit.sx, top: labelEdit.sy, width: 140 }}
          placeholder="Edge label"
        />
      )}

      {showHandover && (
        <ProcessHandoverForm
          onImportProcess={(newNodes, newConnections) => {
            commit(() => ({ nodes: newNodes, connections: newConnections }), [
              { t: "doc.replace", origin: uid, nodes: newNodes, connections: newConnections },
            ]);
            setTimeout(() => fitView(), 100);
          }}
          onClose={() => setShowHandover(false)}
        />
      )}

      {showAI && (
        <AIGenerateModal
          onClose={() => setShowAI(false)}
          onGenerated={(nodes, connections) => applyGenerated(nodes, connections)}
        />
      )}

      {showHistory && (
        <VersionHistory
          slug={slug}
          authorName={user?.name}
          getCurrent={() => dataRef.current}
          onRestore={restoreVersion}
          onClose={() => setShowHistory(false)}
        />
      )}

      {editNode && (
        <EditModal
          node={editNode}
          onSave={saveNode}
          onDelete={(id) => {
            select([id]);
            deleteSelection();
          }}
          onDuplicate={(n) => duplicateNodes([n.id])}
          onClose={() => setEditNode(null)}
        />
      )}

      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onClose={() => setCtxMenu(null)} />
      )}

      {showHelp && <ShortcutsHelp onClose={() => setShowHelp(false)} />}

      {askName && (
        <NamePrompt
          initial={user?.name || ""}
          title={user ? "Update your name" : "Welcome"}
          onDone={(u) => {
            setUser(u);
            setAskName(false);
          }}
        />
      )}
    </div>
  );
}

function ToolBtn({
  children,
  active,
  onClick,
  title,
  fill,
  disabled,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  title?: string;
  fill?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
        disabled
          ? "opacity-30 cursor-not-allowed text-zinc-400"
          : active
          ? "bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300"
          : "text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 hover:text-zinc-700 dark:hover:text-zinc-200"
      }`}
    >
      <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill={fill ? "currentColor" : "none"} stroke={fill ? "none" : "currentColor"} strokeWidth="2">
        {children}
      </svg>
    </button>
  );
}
