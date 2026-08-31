"use client";

import { FlowNode, NodeType, Port } from "@/lib/types";
import { getNodeStyle, getNodeFill, ACTOR_STYLES } from "@/lib/node-colors";
import React, { useRef, useCallback, useState, useEffect } from "react";

export const TYPE_LABELS: Record<NodeType, string> = {
  start: "Start",
  step: "Process Step",
  decision: "Decision",
  sub: "Sub-Process",
  ok: "Outcome",
  fail: "Outcome",
  note: "Comment",
};

export const TYPE_ICONS: Record<NodeType, string> = {
  start: "▶",
  step: "⚙",
  decision: "◆",
  sub: "☵",
  ok: "✓",
  fail: "✕",
  note: "✎",
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

interface Props {
  node: FlowNode;
  isSelected: boolean;
  /** Highlighted because a pathway end is being dragged over this shape. */
  isDropTarget?: boolean;
  viewMode?: "standard" | "detailed";
  onMouseDown: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onPortMouseDown: (e: React.MouseEvent, port: string) => void;
  onPortMouseUp: (e: React.MouseEvent, port: string) => void;
  onQuickAdd?: (fromNodeId: string, fromPort: Port, targetType?: NodeType) => void;
  onUpdate?: (updated: FlowNode) => void;
  onDelete?: (id: string) => void;
}

function FlowNodeCard({
  node,
  isSelected,
  isDropTarget,
  viewMode = "standard",
  onMouseDown,
  onDoubleClick,
  onContextMenu,
  onPortMouseDown,
  onPortMouseUp,
  onQuickAdd,
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
      if ((e.target as HTMLElement).dataset.port || (e.target as HTMLElement).dataset.quickadd) return;
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
  const { className: colorCls, customStyle, fill } = getNodeStyle(node.color, node.type, isNote);

  // Actor pill & left accent border
  const actorStyle = node.actor && !isNote ? ACTOR_STYLES[node.actor] : undefined;
  const actorTitle = actorStyle ? `${actorStyle.label} — ${actorStyle.desc}` : undefined;

  // Stages
  const internalStage = (node.internalStage || "").trim() || null;
  const externalStage = (node.externalStage || "").trim() || null;
  const legacyStage = (node.stage || "").trim() || null;
  const hasStageBlock = internalStage || externalStage || legacyStage;
  const stagesShared = internalStage && externalStage && internalStage === externalStage;

  const renderStageLines = (isDarkNode: boolean) => {
    if (!hasStageBlock) return null;
    const badgeCls = isDarkNode
      ? "bg-black/35 text-white/90 border-white/15"
      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700";
    const labelCls = isDarkNode ? "text-white/60" : "text-zinc-500 dark:text-zinc-400";

    if (stagesShared && internalStage) {
      return (
        <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium border ${badgeCls}`}>
          <span className={`text-[8.5px] uppercase font-bold tracking-wider ${labelCls}`}>Stage</span>
          <span className="font-semibold">{internalStage}</span>
        </div>
      );
    }
    return (
      <div className="flex flex-wrap gap-1">
        {internalStage && (
          <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] border ${badgeCls}`}>
            <span className={`text-[8px] uppercase font-bold tracking-wider ${labelCls}`}>Internal</span>
            <span className="font-semibold">{internalStage}</span>
          </div>
        )}
        {externalStage && (
          <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] border ${badgeCls}`}>
            <span className={`text-[8px] uppercase font-bold tracking-wider ${labelCls}`}>External</span>
            <span className="font-semibold">{externalStage}</span>
          </div>
        )}
        {!internalStage && !externalStage && legacyStage && (
          <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] border ${badgeCls}`}>
            <span className={`text-[8px] uppercase font-bold tracking-wider ${labelCls}`}>Stage</span>
            <span className="font-semibold">{legacyStage}</span>
          </div>
        )}
      </div>
    );
  };

  // Text layout properties
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
      ? { title: "text-[12px]", detail: "text-[10px]", header: "text-[8.5px]" }
      : node.textSize === "lg"
      ? { title: "text-[15.5px]", detail: "text-[12.5px]", header: "text-[10.5px]" }
      : { title: "text-[13.5px]", detail: "text-[11px]", header: "text-[9px]" };

  // Width calculations
  const getWidthStyle = (): React.CSSProperties => {
    if (typeof node.customWidth === "number") return { width: node.customWidth };
    if (node.customWidth === "compact") return { width: 175 };
    if (node.customWidth === "wide") return { width: 320 };
    if (node.customWidth === "xwide") return { width: 400 };
    return {};
  };

  const widthStyle = getWidthStyle();

  // Ports & Quick-Add handles
  const ports = (["top", "bottom", "left", "right"] as const).map((port) => {
    const pos: Record<string, string> = {
      top: "-top-2 left-1/2 -translate-x-1/2",
      bottom: "-bottom-2 left-1/2 -translate-x-1/2",
      left: "-left-2 top-1/2 -translate-y-1/2",
      right: "-right-2 top-1/2 -translate-y-1/2",
    };

    return (
      <div
        key={port}
        data-port={port}
        data-node={node.id}
        className={`group/port absolute w-4 h-4 rounded-full flex items-center justify-center cursor-crosshair z-30 opacity-0 group-hover:opacity-100 transition-opacity duration-150 ${pos[port]}`}
        title="Drag to connect — or click + to add next step"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onPortMouseDown(e, port);
        }}
        onMouseUp={(e) => onPortMouseUp(e, port)}
      >
        <div className="w-2.5 h-2.5 rounded-full bg-sky-400 dark:bg-sky-400 border-2 border-white dark:border-zinc-900 shadow-md group-hover/port:scale-125 transition-transform" />
        {onQuickAdd && (
          <button
            type="button"
            data-quickadd={port}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onQuickAdd(node.id, port, node.type === "decision" ? "step" : undefined);
            }}
            className="absolute -top-3 -right-3 w-4 h-4 rounded-full bg-sky-500 hover:bg-sky-400 text-white text-[10px] font-bold flex items-center justify-center opacity-0 group-hover/port:opacity-100 shadow-md transition-all scale-90 hover:scale-110"
            title="Quick add connected step"
          >
            +
          </button>
        )}
      </div>
    );
  });

  const stateShadow = isSelected
    ? "ring-2 ring-sky-400 ring-offset-2 ring-offset-transparent shadow-xl scale-[1.008]"
    : isDropTarget
    ? "ring-2 ring-emerald-400 ring-offset-2 ring-offset-transparent shadow-lg scale-[1.008]"
    : "hover:shadow-lg";

  const wrapperProps = {
    ref,
    role: "article",
    "aria-label": `${TYPE_LABELS[node.type]}: ${node.label}`,
    tabIndex: 0,
    className: `absolute cursor-move select-none group z-10 transition-transform duration-100 ${stateShadow}`,
    style: { left: node.x, top: node.y } as React.CSSProperties,
    "data-node-id": node.id,
    onMouseDown: handleMouseDown,
    onDoubleClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isNote) setIsEditingNote(true);
      else onDoubleClick();
    },
    onContextMenu,
  };

  /* ------------------------------ DECISION: Refined Diamond ------------------------------ */
  if (shape === "decision") {
    const w = isDetailed ? 250 : widthStyle.width ? (widthStyle.width as number) : 210;
    const h = isDetailed ? 175 : Math.round(w * 0.72);

    return (
      <div {...wrapperProps} style={{ left: node.x, top: node.y, width: w, height: h }}>
        {/* Geometric Diamond SVG Backdrop with anti-aliasing & corner fillets */}
        <svg
          viewBox="0 0 100 70"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none drop-shadow-md overflow-visible"
        >
          <polygon
            points="50,2 97,35 50,68 3,35"
            fill={fill}
            stroke={actorStyle?.ring || "rgba(255,255,255,0.25)"}
            strokeWidth={actorStyle ? "2" : "1"}
            strokeLinejoin="round"
          />
        </svg>

        {/* Content Container positioned safely inside diamond boundaries */}
        <div className={`absolute inset-0 flex flex-col justify-center px-[20%] py-3 text-white ${alignCls}`}>
          {actorStyle && (
            <div
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8.5px] font-bold uppercase tracking-wider mb-0.5 shadow-xs"
              style={{ backgroundColor: actorStyle.pillDark, color: actorStyle.accent }}
              title={actorTitle}
            >
              <span>{actorStyle.icon}</span>
              <span>{actorStyle.shortLabel}</span>
            </div>
          )}

          <div className={`${sizeCls.header} font-bold uppercase tracking-wider text-amber-200/90 flex items-center gap-1`}>
            <span>Decision</span>
            {node.sla && <span className="text-emerald-200 font-mono">· {node.sla}</span>}
          </div>

          {hasStageBlock && <div className="mt-1">{renderStageLines(true)}</div>}

          <div className={`${sizeCls.title} font-bold leading-tight text-white mt-1 text-balance`}>
            {node.label}
          </div>

          {node.detail && (
            <div className={`${sizeCls.detail} leading-tight text-white/85 mt-1 line-clamp-2 text-balance`}>
              {node.detail}
            </div>
          )}
        </div>
        {ports}
      </div>
    );
  }

  /* --------------------------- TERMINATOR: Pill Shape --------------------------- */
  if (shape === "terminator") {
    return (
      <div {...wrapperProps}>
        <div
          style={{ ...customStyle, ...widthStyle, borderRadius: 9999 }}
          title={actorTitle}
          className={`rounded-full border shadow-md min-w-[180px] max-w-[300px] px-6 py-3.5 ${alignCls} ${colorCls} relative overflow-hidden`}
        >
          {actorStyle && (
            <div
              className="absolute left-0 top-0 bottom-0 w-1.5"
              style={{ backgroundColor: actorStyle.ring }}
              title={actorTitle}
            />
          )}

          <div className="flex items-center justify-between gap-2 w-full">
            <div className={`${sizeCls.header} font-bold uppercase tracking-wider opacity-90 flex items-center gap-1`}>
              <span>{TYPE_ICONS[node.type]}</span>
              <span>{TYPE_LABELS[node.type]}</span>
            </div>
            {actorStyle && (
              <span
                className="text-[8.5px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: actorStyle.pillDark, color: actorStyle.accent }}
              >
                {actorStyle.shortLabel}
              </span>
            )}
            {node.sla && <span className="text-[9px] font-mono opacity-90">SLA {node.sla}</span>}
          </div>

          {hasStageBlock && <div className="mt-1">{renderStageLines(true)}</div>}
          <div className={`${sizeCls.title} font-bold leading-snug mt-1`}>{node.label}</div>
          {node.detail && (
            <div className={`${sizeCls.detail} leading-relaxed opacity-90 mt-0.5`}>{node.detail}</div>
          )}
        </div>
        {ports}
      </div>
    );
  }

  /* --------------------------- NOTE (Tactile Sticky Paper) --------------------------- */
  if (shape === "note") {
    return (
      <div {...wrapperProps}>
        <div
          style={{ ...customStyle, ...widthStyle }}
          className={`rounded-xl border shadow-md min-w-[170px] max-w-[270px] p-3.5 transition-all ${colorCls} relative`}
        >
          {/* Header Bar */}
          <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-black/10 dark:border-white/10 text-[10.5px] font-semibold opacity-90">
            <span className="flex items-center gap-1">
              <span>📌</span>
              <span>Comment</span>
            </span>
            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(node.id);
                }}
                title="Delete comment"
                className="opacity-0 group-hover:opacity-100 hover:text-red-600 transition-opacity p-0.5 rounded text-xs leading-none"
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
              className="w-full bg-transparent resize-none outline-none text-[12.5px] leading-relaxed font-normal text-inherit placeholder-black/40 dark:placeholder-white/40"
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

  /* ------------------- PROCESS (Rectangle) & SUB-PROCESS (Rail Frame) ------------------- */
  const isSub = shape === "subprocess";

  return (
    <div {...wrapperProps}>
      <div
        style={{ ...customStyle, ...widthStyle }}
        title={actorTitle}
        className={`relative rounded-xl border shadow-md min-w-[210px] transition-shadow ${
          isDetailed ? "max-w-[350px]" : "max-w-[290px]"
        } ${colorCls} overflow-hidden`}
      >
        {/* Left Actor Responsibility Accent Strip */}
        {actorStyle && (
          <div
            className="absolute left-0 top-0 bottom-0 w-1 z-20 shadow-xs"
            style={{ backgroundColor: actorStyle.ring }}
            title={actorTitle}
          />
        )}

        {/* Sub-process nested vertical rail lines */}
        {isSub && (
          <>
            <div className="absolute top-0 bottom-0 left-2 w-px bg-white/30 pointer-events-none" />
            <div className="absolute top-0 bottom-0 right-2 w-px bg-white/30 pointer-events-none" />
          </>
        )}

        {/* Card Header */}
        <div className={`px-3.5 pt-2.5 pb-1.5 ${sizeCls.header} font-bold uppercase tracking-wider border-b border-white/15 opacity-95 flex items-center justify-between ${isSub ? "mx-2" : ""}`}>
          <span className="flex items-center gap-1.5">
            <span>{TYPE_ICONS[node.type]}</span>
            <span>{TYPE_LABELS[node.type]}</span>
          </span>

          <div className="flex items-center gap-1.5">
            {actorStyle && (
              <span
                className="text-[8.5px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1 shadow-xs"
                style={{ backgroundColor: actorStyle.pillDark, color: actorStyle.accent }}
              >
                <span>{actorStyle.icon}</span>
                <span>{actorStyle.shortLabel}</span>
              </span>
            )}
            {node.sla && (
              <span className="bg-black/35 px-1.5 py-0.5 rounded text-[8.5px] text-emerald-200 tracking-normal font-mono border border-white/10">
                SLA: {node.sla}
              </span>
            )}
          </div>
        </div>

        {/* Stage Badges */}
        {hasStageBlock && (
          <div className={`px-3.5 pt-2 ${isSub ? "mx-2" : ""}`}>{renderStageLines(true)}</div>
        )}

        {/* Title */}
        <div className={`px-3.5 pt-2 pb-1 ${sizeCls.title} font-bold leading-snug ${alignCls} ${isSub ? "mx-2" : ""}`}>
          {node.label}
        </div>

        {/* Detail */}
        {node.detail && (
          <div className={`px-3.5 pb-2.5 ${sizeCls.detail} leading-relaxed opacity-90 ${alignCls} ${isSub ? "mx-2" : ""}`}>
            {node.detail}
          </div>
        )}

        {/* Detailed Procedure & Tools */}
        {isDetailed && (node.tools?.length || node.agentSteps?.length) ? (
          <div className="px-3.5 pb-3 pt-2 border-t border-white/15 space-y-2 bg-black/25">
            {node.tools && node.tools.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {node.tools.map((t, idx) => (
                  <span
                    key={idx}
                    className="bg-white/15 border border-white/25 text-[9.5px] px-1.5 py-0.5 rounded-md font-medium tracking-tight"
                  >
                    🛠 {t}
                  </span>
                ))}
              </div>
            )}
            {node.agentSteps && node.agentSteps.length > 0 && (
              <div className="space-y-1 pt-1">
                <div className="text-[9px] font-bold uppercase opacity-90 tracking-wider">Standard Procedure</div>
                <ul className="space-y-1">
                  {node.agentSteps.map((step, idx) => (
                    <li key={idx} className="text-[10.5px] leading-snug flex items-start gap-1.5 opacity-95">
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

export default React.memo(FlowNodeCard);
