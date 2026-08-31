"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { Actor, FlowNode } from "@/lib/types";
import { DiagramMetadata } from "@/lib/types";
import { getCachedDiagrams } from "@/lib/diagram-store";
import { ACTOR_ORDER, ACTOR_STYLES } from "@/lib/node-colors";

export interface CommandAction {
  id: string;
  title: string;
  category: "Navigation" | "Nodes" | "Actions" | "View" | "Export" | "Flowcharts" | "Actors";
  shortcut?: string;
  icon?: string;
  keywords?: string[];
  perform: () => void;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  nodes: FlowNode[];
  onSelectNode: (nodeId: string) => void;
  onAutoLayout: () => void;
  onFixOverlaps: () => void;
  onAutoConnectAll?: () => void;
  onChainSelected?: () => void;
  onBatchSetActor?: (actor: Actor) => void;
  onAddNode: (type: "step" | "decision" | "sub" | "note") => void;
  onFitView: () => void;
  onResetZoom: () => void;
  onToggleViewMode: () => void;
  onToggleSnap: () => void;
  onOpenAI: () => void;
  onOpenExport: () => void;
  onExportJSON: () => void;
  currentSlug: string;
}

export default function CommandPalette({
  isOpen,
  onClose,
  nodes,
  onSelectNode,
  onAutoLayout,
  onFixOverlaps,
  onAutoConnectAll,
  onChainSelected,
  onBatchSetActor,
  onAddNode,
  onFitView,
  onResetZoom,
  onToggleViewMode,
  onToggleSnap,
  onOpenAI,
  onOpenExport,
  onExportJSON,
  currentSlug,
}: Props) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [diagrams, setDiagrams] = useState<DiagramMetadata[]>([]);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setDiagrams(getCachedDiagrams().filter((d) => d.slug !== currentSlug));
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, currentSlug]);

  // Build the list of all available commands
  const allCommands = useMemo<CommandAction[]>(() => {
    const list: CommandAction[] = [
      // Actions
      { id: "act-ai", title: "Generate / Edit Flowchart with AI", category: "Actions", shortcut: "⌘I", icon: "✨", keywords: ["prompt", "chat", "assist"], perform: onOpenAI },
      { id: "act-layout", title: "Auto-Arrange Entire Diagram", category: "Actions", shortcut: "⌘L", icon: "⚡", keywords: ["organize", "clean", "format"], perform: onAutoLayout },
      { id: "act-overlaps", title: "Fix Overlapping Steps", category: "Actions", icon: "↔", keywords: ["nudge", "spacing"], perform: onFixOverlaps },
      
      ...(onAutoConnectAll
        ? [{ id: "act-autoconnect", title: "Auto-Connect & Wire All Steps", category: "Actions" as const, icon: "🔗", keywords: ["repair", "missing connections", "chain"], perform: onAutoConnectAll }]
        : []),
      ...(onChainSelected
        ? [{ id: "act-chain", title: "Chain Selected Steps Sequentially", category: "Actions" as const, icon: "⛓", keywords: ["connect selection", "link"], perform: onChainSelected }]
        : []),

      // Node creation
      { id: "act-add-step", title: "Add Process Step", category: "Nodes", shortcut: "N", icon: "⚙", keywords: ["action", "box", "card"], perform: () => onAddNode("step") },
      { id: "act-add-dec", title: "Add Decision Branch", category: "Nodes", icon: "◆", keywords: ["if", "branch", "diamond"], perform: () => onAddNode("decision") },
      { id: "act-add-sub", title: "Add Sub-Process Block", category: "Nodes", icon: "☵", keywords: ["nested", "module"], perform: () => onAddNode("sub") },
      { id: "act-add-note", title: "Add Sticky Comment Note", category: "Nodes", shortcut: "C", icon: "📌", keywords: ["comment", "memo"], perform: () => onAddNode("note") },

      // Actors
      ...(onBatchSetActor
        ? ACTOR_ORDER.map((a) => ({
            id: `actor-${a}`,
            title: `Set Actor to: ${ACTOR_STYLES[a].label}`,
            category: "Actors" as const,
            icon: ACTOR_STYLES[a].icon,
            keywords: [a, "role", "responsibility", "ownership"],
            perform: () => onBatchSetActor(a),
          }))
        : []),

      // View
      { id: "view-fit", title: "Fit All Steps to Viewport", category: "View", shortcut: "⇧1", icon: "⊡", keywords: ["zoom to fit", "center"], perform: onFitView },
      { id: "view-reset", title: "Reset Zoom to 100%", category: "View", shortcut: "⌘0", icon: "1:1", keywords: ["actual size"], perform: onResetZoom },
      { id: "view-toggle-mode", title: "Toggle Detailed / Compact Mode", category: "View", icon: "👁", keywords: ["switch view", "sop"], perform: onToggleViewMode },
      { id: "view-toggle-snap", title: "Toggle Grid Snapping", category: "View", shortcut: "G", icon: "▦", keywords: ["align grid"], perform: onToggleSnap },

      // Export
      { id: "exp-open", title: "Export as High-Res PNG / SVG Image", category: "Export", icon: "🖼", keywords: ["download", "picture", "vector"], perform: onOpenExport },
      { id: "exp-json", title: "Download Diagram as JSON Backup", category: "Export", icon: "💾", keywords: ["save", "backup", "raw"], perform: onExportJSON },
    ];

    // Other diagrams
    diagrams.forEach((d) => {
      list.push({
        id: `diag-${d.slug}`,
        title: `Switch to: ${d.title}`,
        category: "Flowcharts",
        icon: "📁",
        keywords: [d.slug, d.description || ""],
        perform: () => {
          window.location.href = `/diagram/${d.slug}`;
        },
      });
    });

    // Nodes in current diagram
    nodes.forEach((n) => {
      list.push({
        id: `node-${n.id}`,
        title: n.label || `Untitled ${n.type}`,
        category: "Navigation",
        icon: n.type === "decision" ? "◆" : n.type === "start" || n.type === "ok" ? "▶" : n.type === "note" ? "📌" : "⚙",
        keywords: [n.detail || "", n.actor || "", ...(n.tools || [])],
        perform: () => onSelectNode(n.id),
      });
    });

    return list;
  }, [
    nodes,
    diagrams,
    onOpenAI,
    onAutoLayout,
    onFixOverlaps,
    onAutoConnectAll,
    onChainSelected,
    onBatchSetActor,
    onAddNode,
    onFitView,
    onResetZoom,
    onToggleViewMode,
    onToggleSnap,
    onOpenExport,
    onExportJSON,
    onSelectNode,
  ]);

  // Filter commands by search query
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allCommands;
    return allCommands.filter((c) => {
      if (c.title.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)) return true;
      if (c.keywords?.some((kw) => kw.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [allCommands, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered.length]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => (i + 1) % (filtered.length || 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => (i - 1 + filtered.length) % (filtered.length || 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = filtered[selectedIndex];
      if (target) {
        target.perform();
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[850] flex items-start justify-center pt-[12vh] px-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
        className="w-full max-w-xl bg-white dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-2xl overflow-hidden flex flex-col max-h-[70vh]"
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-zinc-200 dark:border-zinc-700/80 bg-zinc-50/50 dark:bg-zinc-900/30">
          <svg className="w-5 h-5 text-zinc-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command, search steps, or switch diagrams…"
            className="w-full bg-transparent text-[14px] text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 outline-none"
          />
          <kbd className="text-[10px] font-mono text-zinc-400 border border-zinc-300 dark:border-zinc-600 px-1.5 py-0.5 rounded">
            ESC
          </kbd>
        </div>

        {/* Command List */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-zinc-400 text-xs">
              No matching commands or steps found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    item.perform();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                    isSelected
                      ? "bg-sky-50 dark:bg-sky-950/50 text-sky-950 dark:text-sky-100 font-medium"
                      : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700/50"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-5 text-center text-sm shrink-0">{item.icon}</span>
                    <span className="text-[13px] truncate">{item.title}</span>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-700/60 shrink-0">
                      {item.category}
                    </span>
                  </div>
                  {item.shortcut && (
                    <kbd className="shrink-0 text-[11px] font-mono text-zinc-400 border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5 rounded">
                      {item.shortcut}
                    </kbd>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer info bar */}
        <div className="px-4 py-2 border-t border-zinc-100 dark:border-zinc-700/60 bg-zinc-50 dark:bg-zinc-900/40 text-[11px] text-zinc-400 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span>↑↓ to navigate</span>
            <span>↵ to select</span>
            <span>esc to close</span>
          </div>
          <span>{filtered.length} items</span>
        </div>
      </div>
    </div>
  );
}
