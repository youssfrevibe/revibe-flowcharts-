"use client";

import { useMemo } from "react";
import { FlowNode } from "@/lib/types";
import { Size, DEFAULT_SIZE, computeBounds } from "@/lib/graph";

const TYPE_COLOR: Record<string, string> = {
  start: "#059669",
  ok: "#059669",
  step: "#475569",
  decision: "#d97706",
  sub: "#4f46e5",
  fail: "#dc2626",
  note: "#eab308",
};

interface Props {
  nodes: FlowNode[];
  sizes: Map<string, Size>;
  pan: { x: number; y: number };
  zoom: number;
  viewportW: number;
  viewportH: number;
  onRecenter: (worldX: number, worldY: number) => void;
}

const MAP_W = 200;
const MAP_H = 135;
const PAD = 220;

export default function Minimap({ nodes, sizes, pan, zoom, viewportW, viewportH, onRecenter }: Props) {
  const bounds = useMemo(() => computeBounds(nodes, sizes), [nodes, sizes]);
  if (!bounds || viewportW === 0) return null;

  const worldMinX = bounds.minX - PAD;
  const worldMinY = bounds.minY - PAD;
  const worldW = bounds.w + PAD * 2;
  const worldH = bounds.h + PAD * 2;
  const scale = Math.min(MAP_W / worldW, MAP_H / worldH);
  const offX = (MAP_W - worldW * scale) / 2;
  const offY = (MAP_H - worldH * scale) / 2;

  const toMini = (x: number, y: number) => ({
    x: offX + (x - worldMinX) * scale,
    y: offY + (y - worldMinY) * scale,
  });

  // Visible world rectangle
  const viewX = -pan.x / zoom;
  const viewY = -pan.y / zoom;
  const vTL = toMini(viewX, viewY);
  const vW = (viewportW / zoom) * scale;
  const vH = (viewportH / zoom) * scale;

  const handle = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const worldX = (mx - offX) / scale + worldMinX;
    const worldY = (my - offY) / scale + worldMinY;
    onRecenter(worldX, worldY);
  };

  return (
    <div
      className="absolute bottom-5 left-5 z-40 rounded-2xl border border-zinc-200/90 dark:border-zinc-700/80 bg-white/90 dark:bg-zinc-900/90 shadow-2xl backdrop-blur-md overflow-hidden transition-all hover:scale-[1.02]"
      title="Minimap — click anywhere to pan"
    >
      <div className="flex items-center justify-between px-2.5 py-1 border-b border-zinc-200/60 dark:border-zinc-800 text-[9.5px] font-bold uppercase tracking-wider text-zinc-400">
        <span>Overview</span>
        <span>{nodes.length} steps</span>
      </div>
      <svg
        width={MAP_W}
        height={MAP_H}
        className="block cursor-pointer select-none"
        onMouseDown={handle}
        onClick={handle}
      >
        <rect width={MAP_W} height={MAP_H} className="fill-zinc-50 dark:fill-zinc-950" />
        {nodes.map((n) => {
          const s = sizes.get(n.id) || DEFAULT_SIZE;
          const p = toMini(n.x, n.y);
          return (
            <rect
              key={n.id}
              x={p.x}
              y={p.y}
              width={Math.max(3, s.w * scale)}
              height={Math.max(3, s.h * scale)}
              rx={1.5}
              fill={TYPE_COLOR[n.type] || "#475569"}
              opacity={0.9}
            />
          );
        })}
        {/* Viewport Frame */}
        <rect
          x={vTL.x}
          y={vTL.y}
          width={vW}
          height={vH}
          className="fill-sky-500/15 stroke-sky-500 dark:stroke-sky-400"
          strokeWidth={1.5}
          rx={2}
        />
      </svg>
    </div>
  );
}
