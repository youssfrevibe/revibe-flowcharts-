"use client";

import { useMemo, useState } from "react";
import { FlowConnection, FlowNode, NodeType } from "@/lib/types";
import { connId } from "@/lib/ops";
import { getNodeFill } from "@/lib/node-colors";

interface Props {
  nodes: FlowNode[];
  connections: FlowConnection[];
  selectedIds: string[];
  selectedConn: string | null;
  readOnly?: boolean;
  onSelectNode: (id: string, additive: boolean) => void;
  onSelectConn: (id: string) => void;
  onRenameNode: (id: string, label: string) => void;
  onFocusNode: (id: string) => void;
  onDeleteNode: (id: string) => void;
}

/** One glyph per node type, matching the silhouettes used on the canvas. */
function TypeIcon({ type, color }: { type: NodeType; color: string }) {
  const common = { fill: "none", stroke: color, strokeWidth: 1.6 };
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 shrink-0">
      {type === "decision" && <path d="M8 2l6 6-6 6-6-6z" {...common} />}
      {(type === "start" || type === "ok" || type === "fail") && (
        <rect x="1.5" y="4" width="13" height="8" rx="4" {...common} />
      )}
      {type === "step" && <rect x="1.5" y="3.5" width="13" height="9" rx="2" {...common} />}
      {type === "sub" && (
        <>
          <rect x="1.5" y="3.5" width="13" height="9" rx="2" {...common} />
          <path d="M4 3.5v9M12 3.5v9" {...common} />
        </>
      )}
      {type === "note" && <path d="M2 3h12v7H7l-3 3v-3H2z" {...common} />}
    </svg>
  );
}

/**
 * The left rail: every shape and pathway in the diagram as a flat, clickable list.
 *
 * On a flow this size the canvas alone is a poor way to find one specific step — you had to
 * pan around hunting for it. Selecting a row here selects it on the canvas, double-clicking
 * renames it in place, and the arrow button jumps the viewport to it.
 */
