"use client";

import { FlowNode, NodeType } from "@/lib/types";
import { useRef, useCallback } from "react";

const TYPE_LABELS: Record<NodeType, string> = {
  start: "Start",
  step: "Process Step",
  decision: "Decision",
  sub: "Sub-process",
  ok: "Outcome",
  fail: "Outcome",
  note: "Comment / Note",
};

/** Standard flowchart silhouettes per node type. */
type Shape = "process" | "terminator" | "decision" | "subprocess" | "note";
const SHAPE: Record<NodeType, Shape> = {
  start: "terminator",
  ok: "terminator",
  fail: "terminator",
  step: "process",
  sub: "subprocess",
  decision: "decision",
  note: "note",
};

const TYPE_STYLES: Record<NodeType, string> = {
  start: "bg-emerald-700 border-emerald-700 text-white",
  step: "bg-zinc-700 border-zinc-600 text-white",
  decision: "bg-amber-700 border-amber-600 text-white",
  sub: "bg-blue-700 border-blue-600 border-dashed text-white",
  ok: "bg-emerald-700 border-emerald-700 text-white",
  fail: "bg-red-600 border-red-600 text-white",
  note: "bg-yellow-100 dark:bg-yellow-900/40 border-yellow-300 dark:border-yellow-700/60 text-yellow-900 dark:text-yellow-100",
};

/** Optional per-node accent overrides (set via the edit modal). */
export const ACCENTS: Record<string, string> = {
  emerald: "bg-emerald-700 border-emerald-700 text-white",
  blue: "bg-blue-700 border-blue-600 text-white",
  amber: "bg-amber-700 border-amber-600 text-white",
  rose: "bg-rose-600 border-rose-600 text-white",
  violet: "bg-violet-700 border-violet-600 text-white",
  cyan: "bg-cyan-700 border-cyan-600 text-white",
  slate: "bg-slate-700 border-slate-600 text-white",
  zinc: "bg-zinc-700 border-zinc-600 text-white",
};

/** Solid fill colors (for the diamond background, which can't use border classes). */
const FILL: Record<NodeType, string> = {
  start: "#047857",
  ok: "#047857",
  step: "#3f3f46",
  decision: "#b45309",
  sub: "#1d4ed8",
  fail: "#dc2626",
  note: "#fef9c3",
};
const ACCENT_FILL: Record<string, string> = {
  emerald: "#047857",
  blue: "#1d4ed8",
  amber: "#b45309",
  rose: "#e11d48",
  violet: "#6d28d9",
  cyan: "#0e7490",
  slate: "#334155",
  zinc: "#3f3f46",
};

const DIAMOND = "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)";

interface Props {
  node: FlowNode;
  isSelected: boolean;
  viewMode?: "standard" | "detailed";
  onMouseDown: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onPortMouseDown: (e: React.MouseEvent, port: string) => void;
  onPortMouseUp: (e: React.MouseEvent, port: string) => void;
}

