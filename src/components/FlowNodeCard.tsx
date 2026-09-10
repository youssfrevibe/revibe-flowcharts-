"use client";

import { FlowNode, NodeType, Port } from "@/lib/types";
import { getNodeStyle, ACTOR_STYLES, actorVars } from "@/lib/node-colors";
import React, { useRef, useCallback, useState, useEffect } from "react";
import ActorIcon from "./ActorIcon";
import Icon from "./Icon";

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
  /**
   * Every callback takes the node back as an argument rather than closing over it.
   *
   * This component is `React.memo`'d, and memo compares props by identity. When the
   * parent passed `onMouseDown={(e) => onNodeMouseDown(e, node)}` it minted a new
   * function per card per render, so memo never bailed and all 109 cards re-rendered
   * on every drag frame. Handing the node back lets the parent pass one stable
   * function to every card.
   */
  onMouseDown: (e: React.MouseEvent, node: FlowNode) => void;
  onDoubleClick: (node: FlowNode) => void;
  onContextMenu: (e: React.MouseEvent, node: FlowNode) => void;
  onPortMouseDown: (e: React.MouseEvent, node: FlowNode, port: string) => void;
  onPortMouseUp?: (e: React.MouseEvent, node: FlowNode, port: string) => void;
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
      onMouseDown(e, node);
    },
    [onMouseDown, node]
  );

  const isDetailed = viewMode === "detailed";
  const shape = SHAPE[node.type];
  const isNote = shape === "note";
  const { className: colorCls, customStyle, themeFill } = getNodeStyle(node.color, node.type, isNote);

  // Actor pill & left accent border
  const actorStyle = node.actor && !isNote ? ACTOR_STYLES[node.actor] : undefined;
  const actorTitle = actorStyle ? `${actorStyle.label} — ${actorStyle.desc}` : undefined;

  // Stages
  const internalStage = (node.internalStage || "").trim() || null;
  const externalStage = (node.externalStage || "").trim() || null;
  const legacyStage = (node.stage || "").trim() || null;
  const hasStageBlock = internalStage || externalStage || legacyStage;
  const stagesShared = internalStage && externalStage && internalStage === externalStage;

  // Cards follow the theme now, so the stage badges do too — there is no longer a
  // "dark node" case to special-case against.
  const renderStageLines = () => {
    if (!hasStageBlock) return null;
    const badgeCls =
      "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700";
    const labelCls = "text-zinc-500 dark:text-zinc-400";

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

  /**
   * The frozen box, applied to the *visible* card and not only to its wrapper.
   *
   * The wrapper carries the selection ring and the ports, and it is held at the frozen
   * size so pathways always meet the box they were routed against. The card inside it
   * used to size to its own content, so at Compact density — where the same step renders
   * shorter than the box captured at Detailed — the ring and the ports floated around a
   * tall rectangle of empty space with a short card at the top of it.
   *
   * Giving the card the same minimum makes the box and the card the same object again.
   * `minWidth` deliberately overrides the `max-w-*` class (min beats max in CSS), for
   * the same reason: a card narrower than its box leaves the side ports off its edge.
   */
  const frozenBox = node.size ? { minWidth: node.size.w, minHeight: node.size.h } : null;

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
          onPortMouseDown(e, node, port);
        }}
        onMouseUp={(e) => onPortMouseUp?.(e, node, port)}
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
    style: {
      left: node.x,
      top: node.y,
      // One variable drives the card's whole identity — accent strip, hover border and
      // selection ring all resolve from it, so a card never disagrees with itself about
      // who owns the step. Borrowed from the Process Atlas prototype.
      ["--c" as string]: actorStyle?.ring ?? "var(--ui-border-strong)",
      // Geometry is a property of the document, not of how dense the card happens to
      // be right now. A card never renders smaller than its frozen box, in either mode
      // and at either density, or the pathways routed against that box would meet empty
      // space beside it. It may still grow — see the grow-only capture in FlowCanvas.
      ...(node.size ? { minWidth: node.size.w, minHeight: node.size.h } : null),
    } as React.CSSProperties,
    "data-node-id": node.id,
    onMouseDown: handleMouseDown,
    onDoubleClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isNote) setIsEditingNote(true);
      else onDoubleClick(node);
    },
    onContextMenu: (e: React.MouseEvent) => onContextMenu(e, node),
  };

  /* ------------------------------ DECISION: Refined Diamond ------------------------------ */
  if (shape === "decision") {
    // This branch replaces wrapperProps.style wholesale, so the frozen size has to be
    // applied to w/h here — setting it on the wrapper alone is silently discarded below.
    // Without it the diamond resizes with density (250x175 detailed vs 210x151 standard)
    // while routing still uses the stored box, and every pathway into a decision ends in
    // mid-air. Measured, not guessed: this was six detached decisions on the demo chart.
    const locked = node.size ?? null;
    const w = locked ? locked.w : isDetailed ? 250 : widthStyle.width ? (widthStyle.width as number) : 210;
    const h = locked ? locked.h : isDetailed ? 175 : Math.round(w * 0.72);

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
            fill={themeFill}
            stroke={actorStyle?.ring || "var(--ui-border-strong)"}
            strokeWidth={actorStyle ? "2" : "1"}
            strokeLinejoin="round"
          />
        </svg>

        {/* Content Container positioned safely inside diamond boundaries */}
        <div
          className={`absolute inset-0 flex flex-col justify-center px-[20%] py-3 text-zinc-900 dark:text-zinc-50 ${alignCls}`}
          style={customStyle.color ? { color: customStyle.color } : undefined}
        >
          {actorStyle && (
            <div
              className="actor-ink mb-0.5 inline-flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-[0.07em]"
              style={actorVars(actorStyle)}
              title={actorTitle}
            >
              <ActorIcon actor={actorStyle.id} size={11} />
              <span>{actorStyle.shortLabel}</span>
            </div>
          )}

          <div
            className={`${sizeCls.header} flex items-center gap-1 font-bold uppercase tracking-wider`}
            style={{ color: "var(--ui-text-faint)" }}
          >
            <span>Decision</span>
            {node.sla && <span className="font-mono">· {node.sla}</span>}
          </div>

          {hasStageBlock && <div className="mt-1">{renderStageLines()}</div>}

          <div className={`${sizeCls.title} font-bold leading-tight mt-1 text-balance`}>
            {node.label}
          </div>

          {node.detail && (
            <div className={`${sizeCls.detail} leading-tight opacity-80 mt-1 line-clamp-2 text-balance`}>
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
          style={{ ...customStyle, ...widthStyle, ...frozenBox, borderRadius: 9999 }}
          title={actorTitle}
          className={`rounded-full border shadow-md min-w-[180px] max-w-[300px] px-6 py-3.5 flex flex-col justify-center ${alignCls} ${colorCls} relative overflow-hidden`}
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

          {hasStageBlock && <div className="mt-1">{renderStageLines()}</div>}
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
          style={{ ...customStyle, ...widthStyle, ...frozenBox }}
          className={`rounded-xl border shadow-md min-w-[170px] max-w-[270px] p-3.5 transition-all ${colorCls} relative`}
        >
          {/* Header Bar */}
          <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-black/10 dark:border-white/10 text-[10.5px] font-semibold opacity-90">
            <span className="flex items-center gap-1">
              <Icon name="pin" size={11} />
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
        style={{ ...customStyle, ...widthStyle, ...frozenBox }}
        title={actorTitle}
        className={`relative rounded-xl border shadow-md min-w-[210px] transition-shadow ${
          isDetailed ? "max-w-[350px]" : "max-w-[290px]"
        } ${colorCls} overflow-hidden`}
      >
        {/* Left Actor Responsibility Accent Strip */}
        {actorStyle && (
          <div
            className="absolute left-0 top-0 bottom-0 z-20 w-[5px] rounded-l-xl"
            style={{ backgroundColor: actorStyle.ring }}
            title={actorTitle}
          />
        )}

        {/* Sub-process nested vertical rail lines */}
        {isSub && (
          <>
            <div
              className="pointer-events-none absolute bottom-0 left-2 top-0 w-px"
              style={{ background: "var(--ui-border)" }}
            />
            <div
              className="pointer-events-none absolute bottom-0 right-2 top-0 w-px"
              style={{ background: "var(--ui-border)" }}
            />
          </>
        )}

        {/* Card Header */}
        <div
          className={`flex items-center justify-between gap-2 border-b px-3.5 pb-1.5 pt-2.5 ${sizeCls.header} font-bold uppercase tracking-wider ${isSub ? "mx-2" : ""}`}
          style={{ borderColor: "var(--ui-border-soft)", color: "var(--ui-text-faint)" }}
        >
          <span className="flex items-center gap-1.5">
            <span>{TYPE_ICONS[node.type]}</span>
            <span>{TYPE_LABELS[node.type]}</span>
          </span>

          <div className="flex items-center gap-2">
            {actorStyle && (
              // Ink, not a plate. The role used to be pale accent text on a dark wash at
              // 8.5px, which failed contrast in light mode outright (the wash is built
              // for a dark card) and was barely legible in either. Coloured text on the
              // card's own surface is both higher contrast and quieter.
              <span
                className="actor-ink flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-[0.07em]"
                style={actorVars(actorStyle)}
                title={actorTitle}
              >
                <ActorIcon actor={actorStyle.id} size={11} />
                <span>{actorStyle.shortLabel}</span>
              </span>
            )}
            {node.sla && (
              <span
                className="rounded px-1.5 py-0.5 font-mono text-[9px] tracking-normal"
                style={{ background: "var(--ui-hover)", color: "var(--ui-text-dim)" }}
              >
                SLA {node.sla}
              </span>
            )}
          </div>
        </div>

        {/* Stage Badges */}
        {hasStageBlock && (
          <div className={`px-3.5 pt-2 ${isSub ? "mx-2" : ""}`}>{renderStageLines()}</div>
        )}

        {/* Title */}
        <div
          className={`px-3.5 pb-1 pt-2 ${sizeCls.title} font-bold leading-snug ${alignCls} ${isSub ? "mx-2" : ""}`}
          style={{ color: "var(--ui-text)" }}
        >
          {node.label}
        </div>

        {/* Detail */}
        {node.detail && (
          <div
            className={`px-3.5 pb-2.5 ${sizeCls.detail} leading-relaxed ${alignCls} ${isSub ? "mx-2" : ""}`}
            style={{ color: "var(--ui-text-dim)" }}
          >
            {node.detail}
          </div>
        )}

        {/* Detailed Procedure & Tools */}
        {isDetailed && (node.tools?.length || node.agentSteps?.length) ? (
          // `bg-black/25` over a card that is white in light mode is the grey slab in
          // the middle of the card. Everything here now reads from the theme instead.
          <div
            className="space-y-2 border-t px-3.5 pb-3 pt-2"
            style={{ borderColor: "var(--ui-border-soft)", background: "var(--ui-hover)" }}
          >
            {node.tools && node.tools.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {node.tools.map((t, idx) => (
                  <span
                    key={idx}
                    className="rounded-md border px-1.5 py-0.5 text-[9.5px] font-medium tracking-tight"
                    style={{
                      borderColor: "var(--ui-border)",
                      background: "var(--ui-panel)",
                      color: "var(--ui-text-dim)",
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
            {node.agentSteps && node.agentSteps.length > 0 && (
              <div className="space-y-1 pt-1">
                <div
                  className="text-[9px] font-bold uppercase tracking-wider"
                  style={{ color: "var(--ui-text-faint)" }}
                >
                  Standard Procedure
                </div>
                <ol className="space-y-1">
                  {node.agentSteps.map((step, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-1.5 text-[10.5px] leading-snug"
                      style={{ color: "var(--ui-text-dim)" }}
                    >
                      <span
                        className="shrink-0 font-bold tabular-nums"
                        style={{ color: "var(--ui-text-faint)" }}
                      >
                        {idx + 1}.
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
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
