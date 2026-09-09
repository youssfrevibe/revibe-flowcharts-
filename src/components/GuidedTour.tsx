"use client";

import { useEffect } from "react";
import { FlowNode } from "@/lib/types";
import { ACTOR_STYLES } from "@/lib/node-colors";

/**
 * Walks a reader through the process one step at a time.
 *
 * The tour deliberately does not draw anything on the canvas. It drives the ordinary
 * selection, so the same detail panel, the same pathway emphasis and the same pan the
 * reader would get by clicking a card is what the tour shows them — one behaviour to keep
 * correct instead of two, and nothing on screen moves that they did not already trust.
 */

interface Props {
  /** Ordered walk of the current level, from `tourOrder`. */
  steps: FlowNode[];
  index: number;
  onIndex: (i: number) => void;
  onExit: () => void;
}

export default function GuidedTour({ steps, index, onIndex, onExit }: Props) {
  const total = steps.length;
  const step = steps[index];

  // Arrow keys drive the tour. Safe to bind globally: the tour only runs in reader mode,
  // where nudge is blocked, so nothing else is listening for these.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); onIndex(Math.min(index + 1, total - 1)); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); onIndex(Math.max(index - 1, 0)); }
      else if (e.key === "Escape") { e.preventDefault(); onExit(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, total, onIndex, onExit]);

  if (!step) return null;
  const actor = step.actor ? ACTOR_STYLES[step.actor] : null;
  const pct = total > 1 ? (index / (total - 1)) * 100 : 100;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-40 flex justify-center px-4">
      <div
        className="ui-panel pointer-events-auto w-full max-w-[560px] overflow-hidden rounded-2xl border shadow-2xl"
        style={{ borderColor: "var(--ui-border)", boxShadow: "var(--ui-dock-shadow)" }}
      >
        {/* Progress. A thin bar rather than a number alone, so "how much is left" is
            readable at a glance on a 27-step process. */}
        <div className="h-1 w-full" style={{ background: "var(--ui-input)" }}>
          <div className="h-full transition-[width] duration-200" style={{ width: `${pct}%`, background: "var(--rv-gradient)" }} />
        </div>

        <div className="flex items-center gap-3 px-4 py-3">
          <span
            className="shrink-0 rounded-full px-2 py-1 font-mono text-[10.5px] font-bold"
            style={{ background: "var(--rv-purple-soft)", color: "var(--rv-purple-deep)" }}
          >
            {index + 1} / {total}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {actor && (
                <span className="shrink-0 text-[11px]" aria-hidden>
                  {actor.icon}
                </span>
              )}
              <span className="truncate text-[13px] font-semibold">{step.label}</span>
            </div>
            {step.detail && (
              <p className="truncate text-[11px]" style={{ color: "var(--ui-text-faint)" }}>
                {step.detail}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              className="ui-btn h-7 w-7"
              disabled={index === 0}
              onClick={() => onIndex(Math.max(index - 1, 0))}
              title="Previous step (←)"
            >
              ‹
            </button>
            <button
              className="ui-btn h-7 px-3 text-[12px] font-semibold"
              disabled={index >= total - 1}
              onClick={() => onIndex(Math.min(index + 1, total - 1))}
              style={index < total - 1 ? { background: "var(--rv-purple)", color: "#fff" } : undefined}
              title="Next step (→)"
            >
              Next ›
            </button>
            <button className="ui-btn h-7 w-7" onClick={onExit} title="End tour (Esc)">
              ✕
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
