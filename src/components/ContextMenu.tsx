"use client";

import React from "react";

export interface ContextMenuSwatch {
  id: string;
  fill: string;
  name: string;
  onClick: () => void;
}

export interface ContextMenuItem {
  label?: string;
  action?: () => void;
  danger?: boolean;
  separator?: boolean;
  header?: string;
  swatches?: ContextMenuSwatch[];
  customRender?: React.ReactNode;
}

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: Props) {
  // Prevent overflow on right and bottom of screen
  const adjustedX = typeof window !== "undefined" && x + 240 > window.innerWidth ? window.innerWidth - 245 : x;
  const adjustedY = typeof window !== "undefined" && y + 360 > window.innerHeight ? window.innerHeight - 365 : y;

  return (
    <>
      <div className="fixed inset-0 z-[290]" onClick={onClose} />
      <div
        className="fixed z-[300] bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-2xl min-w-[210px] p-1.5 backdrop-blur-xs"
        style={{ left: Math.max(10, adjustedX), top: Math.max(10, adjustedY) }}
      >
        {items.map((item, i) => {
          if (item.separator) {
            return <div key={i} className="h-px bg-zinc-200 dark:bg-zinc-700 mx-2 my-1" />;
          }

          if (item.header) {
            return (
              <div key={i} className="px-3 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                {item.header}
              </div>
            );
          }

          if (item.swatches) {
            return (
              <div key={i} className="px-2 py-1.5 flex items-center gap-1.5 flex-wrap max-w-[220px]">
                {item.swatches.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    title={s.name}
                    onClick={() => {
                      s.onClick();
                      onClose();
                    }}
                    className="w-5 h-5 rounded-full border border-black/15 hover:scale-125 transition-transform"
                    style={{ backgroundColor: s.fill }}
                  />
                ))}
              </div>
            );
          }

          if (item.customRender) {
            return <div key={i}>{item.customRender}</div>;
          }

          return (
            <button
              key={i}
              onClick={() => {
                if (item.action) item.action();
                onClose();
              }}
              className={`w-full text-left px-3 py-1.5 text-[12.5px] rounded-lg transition-colors flex items-center justify-between ${
                item.danger
                  ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50"
                  : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"
              }`}
            >
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
