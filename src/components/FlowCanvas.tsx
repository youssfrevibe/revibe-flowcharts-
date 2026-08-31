"use client";

import { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo } from "react";
import { FlowNode, FlowConnection, FlowData, NodeType, ConnType, Op, Collaborator, Port, TextPosition, Pt, Actor } from "@/lib/types";
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
import { computeRoutes, waypointsAfterSegmentDrag } from "@/lib/routing";
import FlowNodeCard from "./FlowNodeCard";
import TopBar from "./TopBar";
import Toolbar from "./Toolbar";
import LayersPanel from "./LayersPanel";
import InspectorPanel, { AlignKind } from "./InspectorPanel";
import ContextMenu, { ContextMenuItem } from "./ContextMenu";
import Connections, { WaypointDragStart, SegmentDragStart, EndpointDragStart } from "./Connections";
import EditModal from "./EditModal";
import ProcessHandoverForm from "./ProcessHandoverForm";
import Minimap from "./Minimap";
import ShortcutsHelp from "./ShortcutsHelp";
import NamePrompt from "./NamePrompt";
import AIGenerateModal from "./AIGenerateModal";
import VersionHistory from "./VersionHistory";
import CommandPalette from "./CommandPalette";
import { applyAIEdits, describeCounts } from "@/lib/ai-edit";
import { AIEditOp } from "@/lib/ai-schema";

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

  // Initial state: load from cache immediately if present in browser, else fallback to default
  const [data, setData] = useState<FlowData>(() => {
    if (typeof window !== "undefined") {
      const cached = getCachedData(slug);
      if (cached) return cached;
    }
    return getDefaultData(slug);
  });
  const dataRef = useRef<FlowData>(data);
  const [loaded, setLoaded] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return Boolean(getCachedData(slug));
    }
    return false;
  });

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
  const [viewMode, setViewMode] = useState<"standard" | "detailed">("detailed");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "offline">("saved");

  const [sizes, setSizes] = useState<Map<string, Size>>(new Map());
  const [editNode, setEditNode] = useState<FlowNode | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const [showHandover, setShowHandover] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [layoutPrefs, setLayoutPrefs] = useState<LayoutPrefs>(DEFAULT_PREFS);
  const layoutPrefsRef = useRef<LayoutPrefs>(layoutPrefs);
  layoutPrefsRef.current = layoutPrefs;
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [ghost, setGhost] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [labelEdit, setLabelEdit] = useState<{ id: string; sx: number; sy: number; value: string } | null>(null);
  const [viewport, setViewport] = useState({ w: 0, h: 0, left: 0, top: 0 });
  // Both rails start hidden: most visits to a flowchart are to read it, not to edit it, so
  // the diagram gets the whole window until you ask for the editing tools. The choice is
  // remembered, so anyone who does edit keeps their panels open next time.
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);
  // Scroll navigates by default, which is what a trackpad needs and what Figma and draw.io
  // both do. Anyone driving a wheel mouse who would rather scroll zoom can flip this in the
  // zoom menu, and the choice sticks.
  const [zoomOnScroll, setZoomOnScroll] = useState(false);
  const zoomOnScrollRef = useRef(zoomOnScroll);
  zoomOnScrollRef.current = zoomOnScroll;
  // Only persist once the stored preference has been read, so the initial `false` defaults
  // don't overwrite it before the effect below has had a chance to run.
  const panelsLoaded = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("flow_panels");
      if (raw) {
        const p = JSON.parse(raw);
        setShowLeft(Boolean(p.left));
        setShowRight(Boolean(p.right));
        setZoomOnScroll(Boolean(p.zoomOnScroll));
      }
    } catch {}
    panelsLoaded.current = true;
  }, []);

  // Persisting in an effect rather than inside the state updater: updaters must be pure.
  // Writing storage from one meant two toggles in the same batch each read the value the
  // other hadn't written yet, and the second one's preference was lost.
  useEffect(() => {
    if (!panelsLoaded.current) return;
    try {
      localStorage.setItem(
        "flow_panels",
        JSON.stringify({ left: showLeft, right: showRight, zoomOnScroll })
      );
    } catch {}
  }, [showLeft, showRight, zoomOnScroll]);

  const togglePanel = useCallback((side: "left" | "right") => {
    if (side === "left") setShowLeft((v) => !v);
    else setShowRight((v) => !v);
  }, []);

  const cwRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dragRef = useRef<{ sx: number; sy: number; origins: Map<string, { x: number; y: number }>; start: FlowData; moved: boolean } | null>(null);
  const panDragRef = useRef<{ sx: number; sy: number } | null>(null);
  const connectRef = useRef<{ fromId: string; fromPort: Port; startX: number; startY: number } | null>(null);
  const marqueeRef = useRef<{ sx: number; sy: number } | null>(null);
  // Live marquee rectangle. The mouseup handler used to read the `marquee` state variable
  // captured in its render closure, so a selection could be committed from a stale rectangle
  // (or missed entirely if the last mousemove hadn't re-rendered yet).
  const marqueeBoxRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const wpDragRef = useRef<{
    connId: string;
    index: number;
    created: boolean;
    start: FlowData;
    sx: number;
    sy: number;
    /** Where the handle sat relative to the pointer when grabbed, so it doesn't jump. */
    offset: Pt;
    moved: boolean;
  } | null>(null);
  const segDragRef = useRef<{
    connId: string;
    index: number;
    axis: "h" | "v";
    start: FlowData;
    /** The route as it was when grabbed — the drag is always measured from this. */
    baseEdge: ReturnType<typeof computeRoutes>[number];
    sx: number;
    sy: number;
    moved: boolean;
  } | null>(null);
  const endDragRef = useRef<{
    connId: string;
    end: "from" | "to";
    start: FlowData;
    moved: boolean;
  } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  /**
   * True while any pointer gesture is in flight. Routing drops to draft quality for the
   * duration (see [[RouteOptions.fast]]) and snaps back to a full solve on release, which is
   * what keeps dragging a node on a large flow at frame rate.
   */
  const [interacting, setInteracting] = useState(false);
  const interactingRef = useRef(false);
  const beginInteraction = useCallback(() => {
    if (interactingRef.current) return;
    interactingRef.current = true;
    setInteracting(true);
  }, []);
  const endInteraction = useCallback(() => {
    if (!interactingRef.current) return;
    interactingRef.current = false;
    setInteracting(false);
  }, []);
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

  // Any open dialog owns the keyboard. Without this, typing in a modal that hasn't focused
  // an input yet — or just having one open — still fired canvas shortcuts underneath it,
  // so "c" scattered comment nodes behind the dialog and Delete removed the selection.
  const modalOpen =
    Boolean(editNode) || showHandover || showHelp || showAI || showHistory || askName || isEditingTitle || showCommandPalette;
  const modalOpenRef = useRef(modalOpen);
  modalOpenRef.current = modalOpen;


  useEffect(() => {
    setProjectTitle(title);
    setTempTitle(title);
  }, [title]);

  useEffect(() => {
    setProjectSubtitle(subtitle);
    setTempSubtitle(subtitle);
  }, [subtitle]);

  /* -------------------------- document data load ------------------------ */
  useEffect(() => {
    let alive = true;
    const cached = getCachedData(slug);
    if (cached) {
      dataRef.current = cached;
      setData(cached);
      setLoaded(true);
    }
    fetchCloudData(slug).then((cloud) => {
      if (!alive) return;
      if (cloud) {
        dataRef.current = cloud;
        setData(cloud);
      }
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [slug]);

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
  // Keep `sizes` in sync with the actual DOM using a ResizeObserver, so the router never
  // falls back to DEFAULT_SIZE (210×84) for a node whose real card is wider or taller —
  // which would otherwise place the port inside the true rectangle and every pathway
  // from that node would cut through it. `useLayoutEffect` sets the observer up before
  // paint, and setSizes runs synchronously from the observer callback (no rAF gate) so
  // Strict Mode's double-effect can't cancel a pending flush.
  useLayoutEffect(() => {
    const root = canvasRef.current;
    if (!root) return;
    let alive = true;
    const flush = (batch: Map<string, Size>) => {
      if (!alive || batch.size === 0) return;
      setSizes((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const [id, s] of batch) {
          const cur = next.get(id);
          if (!cur || cur.w !== s.w || cur.h !== s.h) {
            next.set(id, s);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    };
    const collect = (): Map<string, Size> => {
      const batch = new Map<string, Size>();
      root.querySelectorAll<HTMLElement>("[data-node-id]").forEach((el) => {
        const id = el.dataset.nodeId;
        if (!id) return;
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        if (w > 0 && h > 0) batch.set(id, { w, h });
      });
      return batch;
    };
    // Initial measure once the elements are in the DOM.
    flush(collect());
    const ro = new ResizeObserver((entries) => {
      const batch = new Map<string, Size>();
      for (const e of entries) {
        const el = e.target as HTMLElement;
        const id = el.dataset.nodeId;
        if (!id) continue;
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        if (w > 0 && h > 0) batch.set(id, { w, h });
      }
      flush(batch);
    });
    const observed = new Set<Element>();
    const observeAll = () => {
      root.querySelectorAll("[data-node-id]").forEach((el) => {
        if (!observed.has(el)) {
          ro.observe(el);
          observed.add(el);
        }
      });
      for (const el of observed) {
        if (!el.isConnected) {
          ro.unobserve(el);
          observed.delete(el);
        }
      }
    };
    observeAll();
    // A MutationObserver catches newly-mounted node cards so they get observed too, and
    // re-runs a batch collect so a card that mounts already sized (no ResizeObserver
    // event) still registers its dimensions.
    const mo = new MutationObserver(() => {
      observeAll();
      flush(collect());
    });
    mo.observe(root, { childList: true, subtree: true });
    return () => {
      alive = false;
      ro.disconnect();
      mo.disconnect();
      observed.clear();
    };
  }, [viewMode]);

  // Measured sizes for nodes that no longer exist keep the map (and therefore the routing
  // memo key) growing across a long session; drop them once they're gone.
  useEffect(() => {
    setSizes((prev) => {
      if (prev.size <= data.nodes.length) return prev;
      const live = new Set(data.nodes.map((n) => n.id));
      let changed = false;
      const next = new Map(prev);
      for (const id of next.keys()) {
        if (!live.has(id)) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [data.nodes]);

  /* ----------------------- viewport size tracking ---------------------- */
  useEffect(() => {
    const update = () => {
      if (cwRef.current) {
        const r = cwRef.current.getBoundingClientRect();
        setViewport((prev) =>
          prev.w === r.width && prev.h === r.height && prev.left === r.left && prev.top === r.top
            ? prev
            : { w: r.width, h: r.height, left: r.left, top: r.top }
        );
      }
    };
    update();
    // The rect is also needed in viewport coordinates, to anchor the floating pathway
    // toolbar, so scrolling matters as well as resizing.
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const ro = new ResizeObserver(update);
    if (cwRef.current) ro.observe(cwRef.current);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      ro.disconnect();
    };
  }, []);

  /* ------------------------------ helpers ------------------------------ */
  const screenToWorld = useCallback((clientX: number, clientY: number) => {
    const r = cwRef.current!.getBoundingClientRect();
    const { pan, zoom } = viewRef.current;
    return { x: (clientX - r.left - pan.x) / zoom, y: (clientY - r.top - pan.y) / zoom };
  }, []);

  /**
   * Applies a view change at most once per animation frame.
   *
   * A trackpad fires wheel and mousemove events far faster than the screen refreshes — often
   * 100–200 a second — and the old code ran a full React commit for every one of them, so the
   * canvas fell behind the fingers and navigation felt like wading. Coalescing into a single
   * frame means the work done per visible update is constant no matter how chatty the device.
   */
  const viewFrame = useRef<number | null>(null);
  const pendingView = useRef<{ pan: { x: number; y: number }; zoom: number } | null>(null);
  const commitView = useCallback((next: { pan: { x: number; y: number }; zoom: number }) => {
    pendingView.current = next;
    // Keep the ref current immediately, so consecutive gestures within one frame compose
    // from the latest position rather than all measuring from the frame's starting point.
    viewRef.current = next;
    if (viewFrame.current !== null) return;
    viewFrame.current = requestAnimationFrame(() => {
      viewFrame.current = null;
      const v = pendingView.current;
      pendingView.current = null;
      if (!v) return;
      setPan(v.pan);
      setZoom(v.zoom);
    });
  }, []);

  useEffect(() => () => {
    if (viewFrame.current !== null) cancelAnimationFrame(viewFrame.current);
  }, []);

  const computeFit = useCallback(
    (subset?: FlowNode[]) => {
      const ns = subset && subset.length ? subset : dataRef.current.nodes;
      const b = computeBounds(ns, sizes);
      if (!b || !cwRef.current) return;
      const r = cwRef.current.getBoundingClientRect();
      const pad = 90;
      const z = Math.min((r.width - pad * 2) / b.w, (r.height - pad * 2) / b.h, 1.6);
      const nz = Math.max(0.05, Math.min(z, 2));
      commitView({
        pan: {
          x: r.width / 2 - (b.minX + b.w / 2) * nz,
          y: r.height / 2 - (b.minY + b.h / 2) * nz,
        },
        zoom: nz,
      });
    },
    [sizes, commitView]
  );
  const fitView = useCallback(() => computeFit(), [computeFit]);
  fitRef.current = fitView;

  const zoomAt = useCallback(
    (factor: number, cx: number, cy: number) => {
      const { pan, zoom } = viewRef.current;
      const nz = Math.max(0.05, Math.min(4, zoom * factor));
      if (nz === zoom) return;
      commitView({
        pan: { x: cx - (cx - pan.x) * (nz / zoom), y: cy - (cy - pan.y) * (nz / zoom) },
        zoom: nz,
      });
    },
    [commitView]
  );

  /** Slides the view by a screen-space delta. Used by wheel/trackpad panning. */
  const panBy = useCallback(
    (dx: number, dy: number) => {
      const { pan, zoom } = viewRef.current;
      commitView({ pan: { x: pan.x - dx, y: pan.y - dy }, zoom });
    },
    [commitView]
  );

  const recenterWorld = useCallback(
    (wx: number, wy: number) => {
      const r = cwRef.current!.getBoundingClientRect();
      const { zoom } = viewRef.current;
      commitView({ pan: { x: r.width / 2 - wx * zoom, y: r.height / 2 - wy * zoom }, zoom });
    },
    [commitView]
  );

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

  const handleQuickAdd = useCallback(
    (fromId: string, fromPort: Port, targetType: NodeType = "step") => {
      if (readOnly) return;
      const sourceNode = dataRef.current.nodes.find((n) => n.id === fromId);
      if (!sourceNode) return;
      const s = sizes.get(fromId) || { w: 210, h: 84 };
      let newX = sourceNode.x;
      let newY = sourceNode.y;
      let toPort: Port = "left";

      if (fromPort === "right") {
        newX = sourceNode.x + s.w + 140;
        toPort = "left";
      } else if (fromPort === "left") {
        newX = sourceNode.x - 240;
        toPort = "right";
      } else if (fromPort === "bottom") {
        newY = sourceNode.y + s.h + 100;
        toPort = "top";
      } else if (fromPort === "top") {
        newY = sourceNode.y - 120;
        toPort = "bottom";
      }

      const newNodeId = generateNodeId();
      const newNode: FlowNode = {
        id: newNodeId,
        type: targetType,
        x: snapVal(newX, snap),
        y: snapVal(newY, snap),
        label: targetType === "decision" ? "Next Decision?" : "Next Step",
        detail: "",
      };

      const newConn: FlowConnection = {
        id: newConnId(),
        from: fromId,
        to: newNodeId,
        fromPort,
        toPort,
        label: sourceNode.type === "decision" && fromPort === "right" ? "Yes" : sourceNode.type === "decision" && fromPort === "bottom" ? "No" : "",
        type: sourceNode.type === "decision" && fromPort === "right" ? "cyes" : sourceNode.type === "decision" && fromPort === "bottom" ? "cno" : "",
      };

      commit(
        (prev) => ({
          nodes: [...prev.nodes, newNode],
          connections: [...prev.connections, newConn],
        }),
        [
          { t: "node.upsert", origin: uid, node: newNode },
          { t: "conn.upsert", origin: uid, conn: newConn },
        ]
      );
      select([newNodeId]);
    },
    [commit, snap, sizes, readOnly, uid, select]
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
    // Drop hand-set ports AND hand-drawn routes so each pathway picks the natural side and
    // shape for the NEW layout. Waypoints are absolute world positions, so after every node
    // has moved they would drag pathways back across the fresh arrangement.
    const conns = dataRef.current.connections.map((c) => {
      if (c.fromPort === undefined && c.toPort === undefined && c.waypoints === undefined) return c;
      const { fromPort, toPort, waypoints, ...rest } = c;
      void fromPort;
      void toPort;
      void waypoints;
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

  const chainSelectedNodes = useCallback(() => {
    if (readOnly || selRef.current.length < 2) return;
    const selNodes = dataRef.current.nodes.filter((n) => selRef.current.includes(n.id));
    const sorted = [...selNodes].sort((a, b) => (layoutPrefsRef.current.direction === "TB" ? a.y - b.y : a.x - b.x));
    const newConns: FlowConnection[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const fromId = sorted[i].id;
      const toId = sorted[i + 1].id;
      const exists = dataRef.current.connections.some((c) => c.from === fromId && c.to === toId);
      if (!exists) {
        newConns.push({
          id: newConnId(),
          from: fromId,
          to: toId,
          label: sorted[i].type === "decision" ? "Yes" : "",
          type: sorted[i].type === "decision" ? "cyes" : "",
        });
      }
    }
    if (newConns.length > 0) {
      commit(
        (prev) => ({ ...prev, connections: [...prev.connections, ...newConns] }),
        newConns.map((c) => ({ t: "conn.upsert", origin: uid, conn: c }))
      );
    }
  }, [commit, readOnly, uid]);

  const autoConnectAllNodes = useCallback(() => {
    if (readOnly || dataRef.current.nodes.length < 2) return;
    const sorted = [...dataRef.current.nodes].sort((a, b) => (layoutPrefsRef.current.direction === "TB" ? a.y - b.y : a.x - b.x));
    const newConns: FlowConnection[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const fromId = sorted[i].id;
      const toId = sorted[i + 1].id;
      const exists = dataRef.current.connections.some((c) => c.from === fromId && c.to === toId);
      if (!exists) {
        newConns.push({
          id: newConnId(),
          from: fromId,
          to: toId,
          label: sorted[i].type === "decision" ? "Yes" : "",
          type: sorted[i].type === "decision" ? "cyes" : "",
        });
      }
    }
    commit(
      (prev) => ({ ...prev, connections: [...prev.connections, ...newConns] }),
      newConns.map((c) => ({ t: "conn.upsert", origin: uid, conn: c }))
    );
    setTimeout(() => runAutoLayout(), 80);
  }, [commit, readOnly, uid, runAutoLayout]);

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

  /* ---------------------------- pathway routes ------------------------- */
  // Solved once here rather than inside <Connections>, so the floating pathway toolbar can
  // anchor itself to the same geometry the SVG draws. Memoised on exactly the three inputs
  // routing reads — a node drag re-renders every frame, and re-solving every route (each of
  // which may run an A* search) on each of those frames was the main source of drag lag.
  const routes = useMemo(
    () => computeRoutes(data.nodes, data.connections, sizes, { fast: interacting }),
    [data.nodes, data.connections, sizes, interacting]
  );
  const routeById = useMemo(() => new Map(routes.map((r) => [r.id, r])), [routes]);

  /** Replaces a pathway's hand-drawn route. `undefined` hands it back to the auto-router. */
  const setWaypoints = useCallback(
    (id: string, waypoints: Pt[] | undefined) => {
      commit(
        (prev) => ({
          ...prev,
          connections: prev.connections.map((c) =>
            connId(c) === id ? { ...c, waypoints: waypoints?.length ? waypoints : undefined } : c
          ),
        }),
        [{ t: "conn.waypoints", origin: uid, id, waypoints: waypoints?.length ? waypoints : undefined }]
      );
    },
    [commit, uid]
  );

  const removeWaypoint = useCallback(
    (id: string, index: number) => {
      const c = dataRef.current.connections.find((x) => connId(x) === id);
      if (!c?.waypoints) return;
      setWaypoints(
        id,
        c.waypoints.filter((_, i) => i !== index)
      );
    },
    [setWaypoints]
  );

  /* ------------------------- window mouse events ----------------------- */
  const handlersRef = useRef<{ move: (e: MouseEvent) => void; up: (e: MouseEvent) => void }>({
    move: () => {},
    up: () => {},
  });
  handlersRef.current.move = (e: MouseEvent) => {
    if (segDragRef.current) {
      const sg = segDragRef.current;
      const { zoom } = viewRef.current;
      const raw = sg.axis === "h" ? (e.clientY - sg.sy) / zoom : (e.clientX - sg.sx) / zoom;
      if (!sg.moved && Math.abs(raw) > 2) sg.moved = true;
      if (!sg.moved) return;
      // Snap the moved run onto the grid rather than snapping the raw delta, so the segment
      // lands on grid lines instead of drifting by grid-sized steps from wherever it began.
      const anchor = sg.axis === "h" ? sg.baseEdge.pts[sg.index].y : sg.baseEdge.pts[sg.index].x;
      const delta = snapVal(anchor + raw, snap) - anchor;
      const wps = waypointsAfterSegmentDrag(sg.baseEdge, sg.index, sg.axis, delta);
      setTransient((prev) => ({
        ...prev,
        connections: prev.connections.map((c) => (connId(c) === sg.connId ? { ...c, waypoints: wps } : c)),
      }));
      const now = Date.now();
      if (now - lastMoveBcast.current > 55) {
        lastMoveBcast.current = now;
        bc({ t: "conn.waypoints", origin: uid, id: sg.connId, waypoints: wps });
      }
      return;
    }
    if (endDragRef.current) {
      const ed = endDragRef.current;
      ed.moved = true;
      const w = screenToWorld(e.clientX, e.clientY);
      const anchorNode = dataRef.current.nodes.find(
        (n) => n.id === (ed.end === "from" ? dataRef.current.connections.find((c) => connId(c) === ed.connId)?.to : dataRef.current.connections.find((c) => connId(c) === ed.connId)?.from)
      );
      const asz = anchorNode ? sizes.get(anchorNode.id) || { w: 210, h: 84 } : null;
      setGhost({
        x1: anchorNode && asz ? anchorNode.x + asz.w / 2 : w.x,
        y1: anchorNode && asz ? anchorNode.y + asz.h / 2 : w.y,
        x2: w.x,
        y2: w.y,
      });
      // Highlight whatever shape is under the pointer so the drop target is obvious.
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const nodeEl = el?.closest("[data-node-id]") as HTMLElement | null;
      setDropTarget(nodeEl?.dataset.nodeId ?? null);
      return;
    }
    if (wpDragRef.current) {
      const w = wpDragRef.current;
      const world = screenToWorld(e.clientX, e.clientY);
      if (!w.moved && Math.hypot(e.clientX - w.sx, e.clientY - w.sy) > 2) w.moved = true;
      if (!w.moved) return;
      const pt = { x: snapVal(world.x + w.offset.x, snap), y: snapVal(world.y + w.offset.y, snap) };
      setTransient((prev) => ({
        ...prev,
        connections: prev.connections.map((c) => {
          if (connId(c) !== w.connId) return c;
          const wps = [...(c.waypoints ?? [])];
          wps[w.index] = pt;
          return { ...c, waypoints: wps };
        }),
      }));
      const now = Date.now();
      if (now - lastMoveBcast.current > 55) {
        lastMoveBcast.current = now;
        const c = dataRef.current.connections.find((x) => connId(x) === w.connId);
        if (c) bc({ t: "conn.waypoints", origin: uid, id: w.connId, waypoints: c.waypoints });
      }
      return;
    }
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
      commitView({
        pan: { x: e.clientX - panDragRef.current.sx, y: e.clientY - panDragRef.current.sy },
        zoom: viewRef.current.zoom,
      });
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
      const box = { x: Math.min(s.x, c.x), y: Math.min(s.y, c.y), w: Math.abs(c.x - s.x), h: Math.abs(c.y - s.y) };
      marqueeBoxRef.current = box;
      setMarquee(box);
    }
  };
  handlersRef.current.up = (e: MouseEvent) => {
    // Whatever the gesture was, it's over: go back to full-quality routing.
    endInteraction();
    if (segDragRef.current) {
      const sg = segDragRef.current;
      segDragRef.current = null;
      if (sg.moved) {
        record(sg.start);
        scheduleSave();
        const c = dataRef.current.connections.find((x) => connId(x) === sg.connId);
        if (c) bc({ t: "conn.waypoints", origin: uid, id: sg.connId, waypoints: c.waypoints });
      }
      return;
    }
    if (endDragRef.current) {
      const ed = endDragRef.current;
      endDragRef.current = null;
      setGhost(null);
      setDropTarget(null);
      const el = e.target as HTMLElement | null;
      const portEl = el?.closest?.("[data-port]") as HTMLElement | null;
      const nodeEl = el?.closest?.("[data-node-id]") as HTMLElement | null;
      const targetId = portEl?.dataset.node || nodeEl?.dataset.nodeId;
      const c = dataRef.current.connections.find((x) => connId(x) === ed.connId);
      if (!c || !targetId || !ed.moved) return;
      const other = ed.end === "from" ? c.to : c.from;
      if (targetId === other) return; // would collapse into a self-loop
      const port = (portEl?.dataset.port as Port) || undefined;
      const updated: FlowConnection =
        ed.end === "from"
          ? { ...c, from: targetId, fromPort: port, waypoints: undefined }
          : { ...c, to: targetId, toPort: port, waypoints: undefined };
      commit(
        (prev) => ({
          ...prev,
          connections: prev.connections.map((x) => (connId(x) === ed.connId ? updated : x)),
        }),
        [{ t: "conn.upsert", origin: uid, conn: updated }]
      );
      return;
    }
    if (wpDragRef.current) {
      const w = wpDragRef.current;
      wpDragRef.current = null;
      if (w.moved) {
        // One history entry per drag, recorded against the document as it was before the
        // handle was grabbed — same shape as the node drag below.
        record(w.start);
        scheduleSave();
        const c = dataRef.current.connections.find((x) => connId(x) === w.connId);
        if (c) bc({ t: "conn.waypoints", origin: uid, id: w.connId, waypoints: c.waypoints });
      } else if (w.created) {
        // A click on a "add a bend here" handle that never moved shouldn't leave a bend
        // behind — put the document back exactly as it was.
        dataRef.current = w.start;
        setData(w.start);
      }
      return;
    }
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
      const fromId = connectRef.current.fromId;
      // Guard against the two ways this used to produce junk: dropping a pathway back onto
      // its own node (a self-loop the router can't draw), and dropping onto a node that is
      // already connected the same way, which silently stacked a second identical arrow.
      const duplicate = dataRef.current.connections.some((c) => c.from === fromId && c.to === targetId);
      if (targetId && targetId !== fromId && !duplicate) {
        const conn: FlowConnection = {
          id: newConnId(),
          from: fromId,
          to: targetId,
          label: "",
          type: "",
          fromPort: connectRef.current.fromPort,
          toPort: (portEl?.dataset.port as Port) || undefined,
        };
        commit((prev) => ({ ...prev, connections: [...prev.connections, conn] }), [
          { t: "conn.upsert", origin: uid, conn },
        ]);
        selectConn(connId(conn));
      }
      connectRef.current = null;
      setGhost(null);
    }
    if (marqueeRef.current) {
      const m = marqueeBoxRef.current;
      marqueeRef.current = null;
      marqueeBoxRef.current = null;
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
    // Pointer moves are coalesced to one per animation frame. A trackpad emits them far
    // faster than the display refreshes, and every extra one used to cost a full React
    // commit plus a re-solve of every pathway — work that was overwritten milliseconds
    // later without ever being seen.
    let frame: number | null = null;
    let queued: MouseEvent | null = null;
    const flush = () => {
      frame = null;
      const ev = queued;
      queued = null;
      if (ev) handlersRef.current.move(ev);
    };
    const mv = (e: MouseEvent) => {
      queued = e;
      if (frame === null) frame = requestAnimationFrame(flush);
    };
    const up = (e: MouseEvent) => {
      // Apply whatever move is still queued before finishing, so the gesture ends exactly
      // where the pointer did rather than up to a frame behind it.
      if (frame !== null) {
        cancelAnimationFrame(frame);
        flush();
      }
      handlersRef.current.up(e);
    };
    // Releasing the button outside the window (or alt-tabbing mid-drag) never delivered a
    // mouseup, so the canvas stayed stuck in "dragging" and the next click teleported the
    // selection. Treat losing the window as the end of whatever gesture was in flight.
    const cancel = () => {
      if (
        dragRef.current ||
        panDragRef.current ||
        connectRef.current ||
        marqueeRef.current ||
        wpDragRef.current ||
        segDragRef.current ||
        endDragRef.current
      ) {
        handlersRef.current.up(new MouseEvent("mouseup"));
      }
      dragRef.current = null;
      panDragRef.current = null;
      connectRef.current = null;
      marqueeRef.current = null;
      wpDragRef.current = null;
      segDragRef.current = null;
      endDragRef.current = null;
      setDropTarget(null);
      endInteraction();
      spaceRef.current = false;
      setGhost(null);
      setMarquee(null);
    };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
    window.addEventListener("blur", cancel);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      window.removeEventListener("mousemove", mv);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("blur", cancel);
    };
  }, []);

  /* --------------------------- wheel / trackpad ------------------------ */
  useEffect(() => {
    const cw = cwRef.current;
    if (!cw) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = cw.getBoundingClientRect();

      // Normalise across devices: mouse wheels report lines, trackpads report pixels.
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.height : 1;
      let dx = e.deltaX * unit;
      let dy = e.deltaY * unit;

      // A trackpad pinch reaches the page as a wheel event with ctrlKey set — the browser
      // synthesises it, no modifier is actually held. Ctrl/⌘ + wheel means the same thing.
      const wantsZoom = e.ctrlKey || e.metaKey || (zoomOnScrollRef.current && !e.shiftKey);

      if (wantsZoom) {
        // Continuous exponential zoom, clamped per event so one fast flick can't jump the
        // view across the diagram. Pinch deltas are small, so they scale up gently.
        const factor = Math.min(1.25, Math.max(0.8, Math.exp(-dy * 0.0022)));
        zoomAt(factor, e.clientX - r.left, e.clientY - r.top);
        return;
      }

      // Otherwise scroll navigates, as it does in Figma and draw.io: two fingers move the
      // canvas. Shift makes a vertical-only wheel scroll sideways, for mice with no X axis.
      if (e.shiftKey && dx === 0) {
        dx = dy;
        dy = 0;
      }
      panBy(dx, dy);
    };
    cw.addEventListener("wheel", onWheel, { passive: false });
    return () => cw.removeEventListener("wheel", onWheel);
  }, [zoomAt, panBy]);

  /* ------------------------- pinch (touch / pen) ----------------------- */
  // Two-finger pinch on a touchscreen or a hybrid laptop, which sends touch events rather
  // than ctrl-wheel. Without this the canvas could only be zoomed from the toolbar there.
  useEffect(() => {
    const cw = cwRef.current;
    if (!cw) return;
    let base: { dist: number; zoom: number; cx: number; cy: number } | null = null;
    const spread = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const r = cw.getBoundingClientRect();
      base = {
        dist: spread(e.touches),
        zoom: viewRef.current.zoom,
        cx: (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left,
        cy: (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top,
      };
    };
    const onMove = (e: TouchEvent) => {
      if (!base || e.touches.length !== 2) return;
      e.preventDefault();
      const scale = spread(e.touches) / (base.dist || 1);
      const target = Math.max(0.05, Math.min(4, base.zoom * scale));
      zoomAt(target / viewRef.current.zoom, base.cx, base.cy);
    };
    const onEnd = () => {
      base = null;
    };
    cw.addEventListener("touchstart", onStart, { passive: true });
    cw.addEventListener("touchmove", onMove, { passive: false });
    cw.addEventListener("touchend", onEnd);
    cw.addEventListener("touchcancel", onEnd);
    return () => {
      cw.removeEventListener("touchstart", onStart);
      cw.removeEventListener("touchmove", onMove);
      cw.removeEventListener("touchend", onEnd);
      cw.removeEventListener("touchcancel", onEnd);
    };
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

    // A dialog owns the keyboard while it's open — canvas shortcuts stay out of the way.
    // Escape still gets through, because it's the only way to dismiss most of the dialogs.
    if (modalOpenRef.current) {
      if (k === "escape") {
        e.preventDefault();
        if (isEditingTitle) setIsEditingTitle(false);
        else if (showHelp) setShowHelp(false);
        else if (showHistory) setShowHistory(false);
        else if (showAI) setShowAI(false);
        else if (showHandover) setShowHandover(false);
        else if (editNode) setEditNode(null);
        // The name prompt is only dismissible once the person actually has a name.
        else if (askName && user) setAskName(false);
      }
      return;
    }

    if (k === " ") {
      // Without this the page tries to scroll while you hold space to pan.
      e.preventDefault();
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
      const r = cwRef.current!.getBoundingClientRect();
      zoomAt(1 / viewRef.current.zoom, r.width / 2, r.height / 2);
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
    if (mod && k === "k") {
      e.preventDefault();
      setShowCommandPalette((prev) => !prev);
      return;
    }
    if (k === "[" && !mod && selRef.current.length === 1) {
      e.preventDefault();
      const curId = selRef.current[0];
      const incoming = dataRef.current.connections.find((c) => c.to === curId);
      if (incoming) select([incoming.from]);
      return;
    }
    if (k === "]" && !mod && selRef.current.length === 1) {
      e.preventDefault();
      const curId = selRef.current[0];
      const outgoing = dataRef.current.connections.find((c) => c.from === curId);
      if (outgoing) select([outgoing.to]);
      return;
    }
    if (k === "v" && !mod) setTool("select");
    if (k === "h" && !mod) setTool("pan");
    if (k === "g" && !mod) setSnap((s) => !s);
    if (k === "c" && !mod && !readOnly) addNode("note");
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
      beginInteraction();
    } else {
      if (!e.shiftKey) {
        select([]);
        selectConn(null);
      }
      marqueeRef.current = { sx: e.clientX, sy: e.clientY };
      beginInteraction();
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
    // Alt+drag leaves the originals in place and drags a fresh copy, the way every design
    // tool does it — much quicker than duplicate-then-reposition for laying out variants.
    const start = dataRef.current;
    if (e.altKey) {
      const src = start.nodes.filter((n) => ids.includes(n.id));
      if (src.length) {
        const idMap = new Map<string, string>();
        const copies = src.map((n) => {
          const nid = generateNodeId();
          idMap.set(n.id, nid);
          return { ...n, id: nid };
        });
        const inSel = new Set(ids);
        const copiedConns = start.connections
          .filter((c) => inSel.has(c.from) && inSel.has(c.to))
          .map((c) => ({ ...c, id: newConnId(), from: idMap.get(c.from)!, to: idMap.get(c.to)!, waypoints: undefined }));
        commit(
          (prev) => ({ nodes: [...prev.nodes, ...copies], connections: [...prev.connections, ...copiedConns] }),
          [
            ...copies.map((n) => ({ t: "node.upsert" as const, origin: uid, node: n })),
            ...copiedConns.map((c) => ({ t: "conn.upsert" as const, origin: uid, conn: c })),
          ]
        );
        const copyIds = copies.map((n) => n.id);
        select(copyIds);
        selectConn(null);
        const org = new Map(copies.map((n) => [n.id, { x: n.x, y: n.y }]));
        dragRef.current = { sx: e.clientX, sy: e.clientY, origins: org, start, moved: false };
        beginInteraction();
        return;
      }
    }

    select(ids);
    selectConn(null);
    const origins = new Map<string, { x: number; y: number }>();
    ids.forEach((id) => {
      const n = start.nodes.find((x) => x.id === id);
      if (n) origins.set(id, { x: n.x, y: n.y });
    });
    if (!origins.has(node.id)) origins.set(node.id, { x: node.x, y: node.y });
    dragRef.current = { sx: e.clientX, sy: e.clientY, origins, start, moved: false };
    beginInteraction();
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
    beginInteraction();
  };

  /**
   * Grabs a route handle. A solid handle moves an existing bend; a hollow one inserts a new
   * bend at that spot, which is how a pathway gets pulled off a collision course by hand.
   */
  const onWaypointDown = useCallback(
    (e: React.MouseEvent, h: WaypointDragStart) => {
      if (readOnly) return;
      const start = dataRef.current;
      const conn = start.connections.find((x) => connId(x) === h.connId);
      if (!conn) return;

      let index = h.index;
      if (h.kind === "ghost") {
        const wps = [...(conn.waypoints ?? [])];
        index = Math.max(0, Math.min(index, wps.length));
        wps.splice(index, 0, { x: h.x, y: h.y });
        const next = {
          ...start,
          connections: start.connections.map((x) => (connId(x) === h.connId ? { ...x, waypoints: wps } : x)),
        };
        dataRef.current = next;
        setData(next);
      }

      const w0 = screenToWorld(e.clientX, e.clientY);
      wpDragRef.current = {
        connId: h.connId,
        index,
        created: h.kind === "ghost",
        start,
        sx: e.clientX,
        sy: e.clientY,
        offset: { x: h.x - w0.x, y: h.y - w0.y },
        moved: false,
      };
      beginInteraction();
    },
    [readOnly, screenToWorld, beginInteraction]
  );

  /**
   * Grabs a straight run of a pathway. Dragging slides the whole run sideways, which is the
   * fastest way to pull a pathway out of a collision without placing individual bends.
   */
  const onSegmentDown = useCallback(
    (e: React.MouseEvent, sgd: SegmentDragStart) => {
      if (readOnly) return;
      const baseEdge = routeById.get(sgd.connId);
      if (!baseEdge) return;
      segDragRef.current = {
        connId: sgd.connId,
        index: sgd.index,
        axis: sgd.axis,
        start: dataRef.current,
        baseEdge,
        sx: e.clientX,
        sy: e.clientY,
        moved: false,
      };
      beginInteraction();
    },
    [readOnly, routeById, beginInteraction]
  );

  /** Grabs one end of a pathway so it can be dropped on a different shape. */
  const onEndpointDown = useCallback(
    (e: React.MouseEvent, ed: EndpointDragStart) => {
      if (readOnly) return;
      endDragRef.current = { connId: ed.connId, end: ed.end, start: dataRef.current, moved: false };
      setGhost({ x1: ed.x, y1: ed.y, x2: ed.x, y2: ed.y });
      beginInteraction();
    },
    [readOnly, beginInteraction]
  );

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

  /** Applies a patch to every selected node in one undo step. */
  const patchSelectedNodes = useCallback(
    (patch: Partial<FlowNode>) => {
      const ids = new Set(selRef.current);
      if (!ids.size) return;
      const ops: Op[] = [];
      commit(
        (prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) => {
            if (!ids.has(n.id)) return n;
            const updated = { ...n, ...patch };
            // `undefined` in a patch means "clear this property", not "leave it".
            for (const k of Object.keys(patch) as (keyof FlowNode)[]) {
              if (patch[k] === undefined) delete updated[k];
            }
            ops.push({ t: "node.upsert", origin: uid, node: updated });
            return updated;
          }),
        }),
        ops
      );
    },
    [commit, uid]
  );

  const batchSetActor = useCallback(
    (actor: Actor) => {
      if (readOnly) return;
      patchSelectedNodes({ actor });
    },
    [readOnly, patchSelectedNodes]
  );

  const renameNode = useCallback(
    (id: string, label: string) => {
      const n = dataRef.current.nodes.find((x) => x.id === id);
      if (!n) return;
      const updated = { ...n, label };
      commit(
        (prev) => ({ ...prev, nodes: prev.nodes.map((x) => (x.id === id ? updated : x)) }),
        [{ t: "node.upsert", origin: uid, node: updated }]
      );
    },
    [commit, uid]
  );

  /** Scrolls the viewport to a node and selects it (used by the layers rail). */
  const focusNode = useCallback(
    (id: string) => {
      const n = dataRef.current.nodes.find((x) => x.id === id);
      if (!n) return;
      const sz = sizes.get(id) || { w: 210, h: 84 };
      recenterWorld(n.x + sz.w / 2, n.y + sz.h / 2);
      select([id]);
    },
    [sizes, recenterWorld, select]
  );

  /**
   * Align / distribute the selection, the way a design tool does. Nodes are different sizes,
   * so aligning works on the relevant edge or centre of each node's real measured box rather
   * than on its x/y origin.
   */
  const alignNodes = useCallback(
    (kind: AlignKind) => {
      const ids = selRef.current;
      if (ids.length < 2) return;
      const set = new Set(ids);
      const items = dataRef.current.nodes
        .filter((n) => set.has(n.id))
        .map((n) => ({ n, s: sizes.get(n.id) || { w: 210, h: 84 } }));

      const moves = new Map<string, { x: number; y: number }>();
      const put = (id: string, x: number, y: number) => moves.set(id, { x: Math.round(x), y: Math.round(y) });

      if (kind === "left") {
        const v = Math.min(...items.map((i) => i.n.x));
        items.forEach((i) => put(i.n.id, v, i.n.y));
      } else if (kind === "right") {
        const v = Math.max(...items.map((i) => i.n.x + i.s.w));
        items.forEach((i) => put(i.n.id, v - i.s.w, i.n.y));
      } else if (kind === "hcenter") {
        const v = items.reduce((a, i) => a + i.n.x + i.s.w / 2, 0) / items.length;
        items.forEach((i) => put(i.n.id, v - i.s.w / 2, i.n.y));
      } else if (kind === "top") {
        const v = Math.min(...items.map((i) => i.n.y));
        items.forEach((i) => put(i.n.id, i.n.x, v));
      } else if (kind === "bottom") {
        const v = Math.max(...items.map((i) => i.n.y + i.s.h));
        items.forEach((i) => put(i.n.id, i.n.x, v - i.s.h));
      } else if (kind === "vcenter") {
        const v = items.reduce((a, i) => a + i.n.y + i.s.h / 2, 0) / items.length;
        items.forEach((i) => put(i.n.id, i.n.x, v - i.s.h / 2));
      } else if (kind === "hdist" || kind === "vdist") {
        const horiz = kind === "hdist";
        const sorted = [...items].sort((a, b) =>
          horiz ? a.n.x + a.s.w / 2 - (b.n.x + b.s.w / 2) : a.n.y + a.s.h / 2 - (b.n.y + b.s.h / 2)
        );
        // Keep the two outermost nodes where they are and spread the gaps between the rest
        // evenly, so distributing never drags the whole group across the canvas.
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const startEdge = horiz ? first.n.x + first.s.w : first.n.y + first.s.h;
        const endEdge = horiz ? last.n.x : last.n.y;
        const inner = sorted.slice(1, -1);
        const occupied = inner.reduce((a, i) => a + (horiz ? i.s.w : i.s.h), 0);
        const gap = (endEdge - startEdge - occupied) / (inner.length + 1);
        let cursor = startEdge + gap;
        for (const i of inner) {
          if (horiz) put(i.n.id, cursor, i.n.y);
          else put(i.n.id, i.n.x, cursor);
          cursor += (horiz ? i.s.w : i.s.h) + gap;
        }
      }

      if (!moves.size) return;
      commit(
        (prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) => {
            const m = moves.get(n.id);
            return m ? { ...n, x: m.x, y: m.y } : n;
          }),
        }),
        [{ t: "nodes.move", origin: uid, moves: [...moves].map(([id, m]) => ({ id, ...m })) }]
      );
    },
    [commit, sizes, uid]
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

  const handleSaveTitle = async (nextTitle?: string, nextSubtitle?: string) => {
    const t = (nextTitle ?? tempTitle).trim() || "Process Flowchart";
    const s = (nextSubtitle ?? tempSubtitle).trim();
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
    const hasRoute = Boolean(conn?.waypoints?.length);
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
        { header: "Route" },
        ...(hasRoute
          ? [{ label: "Reset to automatic route", action: () => setWaypoints(id, undefined) }]
          : [{ label: "Drag the dots on a selected pathway to bend it" }]),
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

  const loadParsedJSON = useCallback(
    (content: string) => {
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed.nodes)) {
          const nodes = parsed.nodes as FlowNode[];
          let connections = (parsed.connections || []) as FlowConnection[];
          if (connections.length === 0 && nodes.length > 1) {
            const sorted = [...nodes].sort((a, b) => a.y - b.y || a.x - b.x);
            connections = sorted.slice(0, -1).map((src, i) => ({
              id: `c_${i}_${Date.now()}`,
              from: src.id,
              to: sorted[i + 1].id,
              label: src.type === "decision" ? "Yes" : "",
              type: src.type === "decision" ? "cyes" : "",
            }));
          }
          snapshotNow("Before file import");
          commit(() => ({ nodes, connections }), [{ t: "doc.replace", origin: uid, nodes, connections }]);
          setTimeout(() => {
            const laid = autoLayout(dataRef.current.nodes, dataRef.current.connections, sizes, layoutPrefsRef.current);
            commit((prev) => ({ ...prev, nodes: laid }), [
              { t: "doc.replace", origin: uid, nodes: laid, connections: dataRef.current.connections },
            ]);
            setTimeout(() => fitView(), 80);
          }, 150);
        } else {
          alert("Invalid flowchart JSON format.");
        }
      } catch {
        alert("Failed to parse flowchart JSON file.");
      }
    },
    [commit, fitView, layoutPrefs, sizes, snapshotNow, uid]
  );

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => loadParsedJSON(evt.target?.result as string);
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

  /**
   * Apply an AI edit plan to the live document. Snapshots a version first (so the
   * change is recoverable from history as well as undo), commits the resulting ops
   * so peers converge, and re-runs auto-layout only when steps were added or
   * removed — a pure field edit leaves hand-placed positions alone.
   * Returns a one-line summary for the AI dialog.
   */
  const applyAIEditPlan = useCallback(
    (operations: AIEditOp[], summary: string) => {
      snapshotNow(summary ? `Before AI edit: ${summary.slice(0, 60)}` : "Before AI edit");
      const { data: next, ops, title: newTitle, counts } = applyAIEdits(dataRef.current, operations, uid);

      commit(() => next, ops);
      if (newTitle && newTitle !== projectTitle) handleSaveTitle(newTitle);

      if (counts.added || counts.deleted) {
        // Wait for the new cards to be measured, then arrange and fit.
        setTimeout(() => {
          const laid = autoLayout(dataRef.current.nodes, dataRef.current.connections, sizes, layoutPrefsRef.current);
          commit((prev) => ({ ...prev, nodes: laid }), [
            { t: "doc.replace", origin: uid, nodes: laid, connections: dataRef.current.connections },
          ]);
          setTimeout(() => fitView(), 80);
        }, 350);
      }

      return describeCounts(counts);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commit, uid, snapshotNow, sizes, fitView, projectTitle]
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
  const selectedEdge = selectedConn ? routeById.get(selectedConn) : undefined;
  const selectedNodes = data.nodes.filter((n) => selectedIds.includes(n.id));

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "var(--ui-canvas)" }}>
      <TopBar
        title={projectTitle}
        subtitle={projectSubtitle}
        saveStatus={saveStatus}
        readOnly={readOnly}
        me={user}
        peers={peers}
        connected={status === "live"}
        viewMode={viewMode}
        zoom={zoom}
        showLeft={showLeft}
        showRight={showRight}
        onToggleLeft={() => togglePanel("left")}
        onToggleRight={() => togglePanel("right")}
        zoomOnScroll={zoomOnScroll}
        onToggleZoomOnScroll={() => setZoomOnScroll((v) => !v)}
        onRename={(t, sub) => handleSaveTitle(t, sub)}
        onEditName={() => setAskName(true)}
        onViewMode={setViewMode}
        onZoomIn={() => {
          const r = cwRef.current!.getBoundingClientRect();
          zoomAt(1.2, r.width / 2, r.height / 2);
        }}
        onZoomOut={() => {
          const r = cwRef.current!.getBoundingClientRect();
          zoomAt(0.8, r.width / 2, r.height / 2);
        }}
        onZoomReset={() => {
          const r = cwRef.current!.getBoundingClientRect();
          zoomAt(1 / viewRef.current.zoom, r.width / 2, r.height / 2);
        }}
        onFit={fitView}
        onAI={() => setShowAI(true)}
        onShare={copyViewLink}
        shareCopied={shareCopied}
        onExportPNG={doExportPNG}
        onExportSVG={doExportSVG}
        onExportJSON={doExportJSON}
        onImport={() => fileInputRef.current?.click()}
        onHistory={() => setShowHistory(true)}
        onHandover={() => setShowHandover(true)}
        onShortcuts={() => setShowHelp(true)}
        onReset={handleReset}
        onOpenCommandPalette={() => setShowCommandPalette(true)}
      />

      <div className="flex-1 flex min-h-0">
        {/* Left rail — everything in the diagram, findable by name. Hidden on narrow
            windows so the canvas keeps its width on a laptop screen. */}
        {showLeft && (
          <LayersPanel
            nodes={data.nodes}
            connections={data.connections}
            selectedIds={selectedIds}
            selectedConn={selectedConn}
            readOnly={readOnly}
            onSelectNode={(id, additive) =>
              select(additive ? [...new Set([...selRef.current, id])] : [id])
            }
            onSelectConn={selectConn}
            onRenameNode={renameNode}
            onFocusNode={focusNode}
            onDeleteNode={(id) => {
              select([id]);
              deleteSelection();
            }}
          />
        )}

        {/* Canvas */}
        <div
          ref={cwRef}
          className="flex-1 relative overflow-hidden min-w-0"
          onMouseDown={onCanvasMouseDown}
          onDoubleClick={onCanvasDoubleClick}
          onDragOver={(e) => {
            e.preventDefault();
            if (!readOnly && e.dataTransfer.types.includes("Files")) {
              setIsDraggingFile(true);
            }
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDraggingFile(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDraggingFile(false);
            if (readOnly) return;
            const file = e.dataTransfer.files?.[0];
            if (file && file.name.endsWith(".json")) {
              const reader = new FileReader();
              reader.onload = (evt) => loadParsedJSON(evt.target?.result as string);
              reader.readAsText(file);
            }
          }}
        >
          {isDraggingFile && (
            <div className="absolute inset-0 z-50 bg-sky-500/20 dark:bg-sky-500/30 backdrop-blur-xs border-2 border-dashed border-sky-500 flex flex-col items-center justify-center text-sky-900 dark:text-sky-100 pointer-events-none">
              <span className="text-4xl mb-2">📂</span>
              <p className="text-sm font-bold">Drop JSON flowchart to import</p>
              <p className="text-xs opacity-80">Replaces current diagram and auto-connects steps</p>
            </div>
          )}

          <div
            className="absolute inset-0 pointer-events-none z-0"
            style={{
              backgroundImage: "radial-gradient(circle, var(--ui-dot) 1px, transparent 1px)",
              backgroundSize: `${GRID * zoom}px ${GRID * zoom}px`,
              backgroundPosition: `${pan.x}px ${pan.y}px`,
            }}
          />

          <div
            ref={canvasRef}
            className={`absolute top-0 left-0 w-[12000px] h-[12000px] origin-top-left ${
              tool === "pan" || spaceRef.current || panDragRef.current ? "cursor-grabbing" : ""
            }`}
            style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`, willChange: "transform" }}
          >
            {loaded && (
              <Connections
                nodes={data.nodes}
                routes={routes}
                sizes={sizes}
                selectedId={selectedConn}
                onSelect={selectConn}
                onContextMenu={connContextMenu}
                onEditLabel={openLabelEdit}
                ghost={ghost}
                onWaypointDown={readOnly ? undefined : onWaypointDown}
                onWaypointRemove={readOnly ? undefined : removeWaypoint}
                onSegmentDown={readOnly ? undefined : onSegmentDown}
                onEndpointDown={readOnly ? undefined : onEndpointDown}
              />
            )}
            {marquee && (
              <div
                className="absolute z-[6] pointer-events-none"
                style={{
                  left: marquee.x,
                  top: marquee.y,
                  width: marquee.w,
                  height: marquee.h,
                  border: "1px solid var(--ui-accent)",
                  background: "var(--ui-accent-soft)",
                }}
              />
            )}
            {loaded && (
              <div className="relative z-10">
                {data.nodes.map((node) => (
                  <FlowNodeCard
                    key={node.id}
                    node={node}
                    isSelected={selectedIds.includes(node.id)}
                    isDropTarget={dropTarget === node.id}
                    viewMode={viewMode}
                    onMouseDown={(e) => onNodeMouseDown(e, node)}
                    onDoubleClick={() => !readOnly && setEditNode(node)}
                    onContextMenu={(e) => !readOnly && nodeContextMenu(e, node)}
                    onPortMouseDown={(e, port) => onPortMouseDown(e, node, port)}
                    onPortMouseUp={() => {}}
                    onQuickAdd={readOnly ? undefined : handleQuickAdd}
                    onUpdate={saveNode}
                    onDelete={(id) => {
                      select([id]);
                      deleteSelection();
                    }}
                  />
                ))}
              </div>
            )}
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

          {!loaded && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/70 dark:bg-zinc-900/70 backdrop-blur-xs z-30 pointer-events-none animate-in fade-in duration-100">
              <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mb-2" />
              <span className="text-[11.5px] font-medium text-zinc-600 dark:text-zinc-400">Loading flowchart…</span>
            </div>
          )}

          {loaded && data.nodes.length === 0 && (
            <div className="absolute inset-0 grid place-items-center z-20">
              <div className="text-center max-w-xs">
                <p className="text-[13px] font-semibold" style={{ color: "var(--ui-text)" }}>
                  Nothing here yet
                </p>
                <p className="mt-1 text-[11.5px] leading-relaxed" style={{ color: "var(--ui-text-faint)" }}>
                  Double-click anywhere to add a step, pick a shape from the tool strip, or let
                  AI draft the flow from a description.
                </p>
              </div>
            </div>
          )}

          {snap && (
            <span
              className="absolute bottom-4 right-4 z-40 text-[10px] font-medium px-2 py-1 rounded-md"
              style={{ background: "var(--ui-accent-soft)", color: "var(--ui-accent)" }}
            >
              Grid snap on
            </span>
          )}

          {!readOnly && (
            <Toolbar
              tool={tool}
              onTool={setTool}
              snap={snap}
              onSnap={() => setSnap((v) => !v)}
              onAdd={(t) => addNode(t)}
              onOrganize={runAutoLayout}
              onUndo={undo}
              onRedo={redo}
              canUndo={histRef.current.past.length > 0}
              canRedo={histRef.current.future.length > 0}
              onShortcuts={() => setShowHelp(true)}
            />
          )}
        </div>

        {/* Right rail — properties for whatever is selected. */}
        {showRight && (
          <InspectorPanel
            nodes={data.nodes}
            selected={selectedNodes}
            conn={selectedEdge?.conn ?? null}
            readOnly={readOnly}
            prefs={layoutPrefs}
            onPrefsChange={updateLayoutPrefs}
            onOrganize={runAutoLayout}
            onFixOverlaps={runFixOverlaps}
            onPatchNodes={patchSelectedNodes}
            onAlign={alignNodes}
            onOpenEditor={setEditNode}
            onDuplicate={() => duplicateNodes(selRef.current)}
            onDeleteNodes={deleteSelection}
            onPatchConn={(patch) => selectedConn && setConnField(selectedConn, patch)}
            onResetRoute={() => selectedConn && setWaypoints(selectedConn, undefined)}
            onDeleteConn={() => selectedConn && deleteConn(selectedConn)}
            onChainSelected={chainSelectedNodes}
            onAutoConnectAll={autoConnectAllNodes}
          />
        )}
      </div>

      <input type="file" ref={fileInputRef} onChange={handleImportJSON} accept=".json" className="hidden" />

      {/* Inline pathway label editor */}
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
          className="ui-field fixed z-[400] -translate-x-1/2 -translate-y-1/2 !w-36 shadow-xl"
          style={{ left: labelEdit.sx, top: labelEdit.sy, borderColor: "var(--ui-accent)" }}
          placeholder="Pathway label"
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
          getCurrent={() => dataRef.current}
          currentTitle={projectTitle}
          onApplyEdits={readOnly ? undefined : applyAIEditPlan}
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

      {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onClose={() => setCtxMenu(null)} />}

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

      {/* Universal Command Palette */}
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        nodes={data.nodes}
        onSelectNode={(id) => {
          select([id]);
          focusNode(id);
        }}
        onAutoLayout={runAutoLayout}
        onFixOverlaps={runFixOverlaps}
        onAutoConnectAll={autoConnectAllNodes}
        onChainSelected={chainSelectedNodes}
        onBatchSetActor={batchSetActor}
        onAddNode={(t) => addNode(t)}
        onFitView={fitView}
        onResetZoom={() => {
          const r = cwRef.current?.getBoundingClientRect();
          if (r) zoomAt(1 / viewRef.current.zoom, r.width / 2, r.height / 2);
        }}
        onToggleViewMode={() => setViewMode((m) => (m === "detailed" ? "standard" : "detailed"))}
        onToggleSnap={() => setSnap((s) => !s)}
        onOpenAI={() => setShowAI(true)}
        onOpenExport={doExportPNG}
        onExportJSON={doExportJSON}
        currentSlug={slug}
      />
    </div>
  );
}
