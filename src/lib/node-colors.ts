import React from "react";
import { Actor, NodeType } from "./types";

export interface ColorPreset {
  id: string;
  name: string;
  fill: string;
  border: string;
  bgClass: string;
  accent: string;
  isLight?: boolean;
}

export const NODE_COLOR_PRESETS: ColorPreset[] = [
  { id: "emerald", name: "Emerald", fill: "#065f46", border: "#059669", bgClass: "bg-emerald-800/90 border-emerald-600/70 text-white", accent: "#34d399" },
  { id: "teal", name: "Teal", fill: "#115e59", border: "#0d9488", bgClass: "bg-teal-800/90 border-teal-600/70 text-white", accent: "#2dd4bf" },
  { id: "cyan", name: "Cyan", fill: "#155e75", border: "#0891b2", bgClass: "bg-cyan-800/90 border-cyan-600/70 text-white", accent: "#38bdf8" },
  { id: "blue", name: "Blue", fill: "#1e40af", border: "#2563eb", bgClass: "bg-blue-800/90 border-blue-600/70 text-white", accent: "#60a5fa" },
  { id: "indigo", name: "Indigo", fill: "#3730a3", border: "#4f46e5", bgClass: "bg-indigo-800/90 border-indigo-600/70 text-white", accent: "#818cf8" },
  { id: "violet", name: "Violet", fill: "#5b21b6", border: "#7c3aed", bgClass: "bg-violet-800/90 border-violet-600/70 text-white", accent: "#a78bfa" },
  { id: "purple", name: "Purple", fill: "#6b21a8", border: "#9333ea", bgClass: "bg-purple-800/90 border-purple-600/70 text-white", accent: "#c084fc" },
  { id: "rose", name: "Rose", fill: "#9f1239", border: "#e11d48", bgClass: "bg-rose-800/90 border-rose-600/70 text-white", accent: "#fb7185" },
  { id: "amber", name: "Amber", fill: "#92400e", border: "#d97706", bgClass: "bg-amber-800/90 border-amber-600/70 text-white", accent: "#fbbf24" },
  { id: "orange", name: "Orange", fill: "#9a3412", border: "#ea580c", bgClass: "bg-orange-800/90 border-orange-600/70 text-white", accent: "#fb923c" },
  { id: "red", name: "Red", fill: "#991b1b", border: "#dc2626", bgClass: "bg-red-800/90 border-red-600/70 text-white", accent: "#f87171" },
  { id: "slate", name: "Slate", fill: "#1e293b", border: "#334155", bgClass: "bg-slate-800/90 border-slate-600/70 text-white", accent: "#94a3b8" },
  { id: "zinc", name: "Zinc", fill: "#27272a", border: "#3f3f46", bgClass: "bg-zinc-800/90 border-zinc-600/70 text-white", accent: "#a1a1aa" },
  { id: "dark", name: "Obsidian", fill: "#18181b", border: "#27272a", bgClass: "bg-zinc-900 border-zinc-700/80 text-white", accent: "#71717a" },
];

export const NOTE_COLOR_PRESETS: ColorPreset[] = [
  { id: "amber", name: "Warm Amber", fill: "#fef3c7", border: "#fde68a", bgClass: "bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-700/60 text-amber-950 dark:text-amber-100", accent: "#f59e0b", isLight: true },
  { id: "blue", name: "Sky Mist", fill: "#e0f2fe", border: "#bae6fd", bgClass: "bg-sky-50 dark:bg-sky-950/60 border-sky-200 dark:border-sky-700/60 text-sky-950 dark:text-sky-100", accent: "#0ea5e9", isLight: true },
  { id: "emerald", name: "Mint Sage", fill: "#d1fae5", border: "#a7f3d0", bgClass: "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-700/60 text-emerald-950 dark:text-emerald-100", accent: "#10b981", isLight: true },
  { id: "rose", name: "Blush Pink", fill: "#ffe4e6", border: "#fecdd3", bgClass: "bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-700/60 text-rose-950 dark:text-rose-100", accent: "#f43f5e", isLight: true },
  { id: "violet", name: "Soft Lavender", fill: "#ede9fe", border: "#ddd6fe", bgClass: "bg-purple-50 dark:bg-purple-950/60 border-purple-200 dark:border-purple-700/60 text-purple-950 dark:text-purple-100", accent: "#8b5cf6", isLight: true },
  { id: "zinc", name: "Clean Stone", fill: "#f4f4f5", border: "#e4e4e7", bgClass: "bg-zinc-50 dark:bg-zinc-800/80 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100", accent: "#71717a", isLight: true },
];

