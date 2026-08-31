"use client";

import { memo, useMemo, useState } from "react";
import { FlowNode, Port } from "@/lib/types";
import { Size, computeBounds } from "@/lib/graph";
import { routeHandles, routeSegments, RoutedEdge, LANE_GAP, LANE_STEP } from "@/lib/routing";

export interface WaypointDragStart {
  connId: string;
  /** Index into `waypoints`: the point being moved, or where a new one is inserted. */
  index: number;
  /** "ghost" handles create a waypoint; "point" handles move an existing one. */
  kind: "point" | "ghost";
  x: number;
  y: number;
}

interface Props {
  nodes: FlowNode[];
  /** Pre-solved routes. Computed once by the canvas so the toolbar and the SVG agree. */
  routes: RoutedEdge[];
  sizes: Map<string, Size>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  onEditLabel: (id: string) => void;
  ghost?: { x1: number; y1: number; x2: number; y2: number } | null;
  /** Called when a route handle is grabbed. Omit to disable route editing (view-only). */
  onWaypointDown?: (e: React.MouseEvent, start: WaypointDragStart) => void;
  /** Alt-click / double-click a waypoint handle to remove it. */
  onWaypointRemove?: (connId: string, index: number) => void;
  /** Grabbing a straight run to slide the whole segment sideways. */
  onSegmentDown?: (e: React.MouseEvent, s: SegmentDragStart) => void;
  /** Grabbing either end of a pathway to re-attach it to a different shape. */
  onEndpointDown?: (e: React.MouseEvent, s: EndpointDragStart) => void;
}

export interface SegmentDragStart {
  connId: string;
  index: number;
  axis: "h" | "v";
}

export interface EndpointDragStart {
  connId: string;
  end: "from" | "to";
  x: number;
  y: number;
}

const STROKE: Record<string, string> = {
  "": "stroke-slate-400 dark:stroke-slate-500",
  cyes: "stroke-emerald-500 dark:stroke-emerald-400",
  cno: "stroke-rose-500 dark:stroke-rose-400",
  camber: "stroke-amber-500 dark:stroke-amber-400",
};
const FILL: Record<string, string> = {
  "": "fill-slate-400 dark:fill-slate-500",
  cyes: "fill-emerald-500 dark:fill-emerald-400",
  cno: "fill-rose-500 dark:fill-rose-400",
  camber: "fill-amber-500 dark:fill-amber-400",
};
const TEXT_FILL: Record<string, string> = {
  "": "fill-slate-700 dark:fill-slate-200",
  cyes: "fill-emerald-700 dark:fill-emerald-300",
  cno: "fill-rose-700 dark:fill-rose-300",
  camber: "fill-amber-700 dark:fill-amber-300",
};

