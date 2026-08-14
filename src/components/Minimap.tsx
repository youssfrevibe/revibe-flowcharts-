"use client";

import { useMemo } from "react";
import { FlowNode } from "@/lib/types";
import { Size, DEFAULT_SIZE, computeBounds } from "@/lib/graph";

const TYPE_COLOR: Record<string, string> = {
  start: "#059669",
  ok: "#059669",
  step: "#3f3f46",
  decision: "#b45309",
  sub: "#1d4ed8",
  fail: "#dc2626",
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

const MAP_W = 190;
const MAP_H = 130;
const PAD = 200;

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

  // Visible world rectangle.
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
    <div className="fixed bottom-20 left-3.5 z-40 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white/90 dark:bg-zinc-800/90 backdrop-blur shadow-md overflow-hidden">
      <svg
        width={MAP_W}
        height={MAP_H}
        className="block cursor-pointer"
        onMouseDown={handle}
        onClick={handle}
      >
        <rect width={MAP_W} height={MAP_H} className="fill-zinc-50 dark:fill-zinc-900" />
        {nodes.map((n) => {
          const s = sizes.get(n.id) || DEFAULT_SIZE;
          const p = toMini(n.x, n.y);
          return (
            <rect
              key={n.id}
              x={p.x}
              y={p.y}
              width={Math.max(2, s.w * scale)}
              height={Math.max(2, s.h * scale)}
              rx={1}
              fill={TYPE_COLOR[n.type] || "#3f3f46"}
              opacity={0.85}
            />
          );
        })}
        <rect
          x={vTL.x}
          y={vTL.y}
          width={vW}
          height={vH}
          className="fill-emerald-500/10 stroke-emerald-500"
          strokeWidth={1.5}
        />
      </svg>
    </div>
  );
}
