"use client";

import { FlowNode, FlowConnection, Port } from "@/lib/types";
import { Size, bestPorts, portPos } from "@/lib/graph";
import { connId } from "@/lib/ops";

interface Props {
  nodes: FlowNode[];
  connections: FlowConnection[];
  sizes: Map<string, Size>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  onEditLabel: (id: string) => void;
  ghost?: { x1: number; y1: number; x2: number; y2: number } | null;
}

const STROKE: Record<string, string> = {
  "": "stroke-zinc-400 dark:stroke-zinc-500",
  cyes: "stroke-emerald-500",
  cno: "stroke-red-500",
  camber: "stroke-amber-500",
};
const FILL: Record<string, string> = {
  "": "fill-zinc-400 dark:fill-zinc-500",
  cyes: "fill-emerald-500",
  cno: "fill-red-500",
  camber: "fill-amber-500",
};
const TEXT_FILL: Record<string, string> = {
  "": "fill-zinc-600 dark:fill-zinc-300",
  cyes: "fill-emerald-600 dark:fill-emerald-400",
  cno: "fill-red-600 dark:fill-red-400",
  camber: "fill-amber-600 dark:fill-amber-400",
};

function pathFor(
  st: { x: number; y: number },
  en: { x: number; y: number },
  fp: Port,
  tp: Port
) {
  const vertical = fp === "top" || fp === "bottom";
  const tens = Math.min(Math.abs(vertical ? en.y - st.y : en.x - st.x) * 0.5, 110) + 20;
  let c1: { x: number; y: number };
  let c2: { x: number; y: number };
  const off = (p: Port, pt: { x: number; y: number }) => {
    switch (p) {
      case "bottom":
        return { x: pt.x, y: pt.y + tens };
      case "top":
        return { x: pt.x, y: pt.y - tens };
      case "right":
        return { x: pt.x + tens, y: pt.y };
      case "left":
        return { x: pt.x - tens, y: pt.y };
    }
  };
  c1 = off(fp, st);
  c2 = off(tp, en);
  return `M${st.x},${st.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${en.x},${en.y}`;
}

export default function Connections({
  nodes,
  connections,
  sizes,
  selectedId,
  onSelect,
  onContextMenu,
  onEditLabel,
  ghost,
}: Props) {
  const byId = new Map(nodes.map((n) => [n.id, n]));

  return (
    <svg width="12000" height="12000" className="absolute top-0 left-0 pointer-events-none z-[5]">
      <defs>
        {/* Standard arrow markers */}
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
            <polygon points="0,0 8,4 0,8" className={t === "sel" ? "fill-emerald-500" : FILL[t]} />
          </marker>
        ))}

        {/* Bold pathway arrow markers */}
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
            <polygon points="0,0 9,4.5 0,9" className={t === "sel" ? "fill-emerald-500" : FILL[t]} />
          </marker>
        ))}
      </defs>

      {connections.map((c) => {
        const fn = byId.get(c.from);
        const tn = byId.get(c.to);
        if (!fn || !tn) return null;

        const auto = bestPorts(fn, tn, sizes);
        const fp = c.fromPort || auto.fp;
        const tp = c.toPort || auto.tp;
        const st = portPos(fn, fp, sizes);
        const en = portPos(tn, tp, sizes);
        const d = pathFor(st, en, fp, tp);
        const mx = (st.x + en.x) / 2;
        const my = (st.y + en.y) / 2;
        const id = connId(c);
        const selected = selectedId === id;
        const isBold = Boolean(c.bold);

        return (
          <g key={id}>
            {/* Bold shadow / halo if bold pathway */}
            {isBold && (
              <path
                d={d}
                className="fill-none stroke-emerald-400/20 dark:stroke-emerald-400/25"
                strokeWidth={selected ? 8 : 7}
                style={{ pointerEvents: "none" }}
              />
            )}

            <path
              d={d}
              className={`fill-none ${selected ? "stroke-emerald-500" : STROKE[c.type]}`}
              strokeWidth={selected ? (isBold ? 4.5 : 3) : isBold ? 3.5 : 1.5}
              markerEnd={`url(#arrow${isBold ? "-bold" : ""}${selected ? "-sel" : c.type ? "-" + c.type : ""})`}
              style={{ pointerEvents: "none" }}
            />

            {/* Wide invisible hit area */}
            <path
              d={d}
              fill="none"
              stroke="transparent"
              strokeWidth={16}
              style={{ pointerEvents: "stroke", cursor: "pointer" }}
              onMouseDown={(e) => {
                e.stopPropagation();
                onSelect(id);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onEditLabel(id);
              }}
              onContextMenu={(e) => onContextMenu(e, id)}
            />

            {c.label && (
              <g style={{ pointerEvents: "none" }}>
                <rect
                  x={mx - c.label.length * (isBold ? 3.8 : 3.3) - 7}
                  y={my - (isBold ? 18 : 16)}
                  width={c.label.length * (isBold ? 7.6 : 6.6) + 14}
                  height={isBold ? 18 : 15}
                  rx={5}
                  className={`fill-white/95 dark:fill-zinc-900/95 stroke-zinc-200 dark:stroke-zinc-700 ${
                    isBold ? "stroke-[1.5px]" : "stroke-[0.5px]"
                  }`}
                />
                <text
                  x={mx}
                  y={my - 4.5}
                  textAnchor="middle"
                  className={`${isBold ? "text-[11px] font-extrabold" : "text-[10px] font-bold"} ${TEXT_FILL[c.type]}`}
                >
                  {c.label}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {ghost && (
        <path
          d={`M${ghost.x1},${ghost.y1} C${ghost.x1},${ghost.y1 + 40} ${ghost.x2},${ghost.y2 - 40} ${ghost.x2},${ghost.y2}`}
          className="fill-none stroke-emerald-400"
          strokeWidth={2}
          strokeDasharray="5 4"
          markerEnd="url(#arrow-sel)"
        />
      )}
    </svg>
  );
}
