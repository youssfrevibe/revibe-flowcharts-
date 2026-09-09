"use client";

import { useMemo } from "react";
import { DetailLevel, FlowData } from "@/lib/types";
import { ACTOR_ORDER, ACTOR_STYLES } from "@/lib/node-colors";
import { LEVELS, LEVEL_LABELS, levelCounts } from "@/lib/levels";

/**
 * The reader's way in: how much detail to show, who is involved, and where the process
 * can end up.
 *
 * Levels are offered even when empty, greyed and disabled, rather than hidden — a reader
 * who cannot see that "The shape" exists has no reason to ask for it, and an editor needs
 * to know there is authoring left to do. The same reasoning applies to actors with a zero
 * count: "no seller involvement at this level" is a finding worth showing.
 */

interface Props {
  /** Whole document — level counts must describe the file, not the current view. */
  data: FlowData;
  /** Current level's subgraph — actors and outcomes describe what is on screen. */
  view: FlowData;
  level: DetailLevel;
  available: DetailLevel[];
  onLevel: (l: DetailLevel) => void;
  title: string;
  subtitle: string;
  onSelectNode: (id: string) => void;
  tourActive: boolean;
  onStartTour: () => void;
}

export default function LevelSidebar({
  data,
  view,
  level,
  available,
  onLevel,
  title,
  subtitle,
  onSelectNode,
  tourActive,
  onStartTour,
}: Props) {
  const counts = useMemo(() => levelCounts(data), [data]);

  const actorCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of view.nodes) if (n.actor) m.set(n.actor, (m.get(n.actor) ?? 0) + 1);
    return m;
  }, [view.nodes]);

  /** Where the process can end: explicit outcome nodes, plus any step nothing leaves.
   *  A dead end that is not marked as an outcome is usually the interesting one. */
  const outcomes = useMemo(() => {
    const hasOut = new Set(view.connections.map((c) => c.from));
    return view.nodes
      .filter((n) => n.type === "ok" || n.type === "fail" || (!hasOut.has(n.id) && n.type !== "note"))
      .map((n) => ({ id: n.id, label: n.label, kind: n.type }));
  }, [view]);

  return (
    <aside
      className="ui-panel flex h-full w-[260px] shrink-0 flex-col overflow-y-auto border-r"
      style={{ borderColor: "var(--ui-border)" }}
    >
      <div className="px-4 pt-4">
        <h1 className="font-display text-[15px] font-bold leading-tight">{title}</h1>
        {subtitle && (
          <p className="mt-0.5 text-[11px]" style={{ color: "var(--ui-text-faint)" }}>
            {subtitle}
          </p>
        )}
        {/* The way in for someone who has never seen this process. Sits above the zoom
            levels because "show me" beats "choose a detail level" for a first-time reader. */}
        <button
          onClick={onStartTour}
          disabled={tourActive || !onStartTour}
          className="mt-3 w-full rounded-xl px-3 py-2 text-[12.5px] font-semibold text-white transition-opacity disabled:opacity-40"
          style={{ background: "var(--rv-gradient)" }}
        >
          ▶ Walk the journey
        </button>
      </div>

      <div className="px-4 pt-5">
        <h2 className="ui-section mb-2 uppercase">Zoom level</h2>
        <div className="flex flex-col gap-1.5">
          {LEVELS.map((l) => {
            const on = l === level;
            const enabled = available.includes(l);
            return (
              <button
                key={l}
                disabled={!enabled}
                onClick={() => onLevel(l)}
                className="rounded-xl border px-3 py-2.5 text-left transition-colors"
                style={{
                  borderColor: on ? "var(--rv-purple)" : "var(--ui-border-soft)",
                  background: on ? "var(--rv-purple-soft)" : "transparent",
                  opacity: enabled ? 1 : 0.4,
                  cursor: enabled ? "pointer" : "not-allowed",
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-bold"
                    style={{
                      background: on ? "var(--rv-purple)" : "var(--ui-input)",
                      color: on ? "#fff" : "var(--ui-text-faint)",
                    }}
                  >
                    {l}
                  </span>
                  <span className="text-[12.5px] font-semibold">{LEVEL_LABELS[l].title}</span>
                </div>
                <p className="mt-1 text-[10.5px] leading-snug" style={{ color: "var(--ui-text-faint)" }}>
                  {enabled ? `${counts[l]} steps · ` : "Not authored yet · "}
                  {LEVEL_LABELS[l].blurb}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 pt-6">
        <h2 className="ui-section mb-2 uppercase">Who is involved</h2>
        <div className="flex flex-col">
          {ACTOR_ORDER.map((a) => {
            const c = actorCounts.get(a) ?? 0;
            const st = ACTOR_STYLES[a];
            return (
              <div
                key={a}
                className="flex items-center gap-2 py-1.5 text-[12px]"
                style={{ opacity: c ? 1 : 0.4 }}
              >
                <span aria-hidden>{st.icon}</span>
                <span className="truncate" style={{ color: "var(--ui-text-dim)" }}>
                  {st.label}
                </span>
                <span className="ml-auto font-mono text-[11.5px] font-semibold">{c}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-4 pb-6 pt-6">
        <h2 className="ui-section mb-2 uppercase">Outcomes discovered</h2>
        {outcomes.length === 0 ? (
          <p className="text-[11px]" style={{ color: "var(--ui-text-faint)" }}>
            Undiscovered — keep walking.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {outcomes.map((o) => (
              <button
                key={o.id}
                onClick={() => onSelectNode(o.id)}
                className="ui-btn justify-start px-2 py-1.5 text-left text-[11.5px]"
                style={{ border: "1px solid var(--ui-border-soft)" }}
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{
                    background:
                      o.kind === "ok"
                        ? "var(--rv-success)"
                        : o.kind === "fail"
                          ? "var(--rv-danger)"
                          : "var(--ui-text-faint)",
                  }}
                />
                <span className="truncate">{o.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