export default function Connections({
  nodes,
  routes,
  sizes,
  selectedId,
  onSelect,
  onContextMenu,
  onEditLabel,
  ghost,
  onWaypointDown,
  onWaypointRemove,
  onSegmentDown,
  onEndpointDown,
}: Props) {
  const [hoverId, setHoverId] = useState<string | null>(null);

  const selected = selectedId ? routes.find((r) => r.id === selectedId) : undefined;
  const handles = useMemo(() => (selected && onWaypointDown ? routeHandles(selected) : []), [selected, onWaypointDown]);
  const segments = useMemo(() => (selected && onSegmentDown ? routeSegments(selected) : []), [selected, onSegmentDown]);

  // Size the SVG viewport to the world extent
  const bounds = computeBounds(nodes, sizes);
  const laneReach = LANE_GAP + routes.length * LANE_STEP + 80;
  let minX = bounds ? bounds.minX : 0;
  let minY = bounds ? bounds.minY : 0;
  let maxX = bounds ? bounds.maxX : 1000;
  let maxY = bounds ? bounds.maxY : 1000;
  for (const r of routes) {
    for (const p of r.pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  const MARGIN = Math.max(240, laneReach);
  const vbX = minX - MARGIN;
  const vbY = minY - MARGIN;
  const vbW = maxX - minX + MARGIN * 2;
  const vbH = maxY - minY + MARGIN * 2;

  return (
    <svg
      width={vbW}
      height={vbH}
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      className="absolute pointer-events-none z-[5] overflow-visible"
      style={{ left: vbX, top: vbY }}
    >
      <defs>
        {["", "cyes", "cno", "camber", "sel"].map((t) => (
          <marker
            key={`std-${t}`}
            id={`arrow${t ? "-" + t : ""}`}
            markerWidth="9"
            markerHeight="9"
            refX="7"
            refY="4"
            orient="auto"
          >
            <polygon points="0,0 8,4 0,8" className={t === "sel" ? "fill-sky-400" : FILL[t]} />
          </marker>
        ))}
        {["", "cyes", "cno", "camber", "sel"].map((t) => (
          <marker
            key={`bold-${t}`}
            id={`arrow-bold${t ? "-" + t : ""}`}
            markerWidth="11"
            markerHeight="11"
            refX="8"
            refY="4.5"
            orient="auto"
          >
            <polygon points="0,0 9,4.5 0,9" className={t === "sel" ? "fill-sky-400" : FILL[t]} />
          </marker>
        ))}
      </defs>

      {routes.map((r) => (
        <Edge
          key={r.id}
          r={r}
          selected={selectedId === r.id}
          hovered={hoverId === r.id}
          onSelect={onSelect}
          onContextMenu={onContextMenu}
          onEditLabel={onEditLabel}
          onHover={setHoverId}
        />
      ))}

      {/* Draggable straight runs */}
      {selected &&
        onSegmentDown &&
        segments.map((sg) => (
          <line
            key={`seg-${sg.index}`}
            x1={sg.a.x}
            y1={sg.a.y}
            x2={sg.b.x}
            y2={sg.b.y}
            stroke="transparent"
            strokeWidth={16}
            style={{ pointerEvents: "stroke", cursor: sg.axis === "h" ? "ns-resize" : "ew-resize" }}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onSegmentDown(e, { connId: selected.id, index: sg.index, axis: sg.axis });
            }}
          >
            <title>Drag to slide pathway segment</title>
          </line>
        ))}

      {/* Endpoints */}
      {selected &&
        onEndpointDown &&
        (["from", "to"] as const).map((end) => {
          const p = end === "from" ? selected.start : selected.end;
          return (
            <circle
              key={`end-${end}`}
              cx={p.x}
              cy={p.y}
              r={6}
              className="fill-white dark:fill-zinc-900"
              stroke="#38bdf8"
              strokeWidth={2.5}
              style={{ pointerEvents: "all", cursor: "crosshair" }}
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onEndpointDown(e, { connId: selected.id, end, x: p.x, y: p.y });
              }}
            >
              <title>Drag onto another shape to re-attach endpoint</title>
            </circle>
          );
        })}

      {/* Waypoint handles */}
      {selected &&
        onWaypointDown &&
        handles.map((h) => (
          <g key={`${h.kind}-${h.index}-${Math.round(h.x)}-${Math.round(h.y)}`}>
            <circle
              cx={h.x}
              cy={h.y}
              r={h.kind === "point" ? 6.5 : 5}
              className={h.kind === "point" ? "fill-white dark:fill-zinc-900 shadow-md" : ""}
              fill={h.kind === "ghost" ? "rgba(56, 189, 248, 0.35)" : undefined}
              stroke={h.kind === "point" ? "#38bdf8" : "rgba(56, 189, 248, 0.85)"}
              strokeWidth={h.kind === "point" ? 2.5 : 1.5}
              style={{ pointerEvents: "all", cursor: "grab" }}
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onWaypointDown(e, { connId: selected.id, index: h.index, kind: h.kind, x: h.x, y: h.y });
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (h.kind === "point") onWaypointRemove?.(selected.id, h.index);
              }}
            >
              <title>
                {h.kind === "point"
                  ? "Drag to move bend · double-click to remove"
                  : "Drag to add a bend here"}
              </title>
            </circle>
          </g>
        ))}

      {ghost && (
        <path
          d={`M${ghost.x1},${ghost.y1} C${ghost.x1},${ghost.y1 + 40} ${ghost.x2},${ghost.y2 - 40} ${ghost.x2},${ghost.y2}`}
          className="fill-none"
          stroke="#38bdf8"
          strokeWidth={2.5}
          strokeDasharray="5 4"
          markerEnd="url(#arrow-sel)"
        />
      )}
    </svg>
  );
}

