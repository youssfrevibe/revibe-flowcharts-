"use client";

import { FlowNode, NodeType } from "@/lib/types";
import { getNodeStyle, getNodeFill, ColorPreset, NODE_COLOR_PRESETS, NOTE_COLOR_PRESETS } from "@/lib/node-colors";
import React, { useRef, useCallback, useState, useEffect } from "react";

export const TYPE_LABELS: Record<NodeType, string> = {
  start: "Start",
  step: "Process Step",
  decision: "Decision",
  sub: "Sub-process",
  ok: "Outcome",
  fail: "Outcome",
  note: "Comment",
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
  onUpdate?: (updated: FlowNode) => void;
  onDelete?: (id: string) => void;
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
  onUpdate,
  onDelete,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteText, setNoteText] = useState(node.label || "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setNoteText(node.label || "");
  }, [node.label]);

  useEffect(() => {
    if (isEditingNote && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditingNote]);

  const handleSaveNote = useCallback(() => {
    setIsEditingNote(false);
    if (onUpdate && noteText !== node.label) {
      onUpdate({
        ...node,
        label: noteText.trim() || "Comment",
      });
    }
  }, [node, noteText, onUpdate]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).dataset.port) return;
      if ((e.target as HTMLElement).tagName === "TEXTAREA" || (e.target as HTMLElement).tagName === "INPUT") return;
      if (e.button !== 0) return;
      e.stopPropagation();
      onMouseDown(e);
    },
    [onMouseDown]
  );

  const isDetailed = viewMode === "detailed";
  const shape = SHAPE[node.type];
  const isNote = shape === "note";
  const { className: colorCls, customStyle, fill, textColor } = getNodeStyle(node.color, node.type, isNote);

  // Text layout properties
  const textPos = node.textPosition || "inside";
  const isTextOutside = textPos !== "inside" && !isNote;
  const alignCls =
    node.textAlign === "left"
      ? "text-left items-start"
      : node.textAlign === "right"
      ? "text-right items-end"
      : node.textAlign === "center"
      ? "text-center items-center"
      : shape === "decision" || shape === "terminator"
      ? "text-center items-center"
      : "text-left items-start";

  const sizeCls =
    node.textSize === "sm"
      ? { title: "text-[11.5px]", detail: "text-[9.5px]", header: "text-[8px]" }
      : node.textSize === "lg"
      ? { title: "text-[15px]", detail: "text-[12px]", header: "text-[10px]" }
      : { title: "text-[13px]", detail: "text-[10.5px]", header: "text-[8.5px]" };

  // Width calculations
  const getWidthStyle = (): React.CSSProperties => {
    if (typeof node.customWidth === "number") return { width: node.customWidth };
    if (node.customWidth === "compact") return { width: 170 };
    if (node.customWidth === "wide") return { width: 300 };
    if (node.customWidth === "xwide") return { width: 390 };
    return {};
  };

  const widthStyle = getWidthStyle();

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
      if (isNote) {
        setIsEditingNote(true);
      } else {
        onDoubleClick();
      }
    },
    onContextMenu,
  };

  /* ---------------- External Text Label Container (Anti-Overlap) ---------------- */
  const renderExternalLabel = () => (
    <div
      className={`bg-white/95 dark:bg-zinc-800/95 backdrop-blur border border-zinc-200 dark:border-zinc-700 shadow-md rounded-xl p-2.5 max-w-[260px] min-w-[140px] flex flex-col ${alignCls} pointer-events-auto`}
      style={widthStyle}
    >
      <div className={`${sizeCls.header} font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-0.5 flex items-center gap-1`}>
        <span>{TYPE_LABELS[node.type]}</span>
        {node.sla && <span className="text-emerald-600 dark:text-emerald-400 font-mono">· {node.sla}</span>}
      </div>
      <div className={`${sizeCls.title} font-bold leading-snug text-zinc-900 dark:text-zinc-100`}>
        {node.label}
      </div>
      {node.detail && (
        <div className={`${sizeCls.detail} leading-relaxed text-zinc-600 dark:text-zinc-300 mt-1 line-clamp-3`}>
          {node.detail}
        </div>
      )}
    </div>
  );

  /* ------------------------------ DECISION: diamond ------------------------------ */
  if (shape === "decision") {
    if (isTextOutside) {
      const diamondSize = 64;
      const flexDir =
        textPos === "top"
          ? "flex-col-reverse items-center"
          : textPos === "bottom"
          ? "flex-col items-center"
          : textPos === "left"
          ? "flex-row-reverse items-center"
          : "flex-row items-center";

      return (
        <div {...wrapperProps}>
          <div className={`flex ${flexDir} gap-2.5 items-center`}>
            <div className="relative shrink-0" style={{ width: diamondSize, height: diamondSize }}>
              {isSelected && (
                <div className="absolute -inset-1 bg-emerald-400" style={{ clipPath: DIAMOND }} />
              )}
              <div
                className="absolute inset-0 shadow-sm"
                style={{ clipPath: DIAMOND, backgroundColor: fill }}
              />
              <div className="absolute inset-0 flex items-center justify-center text-white font-bold text-lg">
                ?
              </div>
              {ports}
            </div>
            {renderExternalLabel()}
          </div>
        </div>
      );
    }

    const w = isDetailed ? 250 : widthStyle.width ? (widthStyle.width as number) : 210;
    const h = isDetailed ? 172 : Math.round(w * 0.7);

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
          <div className={`absolute inset-0 flex flex-col justify-center px-[18%] ${alignCls}`}>
            <div className={`${sizeCls.header} font-bold uppercase tracking-wider text-white/60 mb-0.5`}>
              Decision
              {node.sla && <span className="ml-1 text-emerald-200">· {node.sla}</span>}
            </div>
            <div className={`${sizeCls.title} font-bold leading-snug text-white`}>{node.label}</div>
            {node.detail && (
              <div className={`${sizeCls.detail} leading-tight text-white/75 mt-1 line-clamp-2`}>
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
    if (isTextOutside) {
      const flexDir =
        textPos === "top"
          ? "flex-col-reverse items-center"
          : textPos === "bottom"
          ? "flex-col items-center"
          : textPos === "left"
          ? "flex-row-reverse items-center"
          : "flex-row items-center";

      return (
        <div {...wrapperProps}>
          <div className={`flex ${flexDir} gap-2.5 items-center`}>
            <div className="relative shrink-0">
              <div
                style={{ ...customStyle }}
                className={`rounded-full border shadow-sm px-5 py-2 flex items-center justify-center font-bold text-xs ${colorCls} ${
                  isSelected ? "ring-2 ring-offset-1 ring-emerald-400 ring-offset-transparent shadow-xl" : ""
                }`}
              >
                {TYPE_LABELS[node.type]}
              </div>
              {ports}
            </div>
            {renderExternalLabel()}
          </div>
        </div>
      );
    }

    return (
      <div {...wrapperProps}>
        <div
          style={{ ...customStyle, ...widthStyle }}
          className={`rounded-full border shadow-sm min-w-[170px] max-w-[280px] px-6 py-3 ${alignCls} ${colorCls} ${
            isSelected ? "ring-2 ring-offset-1 ring-emerald-400 ring-offset-transparent shadow-xl" : ""
          }`}
        >
          <div className={`${sizeCls.header} font-bold uppercase tracking-wider opacity-60`}>
            {TYPE_LABELS[node.type]}
            {node.sla && <span className="ml-1 text-emerald-200">SLA {node.sla}</span>}
          </div>
          <div className={`${sizeCls.title} font-bold leading-snug mt-0.5`}>{node.label}</div>
          {node.detail && (
            <div className={`${sizeCls.detail} leading-relaxed opacity-80 mt-0.5`}>{node.detail}</div>
          )}
        </div>
        {ports}
      </div>
    );
  }

  /* --------------------------- NOTE (Simple Sticky Comment) --------------------------- */
  if (shape === "note") {
    return (
      <div {...wrapperProps}>
        <div
          style={{ ...customStyle, ...widthStyle }}
          className={`rounded-xl border shadow-sm min-w-[160px] max-w-[260px] p-3.5 transition-all ${colorCls} ${
            isSelected ? "ring-2 ring-offset-2 ring-amber-400 dark:ring-amber-500 shadow-md" : "hover:shadow-md"
          }`}
        >
          {/* Top header bar */}
          <div className="flex items-center justify-between gap-2 mb-1.5 pb-1 border-b border-black/10 dark:border-white/10 text-[10px] font-semibold opacity-60">
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
              Comment
            </span>
            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(node.id);
                }}
                title="Delete comment"
                className="opacity-0 group-hover:opacity-100 hover:text-red-600 transition-opacity p-0.5 rounded"
              >
                ✕
              </button>
            )}
          </div>

          {isEditingNote ? (
            <textarea
              ref={textareaRef}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onBlur={handleSaveNote}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSaveNote();
                } else if (e.key === "Escape") {
                  setIsEditingNote(false);
                  setNoteText(node.label || "");
                }
              }}
              rows={3}
              placeholder="Write a comment..."
              className="w-full bg-transparent resize-none outline-none text-[12.5px] leading-snug font-normal text-inherit placeholder-black/40 dark:placeholder-white/40"
            />
          ) : (
            <div
              onClick={() => setIsEditingNote(true)}
              className="text-[12.5px] leading-relaxed font-normal whitespace-pre-wrap min-h-[36px] cursor-text"
            >
              {node.label || <span className="opacity-40 italic">Click to write comment...</span>}
            </div>
          )}
        </div>
        {ports}
      </div>
    );
  }

  /* ------------------- PROCESS (rectangle) & SUB-PROCESS (double bars) ------------------- */
  const isSub = shape === "subprocess";

  if (isTextOutside) {
    const flexDir =
      textPos === "top"
        ? "flex-col-reverse items-center"
        : textPos === "bottom"
        ? "flex-col items-center"
        : textPos === "left"
        ? "flex-row-reverse items-center"
        : "flex-row items-center";

    return (
      <div {...wrapperProps}>
        <div className={`flex ${flexDir} gap-2.5 items-center`}>
          <div className="relative shrink-0">
            <div
              style={{ ...customStyle }}
              className={`rounded-lg border shadow-sm px-4 py-2 flex items-center justify-center font-bold text-xs ${colorCls} ${
                isSelected ? "ring-2 ring-offset-1 ring-emerald-400 ring-offset-transparent shadow-xl" : ""
              }`}
            >
              {isSub && (
                <>
                  <div className="absolute top-0 bottom-0 left-1 w-px bg-white/40 pointer-events-none" />
                  <div className="absolute top-0 bottom-0 right-1 w-px bg-white/40 pointer-events-none" />
                </>
              )}
              {TYPE_LABELS[node.type]}
            </div>
            {ports}
          </div>
          {renderExternalLabel()}
        </div>
      </div>
    );
  }

  return (
    <div {...wrapperProps}>
      <div
        style={{ ...customStyle, ...widthStyle }}
        className={`relative rounded-[10px] border shadow-sm min-w-[200px] ${
          isDetailed ? "max-w-[340px]" : "max-w-[280px]"
        } ${colorCls} ${
          isSelected ? "ring-2 ring-offset-1 ring-emerald-400 ring-offset-transparent shadow-xl" : ""
        }`}
      >
        {/* Sub-process: double vertical bars */}
        {isSub && (
          <>
            <div className="absolute top-0 bottom-0 left-1.5 w-px bg-white/40 pointer-events-none" />
            <div className="absolute top-0 bottom-0 right-1.5 w-px bg-white/40 pointer-events-none" />
          </>
        )}
        <div className={`px-3.5 pt-2 pb-1 ${sizeCls.header} font-bold uppercase tracking-wider border-b border-white/15 opacity-70 flex items-center justify-between ${isSub ? "mx-2" : ""}`}>
          <span>{TYPE_LABELS[node.type]}</span>
          {node.sla && (
            <span className="bg-black/30 px-1.5 py-0.5 rounded text-[8.5px] text-emerald-200 tracking-normal font-mono">
              SLA: {node.sla}
            </span>
          )}
        </div>
        <div className={`px-3.5 pt-2.5 pb-1 ${sizeCls.title} font-bold leading-snug ${alignCls} ${isSub ? "mx-2" : ""}`}>
          {node.label}
        </div>
        {node.detail && (
          <div className={`px-3.5 pb-2 ${sizeCls.detail} leading-relaxed opacity-85 ${alignCls} ${isSub ? "mx-2" : ""}`}>
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
                <div className="text-[9px] font-bold uppercase opacity-70 tracking-wider">Agent Procedure:</div>
                <ul className="space-y-1">
                  {node.agentSteps.map((step, idx) => (
                    <li key={idx} className="text-[10px] leading-snug flex items-start gap-1.5 opacity-90">
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
