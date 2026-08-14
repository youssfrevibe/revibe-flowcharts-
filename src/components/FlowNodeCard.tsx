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
};

const TYPE_STYLES: Record<NodeType, string> = {
  start: "bg-emerald-700 border-emerald-700 text-white",
  step: "bg-zinc-700 border-zinc-600 text-white",
  decision: "bg-amber-700 border-amber-600 border-[1.5px] text-white",
  sub: "bg-blue-700 border-blue-600 border-dashed text-white",
  ok: "bg-emerald-700 border-emerald-700 text-white",
  fail: "bg-red-600 border-red-600 text-white",
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

  const isDetailed = viewMode === "detailed";
  const cardStyle = (node.color && ACCENTS[node.color]) || TYPE_STYLES[node.type];

  return (
    <div
      ref={ref}
      className="absolute cursor-move select-none group z-10"
      style={{ left: node.x, top: node.y }}
      data-node-id={node.id}
      onMouseDown={handleMouseDown}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick();
      }}
      onContextMenu={onContextMenu}
    >
      <div
        className={`rounded-[10px] border shadow-sm min-w-[200px] transition-shadow ${
          isDetailed ? "max-w-[320px]" : "max-w-[265px]"
        } ${cardStyle} ${
          isSelected ? "ring-2 ring-offset-1 ring-emerald-400 ring-offset-transparent shadow-xl" : ""
        }`}
      >
        <div className="px-3.5 pt-2 pb-1 text-[9.5px] font-bold uppercase tracking-wider border-b border-white/15 text-white/60 flex items-center justify-between">
          <span>{TYPE_LABELS[node.type]}</span>
          {node.sla && (
            <span className="bg-black/30 px-1.5 py-0.5 rounded text-[8.5px] text-emerald-200 tracking-normal font-mono">
              SLA: {node.sla}
            </span>
          )}
        </div>
        <div className="px-3.5 pt-2.5 pb-1 text-[13px] font-bold leading-snug">{node.label}</div>
        {node.detail && (
          <div className="px-3.5 pb-2 text-[11px] leading-relaxed text-white/80">{node.detail}</div>
        )}

        {isDetailed && (node.tools?.length || node.agentSteps?.length) ? (
          <div className="px-3.5 pb-3 pt-2 border-t border-white/20 space-y-2 bg-black/20 rounded-b-[9px]">
            {node.tools && node.tools.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {node.tools.map((t, idx) => (
                  <span
                    key={idx}
                    className="bg-white/20 text-[9px] px-1.5 py-0.5 rounded font-mono font-medium"
                  >
                    🛠️ {t}
                  </span>
                ))}
              </div>
            )}
            {node.agentSteps && node.agentSteps.length > 0 && (
              <div className="space-y-1 pt-1">
                <div className="text-[9px] font-bold uppercase text-white/60 tracking-wider">
                  Agent Procedure:
                </div>
                <ul className="space-y-1">
                  {node.agentSteps.map((step, idx) => (
                    <li
                      key={idx}
                      className="text-[10px] leading-snug flex items-start gap-1.5 text-white/90"
                    >
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

      {/* Ports */}
      {(["top", "bottom", "left", "right"] as const).map((port) => {
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
      })}
    </div>
  );
}