export default function LayersPanel({
  nodes,
  connections,
  selectedIds,
  selectedConn,
  readOnly,
  onSelectNode,
  onSelectConn,
  onRenameNode,
  onFocusNode,
  onDeleteNode,
}: Props) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"shapes" | "pathways">("shapes");
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);

  const q = query.trim().toLowerCase();
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const visibleNodes = useMemo(
    () => (q ? nodes.filter((n) => `${n.label} ${n.detail}`.toLowerCase().includes(q)) : nodes),
    [nodes, q]
  );
  const visibleConns = useMemo(() => {
    if (!q) return connections;
    return connections.filter((c) => {
      const a = nodeById.get(c.from)?.label ?? "";
      const b = nodeById.get(c.to)?.label ?? "";
      return `${c.label} ${a} ${b}`.toLowerCase().includes(q);
    });
  }, [connections, nodeById, q]);

  const commitRename = () => {
    if (editing) onRenameNode(editing.id, editing.value.trim() || "Untitled");
    setEditing(null);
  };

  return (
    <aside
      className="ui-panel w-[248px] shrink-0 flex flex-col border-r"
      style={{ borderColor: "var(--ui-border)" }}
      aria-label="Layers"
    >
      {/* Tabs */}
      <div className="flex items-center gap-1 px-2 pt-2 pb-1.5">
        {(["shapes", "pathways"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            data-selected={tab === t}
            className="ui-btn h-6 px-2 text-[11px] font-medium capitalize"
          >
            {t}
            <span style={{ color: "var(--ui-text-faint)" }}>
              {t === "shapes" ? nodes.length : connections.length}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="px-2 pb-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tab === "shapes" ? "Find a step…" : "Find a pathway…"}
          aria-label="Search layers"
          className="ui-field"
        />
      </div>

      <div className="flex-1 overflow-y-auto pb-3">
        {tab === "shapes" &&
          (visibleNodes.length === 0 ? (
            <Empty text={q ? "No shapes match." : "No shapes yet."} />
          ) : (
            visibleNodes.map((n) => {
              const selected = selectedIds.includes(n.id);
              const isEditing = editing?.id === n.id;
              return (
                <div
                  key={n.id}
                  onMouseDown={(e) => {
                    if (isEditing) return;
                    onSelectNode(n.id, e.shiftKey || e.ctrlKey || e.metaKey);
                  }}
                  onDoubleClick={() => !readOnly && setEditing({ id: n.id, value: n.label })}
                  className="group flex items-center gap-2 h-7 pl-3 pr-1.5 cursor-default text-[11.5px]"
                  style={{
                    background: selected ? "var(--ui-accent-soft)" : undefined,
                    color: selected ? "var(--ui-text)" : "var(--ui-text-dim)",
                  }}
                  onMouseEnter={(e) => {
                    if (!selected) e.currentTarget.style.background = "var(--ui-hover)";
                  }}
                  onMouseLeave={(e) => {
                    if (!selected) e.currentTarget.style.background = "";
                  }}
                >
                  <TypeIcon type={n.type} color={getNodeFill(n.color, n.type, n.type === "note")} />
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editing.value}
                      onChange={(e) => setEditing({ id: n.id, value: e.target.value })}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") setEditing(null);
                      }}
                      className="ui-field h-5 py-0 flex-1"
                    />
                  ) : (
                    <span className="truncate flex-1" title={n.label}>
                      {n.label || <em style={{ color: "var(--ui-text-faint)" }}>Untitled</em>}
                    </span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onFocusNode(n.id);
                    }}
                    title="Scroll the canvas to this shape"
                    aria-label={`Go to ${n.label}`}
                    className="ui-btn w-5 h-5 opacity-0 group-hover:opacity-100"
                  >
                    <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <circle cx="8" cy="8" r="5" />
                      <path d="M8 1v2M8 13v2M1 8h2M13 8h2" />
                    </svg>
                  </button>
                  {!readOnly && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteNode(n.id);
                      }}
                      title="Delete this shape"
                      aria-label={`Delete ${n.label}`}
                      className="ui-btn w-5 h-5 opacity-0 group-hover:opacity-100 hover:!text-[color:var(--ui-danger)]"
                    >
                      <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <path d="M3 4h10M6.5 4V2.5h3V4M12 4l-.7 9.5H4.7L4 4" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })
          ))}

        {tab === "pathways" &&
          (visibleConns.length === 0 ? (
            <Empty text={q ? "No pathways match." : "No pathways yet."} />
          ) : (
            visibleConns.map((c) => {
              const id = connId(c);
              const selected = selectedConn === id;
              const dot =
                c.type === "cyes" ? "#10b981" : c.type === "cno" ? "#ef4444" : c.type === "camber" ? "#f59e0b" : "#a1a1aa";
              return (
                <div
                  key={id}
                  onMouseDown={() => onSelectConn(id)}
                  className="group flex items-center gap-2 h-7 pl-3 pr-2 cursor-default text-[11.5px]"
                  style={{
                    background: selected ? "var(--ui-accent-soft)" : undefined,
                    color: selected ? "var(--ui-text)" : "var(--ui-text-dim)",
                  }}
                  onMouseEnter={(e) => {
                    if (!selected) e.currentTarget.style.background = "var(--ui-hover)";
                  }}
                  onMouseLeave={(e) => {
                    if (!selected) e.currentTarget.style.background = "";
                  }}
                >
                  <span className="w-2.5 h-0.5 rounded-full shrink-0" style={{ background: dot }} />
                  <span className="truncate flex-1">
                    {nodeById.get(c.from)?.label ?? "?"}
                    <span style={{ color: "var(--ui-text-faint)" }}> → </span>
                    {nodeById.get(c.to)?.label ?? "?"}
                  </span>
                  {c.waypoints?.length ? (
                    <span
                      title="This pathway has a hand-drawn route"
                      className="text-[9px] px-1 rounded"
                      style={{ background: "var(--ui-accent-soft)", color: "var(--ui-accent)" }}
                    >
                      routed
                    </span>
                  ) : null}
                  {c.label ? (
                    <span className="text-[10px] truncate max-w-[70px]" style={{ color: "var(--ui-text-faint)" }}>
                      {c.label}
                    </span>
                  ) : null}
                </div>
              );
            })
          ))}
      </div>
    </aside>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="px-3 py-6 text-[11px] text-center" style={{ color: "var(--ui-text-faint)" }}>
      {text}
    </div>
  );
}
