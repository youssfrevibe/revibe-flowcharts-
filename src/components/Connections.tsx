"use client";

import { FlowNode, FlowConnection } from "@/lib/types";

interface Props {
  nodes: FlowNode[];
  connections: FlowConnection[];
  onContextMenu: (e: React.MouseEvent, index: number) => void;
  nodeElements: Map<string, DOMRect>;
}

function getCenter(n: FlowNode, rects: Map<string, DOMRect>) {
  const r = rects.get(n.id);
  const w = r ? r.width : 195;
  const h = r ? r.height : 90;
  return { x: n.x + w / 2, y: n.y + h / 2 };
}

function getPortPos(n: FlowNode, port: string, rects: Map<string, DOMRect>) {
  const r = rects.get(n.id);
  const w = r ? r.width : 195;
  const h = r ? r.height : 90;
  switch (port) {
    case "top": return { x: n.x + w / 2, y: n.y };
    case "bottom": return { x: n.x + w / 2, y: n.y + h };
    case "left": return { x: n.x, y: n.y + h / 2 };
    case "right": return { x: n.x + w, y: n.y + h / 2 };
    default: return getCenter(n, rects);
  }
}

function bestPorts(a: FlowNode, b: FlowNode, rects: Map<string, DOMRect>) {
  const ac = getCenter(a, rects);
  const bc = getCenter(b, rects);
  const dx = bc.x - ac.x;
  const dy = bc.y - ac.y;
  if (Math.abs(dy) > Math.abs(dx)) {
    return { fp: dy > 0 ? "bottom" : "top", tp: dy > 0 ? "top" : "bottom" };
  }
  return { fp: dx > 0 ? "right" : "left", tp: dx > 0 ? "left" : "right" };
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
  "": "fill-zinc-500",
  cyes: "fill-emerald-600 dark:fill-emerald-400",
  cno: "fill-red-600 dark:fill-red-400",
  camber: "fill-amber-600 dark:fill-amber-400",
};

export default function Connections({ nodes, connections, onContextMenu, nodeElements }: Props) {
  return (
    <svg width="6000" height="6000" className="absolute top-0 left-0 pointer-events-none z-[5]">
      <defs>
        {["", "cyes", "cno", "camber"].map((t) => (
          <marker
            key={t}
            id={`arrow${t ? "-" + t : ""}`}
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
          >
            <polygon points="0,0 8,4 0,8" className={FILL[t]} />
          </marker>
        ))}
      </defs>

      {connections.map((c, i) => {
        const fn = nodes.find((n) => n.id === c.from);
        const tn = nodes.find((n) => n.id === c.to);
        if (!fn || !tn) return null;

        const { fp, tp } = bestPorts(fn, tn, nodeElements);
        const st = getPortPos(fn, fp, nodeElements);
        const en = getPortPos(tn, tp, nodeElements);
        const tens = Math.min(
          Math.abs(fp === "bottom" || fp === "top" ? en.y - st.y : en.x - st.x) * 0.5,
          90
        );

        let c1: { x: number; y: number };
        let c2: { x: number; y: number };

        if (fp === "bottom" && tp === "top") {
          c1 = { x: st.x, y: st.y + tens };
          c2 = { x: en.x, y: en.y - tens };
        } else if (fp === "right" && tp === "left") {
          c1 = { x: st.x + tens, y: st.y };
          c2 = { x: en.x - tens, y: en.y };
        } else if (fp === "left" && tp === "right") {
          c1 = { x: st.x - tens, y: st.y };
          c2 = { x: en.x + tens, y: en.y };
        } else if (fp === "top" && tp === "bottom") {
          c1 = { x: st.x, y: st.y - tens };
          c2 = { x: en.x, y: en.y + tens };
        } else {
          c1 = { x: st.x, y: st.y + tens };
          c2 = { x: en.x, y: en.y - tens };
        }

        const d = `M${st.x},${st.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${en.x},${en.y}`;
        const mx = (st.x + en.x) / 2;
        const my = (st.y + en.y) / 2 - 8;

        return (
          <g key={i}>
            <path
              d={d}
              className={`fill-none ${STROKE[c.type]} transition-[stroke-width]`}
              strokeWidth={1.5}
              markerEnd={`url(#arrow${c.type ? "-" + c.type : ""})`}
              style={{ pointerEvents: "stroke", cursor: "pointer" }}
              onContextMenu={(e) => onContextMenu(e, i)}
            />
            {/* Wider invisible hit area */}
            <path
              d={d}
              fill="none"
              stroke="transparent"
              strokeWidth={12}
              style={{ pointerEvents: "stroke", cursor: "pointer" }}
              onContextMenu={(e) => onContextMenu(e, i)}
            />
            {c.label && (
              <text
                x={mx}
                y={my}
                textAnchor="middle"
                className={`text-[10px] font-bold ${TEXT_FILL[c.type]} pointer-events-none`}
              >
                {c.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
