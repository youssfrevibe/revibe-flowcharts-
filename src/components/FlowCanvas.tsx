"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { FlowNode, FlowConnection, NodeType, ConnType } from "@/lib/types";
import { loadFlowchartData, saveFlowchartData, resetFlowchartData, generateNodeId } from "@/lib/diagram-store";
import FlowNodeCard from "./FlowNodeCard";
import Connections from "./Connections";
import EditModal from "./EditModal";
import ContextMenu, { ContextMenuItem } from "./ContextMenu";
import ProcessHandoverForm from "./ProcessHandoverForm";

interface FlowCanvasProps {
  title: string;
  subtitle: string;
  initialNodes: FlowNode[];
  initialConnections: FlowConnection[];
  storageKey: string;
  exportFilename?: string;
}

export default function FlowCanvas({
  title,
  subtitle,
  initialNodes,
  initialConnections,
  storageKey,
  exportFilename,
}: FlowCanvasProps) {
  const [mounted, setMounted] = useState(false);
  const [nodes, setNodes] = useState<FlowNode[]>(initialNodes);
  const [connections, setConnections] = useState<FlowConnection[]>(initialConnections);

  // Sync from localStorage after client mounts to avoid SSR hydration mismatch
  useEffect(() => {
    setMounted(true);
    const data = loadFlowchartData(storageKey);
    if (data.nodes && data.nodes.length) {
      setNodes(data.nodes);
      setConnections(data.connections || []);
    }
  }, [storageKey]);

  // Undo / Redo history stacks
  const [history, setHistory] = useState<{ nodes: FlowNode[]; connections: FlowConnection[] }[]>([]);
  const [redoStack, setRedoStack] = useState<{ nodes: FlowNode[]; connections: FlowConnection[] }[]>([]);

  const pushState = useCallback((newNodes: FlowNode[], newConnections: FlowConnection[]) => {
    setHistory((prev) => [...prev.slice(-30), { nodes: newNodes, connections: newConnections }]);
    setRedoStack([]);
  }, []);

  const undo = useCallback(() => {
    setHistory((prevHistory) => {
      if (prevHistory.length === 0) return prevHistory;
      const previous = prevHistory[prevHistory.length - 1];
      const newHistory = prevHistory.slice(0, -1);

      setRedoStack((prevRedo) => [{ nodes, connections }, ...prevRedo]);
      setNodes(previous.nodes);
      setConnections(previous.connections);
      return newHistory;
    });
  }, [nodes, connections]);

  const redo = useCallback(() => {
    setRedoStack((prevRedo) => {
      if (prevRedo.length === 0) return prevRedo;
      const nextState = prevRedo[0];
      const newRedo = prevRedo.slice(1);

      setHistory((prevHistory) => [...prevHistory, { nodes, connections }]);
      setNodes(nextState.nodes);
      setConnections(nextState.connections);
      return newRedo;
    });
  }, [nodes, connections]);

  const [saveStatus, setSaveStatus] = useState<"saved" | "saving">("saved");
  const [viewMode, setViewMode] = useState<"standard" | "detailed">("standard");
  const [showHandoverForm, setShowHandoverForm] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editNode, setEditNode] = useState<FlowNode | null>(null);
  const [tool, setCurrentTool] = useState<"select" | "pan">("select");
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const [nodeRects, setNodeRects] = useState<Map<string, DOMRect>>(new Map());

  const cwRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{
    node: FlowNode;
    sx: number;
    sy: number;
    ox: number;
    oy: number;
    moved: boolean;
  } | null>(null);
  const panRef = useRef<{ sx: number; sy: number } | null>(null);
  const connRef = useRef<{ fromId: string; fromPort: string } | null>(null);

  // Persist to localStorage with visual auto-save state
  useEffect(() => {
    if (!mounted) return;
    setSaveStatus("saving");
    saveFlowchartData(storageKey, { nodes, connections });
    const timer = setTimeout(() => setSaveStatus("saved"), 400);
    return () => clearTimeout(timer);
  }, [nodes, connections, storageKey, mounted]);


  // Measure node dimensions after render
  useEffect(() => {
    const rects = new Map<string, DOMRect>();
    nodes.forEach((n) => {
      const el = document.querySelector(`[data-node-id="${n.id}"]`);
      if (el) {
        const body = el.querySelector("div");
        if (body) rects.set(n.id, body.getBoundingClientRect());
      }
    });
    setNodeRects(rects);
  }, [nodes]);

  // Fit view on mount
  useEffect(() => {
    fitView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fitView = useCallback(() => {
    if (!cwRef.current || nodes.length === 0) return;
    const r = cwRef.current.getBoundingClientRect();
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    nodes.forEach((n) => {
      x1 = Math.min(x1, n.x);
      y1 = Math.min(y1, n.y);
      x2 = Math.max(x2, n.x + 240);
      y2 = Math.max(y2, n.y + 100);
    });
    const w = x2 - x1 + 140;
    const h = y2 - y1 + 140;
    const newZoom = Math.min(r.width / w, r.height / h, 1.5);
    setPan({
      x: (r.width - w * newZoom) / 2 - x1 * newZoom + 70 * newZoom,
      y: (r.height - h * newZoom) / 2 - y1 * newZoom + 70 * newZoom,
    });
    setZoom(newZoom);
  }, [nodes]);

  // Mouse move / up
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (dragRef.current) {
        const d = dragRef.current;
        const dx = (e.clientX - d.sx) / zoom;
        const dy = (e.clientY - d.sy) / zoom;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) d.moved = true;
        setNodes((prev) =>
          prev.map((n) =>
            n.id === d.node.id ? { ...n, x: d.ox + dx, y: d.oy + dy } : n
          )
        );
      }
      if (panRef.current) {
        setPan({
          x: e.clientX - panRef.current.sx,
          y: e.clientY - panRef.current.sy,
        });
      }
    };

    const handleUp = (e: MouseEvent) => {
      if (connRef.current) {
        const target = (e.target as HTMLElement).closest("[data-port]") as HTMLElement | null;
        if (target && target.dataset.node !== connRef.current.fromId) {
          setConnections((prev) => [
            ...prev,
            { from: connRef.current!.fromId, to: target.dataset.node!, label: "", type: "" },
          ]);
        }
        connRef.current = null;
      }
      dragRef.current = null;
      panRef.current = null;
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [zoom]);

  // Wheel zoom
  useEffect(() => {
    const cw = cwRef.current;
    if (!cw) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.min(3, Math.max(0.15, zoom * factor));
      const r = cw.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      setPan((p) => ({
        x: mx - (mx - p.x) * (newZoom / zoom),
        y: my - (my - p.y) * (newZoom / zoom),
      }));
      setZoom(newZoom);
    };
    cw.addEventListener("wheel", handleWheel, { passive: false });
    return () => cw.removeEventListener("wheel", handleWheel);
  }, [zoom]);

  // Keyboard
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (editNode) {
        if (e.key === "Escape") setEditNode(null);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (e.shiftKey) {
          e.preventDefault();
          redo();
        } else {
          e.preventDefault();
          undo();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === "v") setCurrentTool("select");
      if (e.key === "h") setCurrentTool("pan");
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        setZoom((z) => Math.min(3, z * 1.25));
      }
      if (e.key === "-") {
        e.preventDefault();
        setZoom((z) => Math.max(0.15, z * 0.8));
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        deleteNode(selectedId);
      }
      if (e.key === "Escape") setCtxMenu(null);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [editNode, selectedId, undo, redo]);

  const deleteNode = (id: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setConnections((prev) => prev.filter((c) => c.from !== id && c.to !== id));
    setSelectedId(null);
    setEditNode(null);
  };

  const duplicateNode = (node: FlowNode) => {
    const newNode = { ...node, id: generateNodeId(), x: node.x + 30, y: node.y + 30 };
    setNodes((prev) => [...prev, newNode]);
  };

  const addNode = (type: NodeType) => {
    if (!cwRef.current) return;
    const r = cwRef.current.getBoundingClientRect();
    const cx = (r.width / 2 - pan.x) / zoom;
    const cy = (r.height / 2 - pan.y) / zoom;
    const labels: Record<NodeType, string> = {
      start: "Start",
      step: "New Step",
      decision: "Decision?",
      sub: "Sub-process",
      ok: "Success",
      fail: "Failed",
    };
    const n: FlowNode = {
      id: generateNodeId(),
      type,
      x: cx - 97,
      y: cy - 40,
      label: labels[type],
      detail: "Double-click to edit",
    };
    setNodes((prev) => [...prev, n]);
    setEditNode(n);
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (
      e.target === cwRef.current ||
      e.target === canvasRef.current ||
      (e.target as HTMLElement).tagName === "svg"
    ) {
      if (tool === "pan" || e.button === 1) {
        panRef.current = { sx: e.clientX - pan.x, sy: e.clientY - pan.y };
      } else {
        setSelectedId(null);
      }
    }
  };

  const handleNodeContextMenu = (e: React.MouseEvent, node: FlowNode) => {
    e.preventDefault();
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: "Edit", action: () => setEditNode(node) },
        { label: "Duplicate", action: () => duplicateNode(node) },
        { separator: true, label: "", action: () => {} },
        { label: "Delete", action: () => deleteNode(node.id), danger: true },
      ],
    });
  };

  const handleConnectionContextMenu = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    const conn = connections[index];
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: "Edit Label",
          action: () => {
            const v = prompt("Connection label:", conn.label || "");
            if (v !== null) {
              setConnections((prev) =>
                prev.map((c, i) => (i === index ? { ...c, label: v } : c))
              );
            }
          },
        },
        { separator: true, label: "", action: () => {} },
        { label: "Style: Default", action: () => setConnStyle(index, "") },
        { label: "Style: Yes (green)", action: () => setConnStyle(index, "cyes") },
        { label: "Style: No (red)", action: () => setConnStyle(index, "cno") },
        { label: "Style: Conditional", action: () => setConnStyle(index, "camber") },
        { separator: true, label: "", action: () => {} },
        {
          label: "Delete Connection",
          action: () => setConnections((prev) => prev.filter((_, i) => i !== index)),
          danger: true,
        },
      ],
    });
  };

  const setConnStyle = (index: number, type: ConnType) => {
    setConnections((prev) =>
      prev.map((c, i) => (i === index ? { ...c, type } : c))
    );
  };

  const doExport = () => {
    const data = { nodes, connections };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFilename || `revibe-${storageKey}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleResetToDefault = () => {
    if (window.confirm("Reset this flowchart to its default layout? All unsaved modifications will be restored to the template.")) {
      const data = resetFlowchartData(storageKey);
      setNodes(data.nodes);
      setConnections(data.connections);
      fitView();
    }
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const content = evt.target?.result as string;
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed.nodes)) {
          setNodes(parsed.nodes);
          setConnections(parsed.connections || []);
          setTimeout(() => fitView(), 100);
        } else {
          alert("Invalid flowchart JSON format.");
        }
      } catch (err) {
        alert("Failed to parse flowchart JSON file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-100 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-2.5 bg-white dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 z-50 relative shadow-sm">
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="w-[34px] h-[34px] bg-emerald-700 dark:bg-emerald-600 rounded-lg flex items-center justify-center text-white font-bold text-base hover:bg-emerald-600 dark:hover:bg-emerald-500 transition-colors shadow-sm"
            title="Back to Revibe's Flowcharts"
          >
            R
          </a>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
                {title}
              </span>
              <span
                className={`text-[10px] font-medium px-2 py-0.5 rounded-full transition-all ${
                  saveStatus === "saving"
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                    : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                }`}
              >
                {saveStatus === "saving" ? "Saving..." : "Saved"}
              </span>
            </div>
            <div className="text-[11px] text-zinc-400">
              {subtitle}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Mode Switcher */}
          <div className="flex items-center bg-zinc-100 dark:bg-zinc-900 p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-700">
            <button
              onClick={() => setViewMode("standard")}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                viewMode === "standard"
                  ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              Standard Flow
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
              Detailed Agent Mode
            </button>
          </div>

          <button
            onClick={() => {
              setSaveStatus("saving");
              saveFlowchartData(storageKey, { nodes, connections });
              setTimeout(() => setSaveStatus("saved"), 300);
            }}
            className="px-3 py-1.5 text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 text-white rounded-md transition-colors shadow-xs flex items-center gap-1.5"
          >
            💾 Save Flowchart
          </button>

          <button
            onClick={() => setShowHandoverForm(true)}
            className="px-3 py-1.5 text-xs font-semibold border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 rounded-md transition-colors shadow-xs flex items-center gap-1"
          >
            📋 Expert Handover Form
          </button>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportJSON}
            accept=".json"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 text-xs font-medium border border-zinc-300 dark:border-zinc-600 rounded-md bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
          >
            Import JSON
          </button>
          <button
            onClick={doExport}
            className="px-3 py-1.5 text-xs font-medium border border-zinc-300 dark:border-zinc-600 rounded-md bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
          >
            Export JSON
          </button>
          <button
            onClick={fitView}
            className="px-3 py-1.5 text-xs font-medium border border-zinc-300 dark:border-zinc-600 rounded-md bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
          >
            Fit View
          </button>
          <button
            onClick={handleResetToDefault}
            className="px-3 py-1.5 text-xs font-medium border border-red-200 dark:border-red-900/50 rounded-md bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
          >
            Reset Default
          </button>
        </div>
      </div>

      {/* Canvas area */}
      <div
        ref={cwRef}
        className="flex-1 relative overflow-hidden"
        onMouseDown={handleCanvasMouseDown}
      >
        {/* Dot grid */}
        <div
          className="absolute inset-0 pointer-events-none z-0"
          style={{
            backgroundImage: "radial-gradient(circle, rgb(200 200 195 / 0.12) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />

        {/* Transform container */}
        <div
          ref={canvasRef}
          className={`absolute top-0 left-0 w-[6000px] h-[6000px] origin-top-left ${
            tool === "pan" || panRef.current ? "cursor-grabbing" : "cursor-grab"
          }`}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          <Connections
            nodes={nodes}
            connections={connections}
            onContextMenu={handleConnectionContextMenu}
            nodeElements={nodeRects}
          />
          <div className="relative z-10">
            {nodes.map((node) => (
              <FlowNodeCard
                key={node.id}
                node={node}
                isSelected={selectedId === node.id}
                viewMode={viewMode}
                onMouseDown={(e) => {
                  setSelectedId(node.id);
                  dragRef.current = {
                    node,
                    sx: e.clientX,
                    sy: e.clientY,
                    ox: node.x,
                    oy: node.y,
                    moved: false,
                  };
                }}
                onDoubleClick={() => setEditNode(node)}
                onContextMenu={(e) => handleNodeContextMenu(e, node)}
                onPortMouseDown={(e, port) => {
                  connRef.current = { fromId: node.id, fromPort: port };
                }}
              />
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="fixed top-[62px] left-3.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3.5 z-40 shadow-md text-[11.5px]">
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2.5">
            Legend
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
              <div className="w-3.5 h-3.5 rounded bg-emerald-700 shrink-0" />Start / End (success)
            </div>
            <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
              <div className="w-3.5 h-3.5 rounded bg-zinc-700 shrink-0" />Process step
            </div>
            <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
              <div className="w-3.5 h-3.5 rounded bg-amber-700 shrink-0" />Decision point
            </div>
            <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
              <div className="w-3.5 h-3.5 rounded bg-blue-700 border border-blue-500 border-dashed shrink-0" />Sub-process
            </div>
            <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
              <div className="w-3.5 h-3.5 rounded bg-red-600 shrink-0" />End (cancelled)
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-zinc-200 dark:border-zinc-700 space-y-1.5">
            <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
              <div className="w-5 h-0 border-t-2 border-emerald-500 shrink-0" />Yes / confirmed
            </div>
            <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
              <div className="w-5 h-0 border-t-2 border-red-500 shrink-0" />No / rejected
            </div>
            <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
              <div className="w-5 h-0 border-t-2 border-amber-500 shrink-0" />Conditional
            </div>
          </div>
        </div>

        {/* Zoom indicator */}
        <div className="fixed bottom-20 right-5 text-[11px] text-zinc-400 bg-white dark:bg-zinc-800 px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 z-40 tabular-nums">
          {Math.round(zoom * 100)}%
        </div>
      </div>

      {/* Toolbar */}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-0.5 p-1.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl z-50">
        <ToolBtn active={tool === "select"} onClick={() => setCurrentTool("select")} title="Select (V)">
          <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
        </ToolBtn>
        <ToolBtn active={tool === "pan"} onClick={() => setCurrentTool("pan")} title="Pan (H)">
          <path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8M22 10v2a10 10 0 0 1-10 10H8" />
          <path d="M18 8a2 2 0 1 1 4 0v6" />
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
        <ToolBtn onClick={() => addNode("start")} title="Start node" fill>
          <circle cx="12" cy="12" r="8" />
        </ToolBtn>
        <ToolBtn onClick={() => addNode("ok")} title="End (success)">
          <circle cx="12" cy="12" r="9" />
          <path d="M9 12l2 2 4-4" />
        </ToolBtn>
        <ToolBtn onClick={() => addNode("fail")} title="End (fail)">
          <circle cx="12" cy="12" r="9" />
          <path d="M15 9l-6 6M9 9l6 6" />
        </ToolBtn>
        <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 mx-1" />
        <ToolBtn onClick={undo} title="Undo (Ctrl+Z)" disabled={history.length === 0}>
          <path d="M3 10h10a5 5 0 0 1 5 5v2M3 10l6-6M3 10l6 6" />
        </ToolBtn>
        <ToolBtn onClick={redo} title="Redo (Ctrl+Y)" disabled={redoStack.length === 0}>
          <path d="M21 10H11a5 5 0 0 0-5 5v2M21 10l-6-6M21 10l-6 6" />
        </ToolBtn>
        <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 mx-1" />
        <ToolBtn onClick={() => setZoom((z) => Math.min(3, z * 1.25))} title="Zoom In">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35M11 8v6M8 11h6" />
        </ToolBtn>
        <ToolBtn onClick={() => setZoom((z) => Math.max(0.15, z * 0.8))} title="Zoom Out">
          <circle cx="11" cy="11" r="8" />
          <path d="M8 11h6" />
        </ToolBtn>
      </div>

      {/* Handover form modal */}
      {showHandoverForm && (
        <ProcessHandoverForm
          onImportProcess={(newNodes, newConnections) => {
            pushState(nodes, connections);
            setNodes(newNodes);
            setConnections(newConnections);
            setTimeout(() => fitView(), 100);
          }}
          onClose={() => setShowHandoverForm(false)}
        />
      )}

      {/* Edit modal */}
      {editNode && (
        <EditModal
          node={editNode}
          onSave={(updated) => {
            setNodes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
            setEditNode(null);
          }}
          onDelete={deleteNode}
          onDuplicate={duplicateNode}
          onClose={() => setEditNode(null)}
        />
      )}

      {/* Context menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxMenu.items}
          onClose={() => setCtxMenu(null)}
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
      <svg
        viewBox="0 0 24 24"
        className="w-[18px] h-[18px]"
        fill={fill ? "currentColor" : "none"}
        stroke={fill ? "none" : "currentColor"}
        strokeWidth="2"
      >
        {children}
      </svg>
    </button>
  );
}