export default function FlowNodeCard({
  node,
  isSelected,
  viewMode = "standard",
  onMouseDown,
  onDoubleClick,
  onContextMenu,
  onPortMouseDown,
  onPortMouseUp,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).dataset.port) return;
      if (e.button !== 0) return;
      e.stopPropagation();
      onMouseDown(e);
    },
    [onMouseDown]
  );

  const detailColor = node.type === "note" ? "text-yellow-800/80 dark:text-yellow-200/80" : "text-white/80";
  const isDetailed = viewMode === "detailed";
  const shape = SHAPE[node.type];
  const cardStyle = (node.color && ACCENTS[node.color]) || TYPE_STYLES[node.type];
  const fill = (node.color && ACCENT_FILL[node.color]) || FILL[node.type];

  const ports = (["top", "bottom", "left", "right"] as const).map((port) => {
    const pos: Record<string, string> = {
      top: "-top-1.5 left-1/2 -translate-x-1/2",
      bottom: "-bottom-1.5 left-1/2 -translate-x-1/2",
      left: "-left-1.5 top-1/2 -translate-y-1/2",
      right: "-right-1.5 top-1/2 -translate-y-1/2",
    };
    return (
      <div
        key={port}
        data-port={port}
        data-node={node.id}
        className={`absolute w-3 h-3 rounded-full bg-emerald-400 border-2 border-zinc-900 cursor-crosshair opacity-0 group-hover:opacity-100 hover:scale-125 transition-all z-20 ${pos[port]}`}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onPortMouseDown(e, port);
        }}
        onMouseUp={(e) => onPortMouseUp(e, port)}
      />
    );
  });

  const wrapperProps = {
    ref,
    className: "absolute cursor-move select-none group z-10",
    style: { left: node.x, top: node.y } as React.CSSProperties,
    "data-node-id": node.id,
    onMouseDown: handleMouseDown,
    onDoubleClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      onDoubleClick();
    },
    onContextMenu,
  };

  /* ------------------------------ DECISION: diamond ------------------------------ */
  if (shape === "decision") {
    const w = isDetailed ? 240 : 210;
    const h = isDetailed ? 168 : 148;
    return (
      <div {...wrapperProps}>
        <div className="relative" style={{ width: w, height: h }}>
          {isSelected && (
            <div
              className="absolute -inset-1 bg-emerald-400"
              style={{ clipPath: DIAMOND }}
            />
          )}
          <div
            className="absolute inset-0 shadow-sm"
            style={{ clipPath: DIAMOND, backgroundColor: fill }}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-[18%]">
            <div className="text-[8.5px] font-bold uppercase tracking-wider text-white/60 mb-0.5">
              Decision
              {node.sla && <span className="ml-1 text-emerald-200">· {node.sla}</span>}
            </div>
            <div className="text-[12px] font-bold leading-snug text-white">{node.label}</div>
            {node.detail && (
              <div className="text-[9.5px] leading-tight text-white/75 mt-1 line-clamp-2">
                {node.detail}
              </div>
            )}
          </div>
        </div>
        {ports}
      </div>
    );
  }

  /* --------------------------- TERMINATOR: stadium/pill --------------------------- */
  if (shape === "terminator") {
    return (
      <div {...wrapperProps}>
        <div
          className={`rounded-full border shadow-sm min-w-[170px] max-w-[260px] px-6 py-3 text-center ${cardStyle} ${
            isSelected ? "ring-2 ring-offset-1 ring-emerald-400 ring-offset-transparent shadow-xl" : ""
          }`}
        >
          <div className="text-[8.5px] font-bold uppercase tracking-wider text-white/55">
            {TYPE_LABELS[node.type]}
            {node.sla && <span className="ml-1 text-emerald-200">SLA {node.sla}</span>}
          </div>
          <div className="text-[13px] font-bold leading-snug mt-0.5">{node.label}</div>
          {node.detail && (
            <div className="text-[10.5px] leading-relaxed text-white/80 mt-0.5">{node.detail}</div>
          )}
        </div>
        {ports}
      </div>
    );
  }

  /* --------------------------- NOTE (sticky) --------------------------- */
  if (shape === "note") {
    return (
      <div {...wrapperProps}>
        <div
          className={`rounded-sm shadow-md min-w-[150px] max-w-[240px] px-4 py-3 transform -rotate-1 hover:rotate-0 transition-transform ${cardStyle} ${
            isSelected ? "ring-2 ring-offset-2 ring-yellow-400 shadow-xl" : ""
          }`}
        >
          <div className="text-[12.5px] leading-relaxed font-medium whitespace-pre-wrap">
            {node.label}
          </div>
          {node.detail && (
            <div className="text-[11px] leading-relaxed opacity-75 mt-2 italic">
              {node.detail}
            </div>
          )}
        </div>
        {ports}
      </div>
    );
  }

  /* ------------------- PROCESS (rectangle) & SUB-PROCESS (double bars) ------------------- */
  const isSub = shape === "subprocess";
  return (
    <div {...wrapperProps}>
      <div
        className={`relative rounded-[10px] border shadow-sm min-w-[200px] ${
          isDetailed ? "max-w-[320px]" : "max-w-[265px]"
        } ${cardStyle} ${
          isSelected ? "ring-2 ring-offset-1 ring-emerald-400 ring-offset-transparent shadow-xl" : ""
        }`}
      >
        {/* Sub-process: double vertical bars (predefined process symbol) */}
        {isSub && (
          <>
            <div className="absolute top-0 bottom-0 left-1.5 w-px bg-white/40 pointer-events-none" />
            <div className="absolute top-0 bottom-0 right-1.5 w-px bg-white/40 pointer-events-none" />
          </>
        )}
        <div className={`px-3.5 pt-2 pb-1 text-[9.5px] font-bold uppercase tracking-wider border-b border-white/15 text-white/60 flex items-center justify-between ${isSub ? "mx-2" : ""}`}>
          <span>{TYPE_LABELS[node.type]}</span>
          {node.sla && (
            <span className="bg-black/30 px-1.5 py-0.5 rounded text-[8.5px] text-emerald-200 tracking-normal font-mono">
              SLA: {node.sla}
            </span>
          )}
        </div>
        <div className={`px-3.5 pt-2.5 pb-1 text-[13px] font-bold leading-snug ${isSub ? "mx-2" : ""}`}>
          {node.label}
        </div>
        {node.detail && (
          <div className={`px-3.5 pb-2 text-[11px] leading-relaxed text-white/80 ${isSub ? "mx-2" : ""}`}>
            {node.detail}
          </div>
        )}

        {isDetailed && (node.tools?.length || node.agentSteps?.length) ? (
          <div className="px-3.5 pb-3 pt-2 border-t border-white/20 space-y-2 bg-black/20 rounded-b-[9px]">
            {node.tools && node.tools.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {node.tools.map((t, idx) => (
                  <span key={idx} className="bg-white/20 text-[9px] px-1.5 py-0.5 rounded font-mono font-medium">
                    🛠️ {t}
                  </span>
                ))}
              </div>
            )}
            {node.agentSteps && node.agentSteps.length > 0 && (
              <div className="space-y-1 pt-1">
                <div className="text-[9px] font-bold uppercase text-white/60 tracking-wider">Agent Procedure:</div>
                <ul className="space-y-1">
                  {node.agentSteps.map((step, idx) => (
                    <li key={idx} className="text-[10px] leading-snug flex items-start gap-1.5 text-white/90">
                      <span className="text-emerald-300 font-bold shrink-0">{idx + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : null}
      </div>
      {ports}
    </div>
  );
}
