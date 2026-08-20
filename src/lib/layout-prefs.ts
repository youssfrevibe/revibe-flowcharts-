"use client";

import { DEFAULT_LAYOUT, LayoutDirection } from "./graph";

export interface LayoutPrefs {
  direction: LayoutDirection;
  primaryGap: number;
  secondaryGap: number;
  margin: number;
}

export const DEFAULT_PREFS: LayoutPrefs = {
  direction: DEFAULT_LAYOUT.direction,
  primaryGap: DEFAULT_LAYOUT.primaryGap,
  secondaryGap: DEFAULT_LAYOUT.secondaryGap,
  margin: DEFAULT_LAYOUT.margin,
};

const key = (slug: string) => `flow_layout_prefs_${slug}`;

export function loadLayoutPrefs(slug: string): LayoutPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_PREFS };
  try {
    const raw = localStorage.getItem(key(slug));
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        direction: parsed.direction === "TB" ? "TB" : "LR",
        primaryGap: clamp(parsed.primaryGap, 40, 800, DEFAULT_PREFS.primaryGap),
        secondaryGap: clamp(parsed.secondaryGap, 20, 600, DEFAULT_PREFS.secondaryGap),
        margin: clamp(parsed.margin, 0, 200, DEFAULT_PREFS.margin),
      };
    }
  } catch {}
  return { ...DEFAULT_PREFS };
}

export function saveLayoutPrefs(slug: string, prefs: LayoutPrefs): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key(slug), JSON.stringify(prefs));
  } catch {}
}

function clamp(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return Math.max(min, Math.min(max, n));
}