const Edge = memo(function Edge({
  r,
  selected,
  hovered,
  onSelect,
  onContextMenu,
  onEditLabel,
  onHover,
}: {
  r: RoutedEdge;
  selected: boolean;
  hovered: boolean;
  onSelect: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  onEditLabel: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const c = r.conn;
  const isBold = r.bold;
  const lb = r.labelBox;
  const active = selected || hovered;

  return (
    <g>
      {/* Subtle selection / hover glow layer */}
      {active && (
        <path
          d={r.d}
          className="fill-none stroke-sky-400/25 dark:stroke-sky-400/35"
          strokeWidth={selected ? (isBold ? 10 : 8) : 6}
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{ pointerEvents: "none" }}
        />
      )}

      {isBold && !active && (
        <path
          d={r.d}
          className="fill-none stroke-emerald-400/20 dark:stroke-emerald-400/25"
          strokeWidth={7}
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* Main Connection Path */}
      <path
        d={r.d}
        className={`fill-none transition-[stroke-width,stroke] duration-100 ${
          selected || hovered ? "" : STROKE[c.type]
        }`}
        stroke={selected ? "#38bdf8" : hovered ? "#7dd3fc" : undefined}
        strokeWidth={selected ? (isBold ? 4 : 2.75) : isBold ? 3.25 : hovered ? 2.5 : 1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
        markerEnd={`url(#arrow${isBold ? "-bold" : ""}${active ? "-sel" : c.type ? "-" + c.type : ""})`}
        style={{ pointerEvents: "none" }}
      />

      {/* Hand-routed pathway subtle indicator */}
      {r.manual && !selected && (
        <path
          d={r.d}
          className="fill-none stroke-sky-400/30"
          strokeWidth={1}
          strokeDasharray="2 6"
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* Broad invisible hit area for easy mouse interaction */}
      <path
        d={r.d}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        style={{ pointerEvents: "stroke", cursor: "pointer" }}
        onMouseDown={(e) => {
          e.stopPropagation();
          onSelect(r.id);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onEditLabel(r.id);
        }}
        onContextMenu={(e) => onContextMenu(e, r.id)}
        onMouseEnter={() => onHover(r.id)}
        onMouseLeave={() => onHover(null)}
      />

      {/* Pathway High-Contrast Label Card */}
      {r.label && lb && (
        <g style={{ pointerEvents: "none" }}>
          <rect
            x={lb.x}
            y={lb.y}
            width={lb.w}
            height={lb.h}
            rx={6}
            className={`fill-white/95 dark:fill-zinc-900/95 shadow-sm ${
              selected
                ? "stroke-sky-400 stroke-[1.5px]"
                : "stroke-zinc-200 dark:stroke-zinc-700/90 stroke-[1px]"
            }`}
          />
          <text
            x={lb.cx}
            y={lb.cy}
            textAnchor="middle"
            dominantBaseline="central"
            className={`${
              isBold ? "text-[11px] font-extrabold" : "text-[10px] font-bold"
            } ${TEXT_FILL[c.type]}`}
          >
            {r.label}
          </text>
        </g>
      )}
    </g>
  );
});

export type { Port };