/**
 * "Who does this action" palette — refined with icons, clear roles, subtle badges,
 * and high-contrast styling so responsibilities stand out without harsh visual noise.
 */
export interface ActorStyle {
  id: Actor;
  label: string;
  shortLabel: string;
  icon: string;
  desc: string;
  ring: string;
  accent: string;
  pill: string;
  pillDark: string;
  pillText: string;
  pillTextDark: string;
}

export const ACTOR_STYLES: Record<Actor, ActorStyle> = {
  revibe: {
    id: "revibe",
    label: "Revibe Team",
    shortLabel: "Revibe",
    icon: "👤",
    desc: "Revibe agent, operations lead, or specialist action",
    ring: "#a855f7",
    accent: "#c084fc",
    pill: "#f3e8ff",
    pillDark: "rgba(168, 85, 247, 0.18)",
    pillText: "#7e22ce",
    pillTextDark: "#d8b4fe",
  },
  seller: {
    id: "seller",
    label: "Seller / Supplier",
    shortLabel: "Seller",
    icon: "🏢",
    desc: "External supplier, merchant, or vendor action",
    ring: "#f97316",
    accent: "#fb923c",
    pill: "#ffedd5",
    pillDark: "rgba(249, 115, 22, 0.18)",
    pillText: "#c2410c",
    pillTextDark: "#fdba74",
  },
  system: {
    id: "system",
    label: "System (Automated)",
    shortLabel: "System",
    icon: "⚡",
    desc: "Automated engine, webhook, or script execution",
    ring: "#64748b",
    accent: "#94a3b8",
    pill: "#f1f5f9",
    pillDark: "rgba(100, 116, 139, 0.20)",
    pillText: "#334155",
    pillTextDark: "#cbd5e1",
  },
  carrier: {
    id: "carrier",
    label: "Third Party / Carrier",
    shortLabel: "Carrier",
    icon: "🚚",
    desc: "Courier, shipping partner, repair lab, or QA facility",
    ring: "#06b6d4",
    accent: "#38bdf8",
    pill: "#cffafe",
    pillDark: "rgba(6, 182, 212, 0.18)",
    pillText: "#0e7490",
    pillTextDark: "#67e8f9",
  },
};

export const ACTOR_ORDER: Actor[] = ["revibe", "seller", "system", "carrier"];

export const DEFAULT_TYPE_FILL: Record<NodeType, string> = {
  start: "#065f46",
  ok: "#065f46",
  step: "#27272a",
  decision: "#92400e",
  sub: "#3730a3",
  fail: "#991b1b",
  note: "#fef3c7",
};

export const DEFAULT_TYPE_STYLES: Record<NodeType, string> = {
  start: "bg-emerald-800/90 border-emerald-600/70 text-white",
  step: "bg-zinc-800/90 border-zinc-600/60 text-white",
  decision: "bg-amber-800/90 border-amber-600/70 text-white",
  sub: "bg-indigo-800/90 border-indigo-500/70 border-dashed text-white",
  ok: "bg-emerald-800/90 border-emerald-600/70 text-white",
  fail: "bg-red-800/90 border-red-600/70 text-white",
  note: "bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-700/60 text-amber-950 dark:text-amber-100",
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
  if (!color) return isNote ? "#fef3c7" : DEFAULT_TYPE_FILL[type] || "#27272a";
  if (color.startsWith("#")) return color;
  const presets = isNote ? NOTE_COLOR_PRESETS : NODE_COLOR_PRESETS;
  const found = presets.find((p) => p.id === color);
  return found ? found.fill : DEFAULT_TYPE_FILL[type] || "#27272a";
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
      borderColor: lum > 0.6 ? "#cbd5e1" : color,
      color: textColor,
    };
    return { className: "border shadow-md backdrop-blur-xs", customStyle, fill, textColor };
  }

  if (color) {
    const presets = isNote ? NOTE_COLOR_PRESETS : NODE_COLOR_PRESETS;
    const found = presets.find((p) => p.id === color);
    if (found) {
      return { className: `${found.bgClass} shadow-md backdrop-blur-xs`, customStyle: {}, fill: found.fill, textColor: found.isLight ? "#18181b" : "#ffffff" };
    }
  }

  const defaultCls = isNote ? DEFAULT_TYPE_STYLES.note : DEFAULT_TYPE_STYLES[type] || DEFAULT_TYPE_STYLES.step;
  return { className: `${defaultCls} shadow-md backdrop-blur-xs`, customStyle: {}, fill, textColor: isNote ? "#18181b" : "#ffffff" };
}
