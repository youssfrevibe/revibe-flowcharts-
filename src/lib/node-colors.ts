import React from "react";
import { NodeType } from "./types";

export interface ColorPreset {
  id: string;
  name: string;
  fill: string;
  border: string;
  bgClass: string;
  isLight?: boolean;
}

export const NODE_COLOR_PRESETS: ColorPreset[] = [
  { id: "emerald", name: "Emerald", fill: "#047857", border: "#059669", bgClass: "bg-emerald-700 border-emerald-700 text-white" },
  { id: "teal", name: "Teal", fill: "#0f766e", border: "#14b8a6", bgClass: "bg-teal-700 border-teal-700 text-white" },
  { id: "cyan", name: "Cyan", fill: "#0e7490", border: "#06b6d4", bgClass: "bg-cyan-700 border-cyan-600 text-white" },
  { id: "blue", name: "Blue", fill: "#1d4ed8", border: "#3b82f6", bgClass: "bg-blue-700 border-blue-600 text-white" },
  { id: "indigo", name: "Indigo", fill: "#4338ca", border: "#6366f1", bgClass: "bg-indigo-700 border-indigo-600 text-white" },
  { id: "violet", name: "Violet", fill: "#6d28d9", border: "#8b5cf6", bgClass: "bg-violet-700 border-violet-600 text-white" },
  { id: "purple", name: "Purple", fill: "#7e22ce", border: "#a855f7", bgClass: "bg-purple-700 border-purple-600 text-white" },
  { id: "pink", name: "Pink", fill: "#be185d", border: "#ec4899", bgClass: "bg-pink-700 border-pink-600 text-white" },
  { id: "rose", name: "Rose", fill: "#e11d48", border: "#f43f5e", bgClass: "bg-rose-600 border-rose-600 text-white" },
  { id: "amber", name: "Amber", fill: "#b45309", border: "#f59e0b", bgClass: "bg-amber-700 border-amber-600 text-white" },
  { id: "orange", name: "Orange", fill: "#c2410c", border: "#f97316", bgClass: "bg-orange-700 border-orange-600 text-white" },
  { id: "red", name: "Red", fill: "#dc2626", border: "#ef4444", bgClass: "bg-red-600 border-red-600 text-white" },
  { id: "slate", name: "Slate", fill: "#334155", border: "#64748b", bgClass: "bg-slate-700 border-slate-600 text-white" },
  { id: "zinc", name: "Zinc", fill: "#3f3f46", border: "#71717a", bgClass: "bg-zinc-700 border-zinc-600 text-white" },
  { id: "dark", name: "Dark", fill: "#18181b", border: "#27272a", bgClass: "bg-zinc-900 border-zinc-700 text-white" },
];

export const NOTE_COLOR_PRESETS: ColorPreset[] = [
  { id: "amber", name: "Yellow", fill: "#fef08a", border: "#fde047", bgClass: "bg-amber-100 dark:bg-amber-950/80 border-amber-300 dark:border-amber-700/70 text-amber-950 dark:text-amber-100", isLight: true },
  { id: "blue", name: "Blue", fill: "#bae6fd", border: "#7dd3fc", bgClass: "bg-sky-100 dark:bg-sky-950/80 border-sky-300 dark:border-sky-700/70 text-sky-950 dark:text-sky-100", isLight: true },
  { id: "emerald", name: "Green", fill: "#a7f3d0", border: "#6ee7b7", bgClass: "bg-emerald-100 dark:bg-emerald-950/80 border-emerald-300 dark:border-emerald-700/70 text-emerald-950 dark:text-emerald-100", isLight: true },
  { id: "rose", name: "Pink", fill: "#fecdd3", border: "#fda4af", bgClass: "bg-rose-100 dark:bg-rose-950/80 border-rose-300 dark:border-rose-700/70 text-rose-950 dark:text-rose-100", isLight: true },
  { id: "violet", name: "Purple", fill: "#e9d5ff", border: "#d8b4fe", bgClass: "bg-purple-100 dark:bg-purple-950/80 border-purple-300 dark:border-purple-700/70 text-purple-950 dark:text-purple-100", isLight: true },
  { id: "zinc", name: "Gray", fill: "#e4e4e7", border: "#d4d4d8", bgClass: "bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100", isLight: true },
];

export const DEFAULT_TYPE_FILL: Record<NodeType, string> = {
  start: "#047857",
  ok: "#047857",
  step: "#3f3f46",
  decision: "#b45309",
  sub: "#1d4ed8",
  fail: "#dc2626",
  note: "#fef08a",
};

export const DEFAULT_TYPE_STYLES: Record<NodeType, string> = {
  start: "bg-emerald-700 border-emerald-700 text-white",
  step: "bg-zinc-700 border-zinc-600 text-white",
  decision: "bg-amber-700 border-amber-600 text-white",
  sub: "bg-blue-700 border-blue-600 border-dashed text-white",
  ok: "bg-emerald-700 border-emerald-700 text-white",
  fail: "bg-red-600 border-red-600 text-white",
  note: "bg-amber-100 dark:bg-amber-950/80 border-amber-300 dark:border-amber-700/70 text-amber-950 dark:text-amber-100",
};

export function getLuminance(hex: string): number {
  const c = hex.replace("#", "");
  if (c.length !== 6 && c.length !== 3) return 0.5;
  const r = parseInt(c.length === 3 ? c[0] + c[0] : c.slice(0, 2), 16) / 255;
  const g = parseInt(c.length === 3 ? c[1] + c[1] : c.slice(2, 4), 16) / 255;
  const b = parseInt(c.length === 3 ? c[2] + c[2] : c.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function getNodeFill(color?: string, type: NodeType = "step", isNote = false): string {
  if (!color) return isNote ? "#fef08a" : DEFAULT_TYPE_FILL[type] || "#3f3f46";
  if (color.startsWith("#")) return color;
  const presets = isNote ? NOTE_COLOR_PRESETS : NODE_COLOR_PRESETS;
  const found = presets.find((p) => p.id === color);
  return found ? found.fill : DEFAULT_TYPE_FILL[type] || "#3f3f46";
}

export function getNodeStyle(
  color?: string,
  type: NodeType = "step",
  isNote = false
): { className: string; customStyle: React.CSSProperties; fill: string; textColor: string } {
  const fill = getNodeFill(color, type, isNote);

  if (color && color.startsWith("#")) {
    const lum = getLuminance(color);
    const textColor = lum > 0.6 ? "#18181b" : "#ffffff";
    const customStyle: React.CSSProperties = {
      backgroundColor: color,
      borderColor: lum > 0.6 ? "#a1a1aa" : color,
      color: textColor,
    };
    return { className: "border shadow-sm", customStyle, fill, textColor };
  }

  if (color) {
    const presets = isNote ? NOTE_COLOR_PRESETS : NODE_COLOR_PRESETS;
    const found = presets.find((p) => p.id === color);
    if (found) {
      return { className: found.bgClass, customStyle: {}, fill: found.fill, textColor: found.isLight ? "#18181b" : "#ffffff" };
    }
  }

  const defaultCls = isNote ? DEFAULT_TYPE_STYLES.note : DEFAULT_TYPE_STYLES[type] || DEFAULT_TYPE_STYLES.step;
  return { className: defaultCls, customStyle: {}, fill, textColor: isNote ? "#18181b" : "#ffffff" };
}
