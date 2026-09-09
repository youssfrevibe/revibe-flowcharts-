import React from "react";
import { Actor, NodeType } from "./types";

export interface ColorPreset {
  id: string;
  name: string;
  fill: string;
  /** Surface for light mode; used to build --node-preset-<id>. */
  fillLight?: string;
  /** Surface for dark mode. */
  fillDark?: string;
  border: string;
  bgClass: string;
  accent: string;
  isLight?: boolean;
}

/**
 * Node accent presets. Light surface in light mode, dark wash in dark mode — the same
 * shape the note presets already used. They were `bg-*-800/90 text-white` in both
 * themes, which is why a coloured card stayed a dark slab on a white page.
 *
 * `fill` stays the saturated dark hex because the SVG exporter renders on a dark
 * background outside the document; `fillLight`/`fillDark` feed the per-theme CSS
 * variables that the decision diamond reads.
 */
export const NODE_COLOR_PRESETS: ColorPreset[] = [
  { id: "emerald", name: "Emerald", fill: "#065f46", fillLight: "#ecfdf5", fillDark: "#052e26", border: "#059669", bgClass: "bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-700/60 text-emerald-950 dark:text-emerald-100", accent: "#34d399" },
  { id: "teal", name: "Teal", fill: "#115e59", fillLight: "#f0fdfa", fillDark: "#04312e", border: "#0d9488", bgClass: "bg-teal-50 dark:bg-teal-950/50 border-teal-200 dark:border-teal-700/60 text-teal-950 dark:text-teal-100", accent: "#2dd4bf" },
  { id: "cyan", name: "Cyan", fill: "#155e75", fillLight: "#ecfeff", fillDark: "#083344", border: "#0891b2", bgClass: "bg-cyan-50 dark:bg-cyan-950/50 border-cyan-200 dark:border-cyan-700/60 text-cyan-950 dark:text-cyan-100", accent: "#38bdf8" },
  { id: "blue", name: "Blue", fill: "#1e40af", fillLight: "#eff6ff", fillDark: "#0c1e4a", border: "#2563eb", bgClass: "bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-700/60 text-blue-950 dark:text-blue-100", accent: "#60a5fa" },
  { id: "indigo", name: "Indigo", fill: "#3730a3", fillLight: "#f5f3ff", fillDark: "#231152", border: "#4f46e5", bgClass: "bg-violet-50 dark:bg-violet-950/50 border-violet-200 dark:border-violet-700/60 text-violet-950 dark:text-violet-100", accent: "#818cf8" },
  { id: "violet", name: "Violet", fill: "#5b21b6", fillLight: "#f5f3ff", fillDark: "#2b1065", border: "#7c3aed", bgClass: "bg-violet-50 dark:bg-violet-950/50 border-violet-200 dark:border-violet-700/60 text-violet-950 dark:text-violet-100", accent: "#a78bfa" },
  { id: "purple", name: "Purple", fill: "#6b21a8", fillLight: "#faf5ff", fillDark: "#3b0764", border: "#9333ea", bgClass: "bg-purple-50 dark:bg-purple-950/50 border-purple-200 dark:border-purple-700/60 text-purple-950 dark:text-purple-100", accent: "#c084fc" },
  { id: "rose", name: "Rose", fill: "#9f1239", fillLight: "#fff1f2", fillDark: "#4c0519", border: "#e11d48", bgClass: "bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-700/60 text-rose-950 dark:text-rose-100", accent: "#fb7185" },
  { id: "amber", name: "Amber", fill: "#92400e", fillLight: "#fffbeb", fillDark: "#3a2408", border: "#d97706", bgClass: "bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-700/60 text-amber-950 dark:text-amber-100", accent: "#fbbf24" },
  { id: "orange", name: "Orange", fill: "#9a3412", fillLight: "#fff7ed", fillDark: "#411a05", border: "#ea580c", bgClass: "bg-orange-50 dark:bg-orange-950/50 border-orange-200 dark:border-orange-700/60 text-orange-950 dark:text-orange-100", accent: "#fb923c" },
  { id: "red", name: "Red", fill: "#991b1b", fillLight: "#fef2f2", fillDark: "#3f0d0d", border: "#dc2626", bgClass: "bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-700/60 text-red-950 dark:text-red-100", accent: "#f87171" },
  { id: "slate", name: "Slate", fill: "#1e293b", fillLight: "#f8fafc", fillDark: "#131a26", border: "#334155", bgClass: "bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-700/60 text-slate-950 dark:text-slate-100", accent: "#94a3b8" },
  { id: "zinc", name: "Zinc", fill: "#27272a", fillLight: "#fafafa", fillDark: "#1a1a1d", border: "#3f3f46", bgClass: "bg-zinc-50 dark:bg-zinc-950/50 border-zinc-200 dark:border-zinc-700/60 text-zinc-950 dark:text-zinc-100", accent: "#a1a1aa" },
  { id: "dark", name: "Obsidian", fill: "#18181b", fillLight: "#f4f4f5", fillDark: "#111113", border: "#27272a", bgClass: "bg-zinc-50 dark:bg-zinc-950/50 border-zinc-200 dark:border-zinc-700/60 text-zinc-950 dark:text-zinc-100", accent: "#71717a" },
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

/**
 * On-canvas card surfaces. Light in light mode, dark in dark mode.
 *
 * These were fixed dark fills with white text in both themes, which made the canvas
 * a slab of near-black sitting on a white page. Each type now keeps a *tint* rather
 * than a saturated fill, so the type is still readable at a glance without the card
 * fighting the surface it sits on.
 *
 * `sky` and `indigo` are the Revibe purple and pink scales — see the remap in
 * globals.css. Do not "correct" them to violet/rose.
 */
export const DEFAULT_TYPE_STYLES: Record<NodeType, string> = {
  start:
    "bg-emerald-50 dark:bg-emerald-950/45 border-emerald-300 dark:border-emerald-700/60 text-emerald-950 dark:text-emerald-50",
  step: "bg-white dark:bg-zinc-900/85 border-zinc-200 dark:border-zinc-700/70 text-zinc-900 dark:text-zinc-100",
  decision:
    "bg-sky-50 dark:bg-sky-950/45 border-sky-300 dark:border-sky-700/60 text-sky-950 dark:text-sky-50",
  sub: "bg-indigo-50 dark:bg-indigo-950/45 border-indigo-300 dark:border-indigo-700/60 border-dashed text-indigo-950 dark:text-indigo-50",
  ok: "bg-emerald-50 dark:bg-emerald-950/45 border-emerald-300 dark:border-emerald-700/60 text-emerald-950 dark:text-emerald-50",
  fail: "bg-red-50 dark:bg-red-950/45 border-red-300 dark:border-red-700/60 text-red-950 dark:text-red-50",
  note: "bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-700/60 text-amber-950 dark:text-amber-100",
};

/**
 * The same surfaces as CSS variables, for the decision diamond.
 *
 * That shape is an SVG `<polygon fill="…">`, and an attribute cannot carry a `dark:`
 * variant — so it reads a variable that globals.css redefines per theme. The hex map
 * above it (`DEFAULT_TYPE_FILL`) stays put for the SVG exporter, which renders
 * outside the document with no theme to read.
 */
export const NODE_FILL_VAR: Record<NodeType, string> = {
  start: "var(--node-fill-start)",
  step: "var(--node-fill-step)",
  decision: "var(--node-fill-decision)",
  sub: "var(--node-fill-sub)",
  ok: "var(--node-fill-ok)",
  fail: "var(--node-fill-fail)",
  note: "var(--node-fill-note)",
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
): {
  className: string;
  customStyle: React.CSSProperties;
  /** Literal hex — for the SVG exporter, which has no theme. */
  fill: string;
  /** Theme-aware equivalent — for anything rendered inside the document. */
  themeFill: string;
  textColor: string;
} {
  const fill = getNodeFill(color, type, isNote);

  if (color && color.startsWith("#")) {
    const lum = getLuminance(color);
    const textColor = lum > 0.6 ? "#18181b" : "#ffffff";
    const customStyle: React.CSSProperties = {
      backgroundColor: color,
      borderColor: lum > 0.6 ? "#cbd5e1" : color,
      color: textColor,
    };
    return { className: "border shadow-md backdrop-blur-xs", customStyle, fill, themeFill: color, textColor };
  }

  if (color) {
    const presets = isNote ? NOTE_COLOR_PRESETS : NODE_COLOR_PRESETS;
    const found = presets.find((p) => p.id === color);
    if (found) {
      return {
        className: `${found.bgClass} shadow-md backdrop-blur-xs`,
        customStyle: {},
        fill: found.fill,
        themeFill: `var(--node-preset-${found.id})`,
        textColor: found.isLight ? "#18181b" : "#ffffff",
      };
    }
  }

  const defaultCls = isNote ? DEFAULT_TYPE_STYLES.note : DEFAULT_TYPE_STYLES[type] || DEFAULT_TYPE_STYLES.step;
  return {
    className: `${defaultCls} shadow-md backdrop-blur-xs`,
    customStyle: {},
    fill,
    themeFill: isNote ? NODE_FILL_VAR.note : NODE_FILL_VAR[type] || NODE_FILL_VAR.step,
    textColor: isNote ? "#18181b" : "#ffffff",
  };
}
