"use client";

import { useMemo, useState } from "react";
import { FactLink, FlowData, FlowNode, Mover } from "@/lib/types";
import { ACTOR_STYLES } from "@/lib/node-colors";
import { childrenOf, levelOf } from "@/lib/levels";

/**
 * The reader's view of one step.
 *
 * Viewer cards deliberately carry almost nothing — a label, an owner, a stage — because
 * a card dense enough to be complete is a card too dense to scan. Everything else lives
 * here, opened by clicking the card.
 *
 * Two tabs, same content, two audiences. *Human view* is prose and a facts table for
 * someone learning the process. *Claude view* is the same step serialised, for pasting
 * into an LLM or diffing against the OMS. They must never disagree: both render from
 * `node`, neither holds state of its own.
 */

type Tab = "human" | "claude";

export interface NeighbourStep {
  id: string;
  label: string;
  /** Branch label from the connection — "Yes", "missing docs · 130". */
  via?: string;
}

interface Props {
  node: FlowNode;
  /** The *current level's* slice of the document. Edges and neighbour labels come from
   *  here, so the panel never signposts a step the reader cannot see. */
  data: FlowData;
  /** The **whole** document, all levels. Children resolve against this and only this: a
   *  level-1 node's `children` are level-2 nodes, which `data` has by definition filtered
   *  out, so resolving them there silently returned nothing and "What this collapses"
   *  never rendered on any node. */
  doc: FlowData;
  /** Steps flow arrives from, and departs to. Rendered as signposts so a reader always
   *  knows where they are in the process without tracing lines by eye. */
  incoming: NeighbourStep[];
  outgoing: NeighbourStep[];
  onClose: () => void;
  onGoTo: (id: string) => void;
  /** Only set when this step collapses others, i.e. it is on level 1 or 2. */
  onDrillDown?: (node: FlowNode) => void;
}

const num = (v: string | number) => (typeof v === "number" ? v.toLocaleString() : v);

/** The step as YAML. Deliberately hand-rolled rather than JSON.stringify: the point is
 *  something a person can read aloud and an LLM can parse, without quote noise. */
function toClaudeView(node: FlowNode, data: FlowData, doc: FlowData): string {
  const L: string[] = [];
  const push = (k: string, v: string | number | undefined, indent = 0) => {
    if (v === undefined || v === "") return;
    L.push(`${" ".repeat(indent)}${k}: ${v}`);
  };

  push("id", node.id);
  push("label", node.label);
  push("type", node.type);
  push("level", levelOf(node));
  push("actor", node.actor);
  push("sla", node.sla);
  push("internal_stage", node.internalStage);
  push("external_stage", node.externalStage);
  if (node.detail) {
    L.push("description: |");
    for (const line of node.detail.split("\n")) L.push(`  ${line}`);
  }

  const f = node.facts;
  if (f) {
    L.push("facts:");
    push("where", f.where, 2);
    push("data_ref", f.dataRef, 2);
    if (f.links?.length) {
      L.push("  go_to:");
      for (const l of f.links) L.push(`    - ${l.label}${l.url ? ` (${l.url})` : ""}`);
    }
    if (f.volume) {
      L.push("  volume:");
      push("value", num(f.volume.value), 4);
      push("note", f.volume.note, 4);
      if (f.volume.source) {
        L.push("    source:");
        push("table", f.volume.source.table, 6);
        push("column", f.volume.source.column, 6);
        push("filter", f.volume.source.filter, 6);
        push("agg", f.volume.source.agg, 6);
      }
    }
    if (f.movers?.length) {
      L.push("  moved_by:");
      for (const m of f.movers) L.push(`    - ${m.actor}: ${m.count.toLocaleString()}`);
    }
  }

  const kids = childrenOf(doc, node);
  if (kids.length) {
    L.push("collapses:");
    for (const k of kids) L.push(`  - ${k.id}: ${k.label}`);
  }

  const edges = (dir: "from" | "to") =>
    data.connections.filter((c) => (dir === "to" ? c.from : c.to) === node.id);
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  const outs = edges("to");
  const ins = edges("from");
  if (ins.length) {
    L.push("arrives_from:");
    for (const c of ins) L.push(`  - ${c.from}${c.label ? ` (${c.label})` : ""}: ${byId.get(c.from)?.label ?? "?"}`);
  }
  if (outs.length) {
    L.push("leads_to:");
    for (const c of outs) L.push(`  - ${c.to}${c.label ? ` (${c.label})` : ""}: ${byId.get(c.to)?.label ?? "?"}`);
  }

  return L.join("\n");
}

/** The plain-English name for a node type, shown under the title. "Step" tells a reader
 *  what kind of thing they are looking at far better than the raw type does. */
const TYPE_LABEL: Record<string, string> = {
  start: "Start",
  step: "Step",
  decision: "Decision",
  sub: "Sub-process",
  ok: "Outcome",
  fail: "Outcome",
  note: "Note",
};

const LINK_ICON: Record<string, string> = {
  dashboard: "📊",
  tool: "🔧",
  doc: "📄",
  query: "🔎",
  link: "↗",
};

/**
 * One fact, as a label on the left and its value on the right.
 *
 * This replaced a striped two-column table. A table implies rows that can be compared
 * down a column; these are unrelated single values, and reading them meant crossing a
 * 34%-wide gutter to find each one. Label left, value right, hairline between: the eye
 * lands on the values as a column of its own.
 */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="flex items-start justify-between gap-4 px-3.5 py-2.5 text-[12.5px] first:rounded-t-xl last:rounded-b-xl"
      style={{ borderTop: "1px solid var(--ui-border-soft)" }}
    >
      <span className="shrink-0" style={{ color: "var(--ui-text-faint)" }}>
        {label}
      </span>
      <span className="text-right font-semibold">{children}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h3
        className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em]"
        style={{ color: "var(--ui-text-faint)" }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

/** The 100% bar. Renders observed counts, so a stage nominally shared between two parties
 *  but in practice moved by one shows as a solid bar — which is the finding, not a bug. */
function MoverBar({ movers }: { movers: Mover[] }) {
  const total = movers.reduce((s, m) => s + m.count, 0);
  if (total <= 0) return null;
  return (
    <>
      <div
        className="flex h-6 w-full overflow-hidden rounded-full"
        style={{ background: "var(--ui-input)" }}
      >
        {movers
          .filter((m) => m.count > 0)
          .map((m) => {
            const pct = (m.count / total) * 100;
            return (
              <div
                key={m.actor}
                className="flex items-center justify-center text-[10px] font-bold text-white"
                style={{ width: `${pct}%`, background: ACTOR_STYLES[m.actor].ring }}
                title={`${ACTOR_STYLES[m.actor].label} — ${m.count.toLocaleString()}`}
              >
                {pct >= 12 ? `${Math.round(pct)}%` : ""}
              </div>
            );
          })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {movers.map((m) => (
          <span
            key={m.actor}
            className="inline-flex items-center gap-1.5 text-[11px]"
            style={{ color: "var(--ui-text-dim)" }}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: ACTOR_STYLES[m.actor].ring }}
            />
            {ACTOR_STYLES[m.actor].shortLabel} <span className="font-mono">{m.count.toLocaleString()}</span>
          </span>
        ))}
      </div>
    </>
  );
}

function Signpost({
  label,
  steps,
  onGoTo,
}: {
  label: string;
  steps: NeighbourStep[];
  onGoTo: (id: string) => void;
}) {
  if (!steps.length) return null;
  return (
    <div className="mb-2">
      <div
        className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em]"
        style={{ color: "var(--ui-text-faint)" }}
      >
        {label}
      </div>
      <div className="flex flex-col gap-1">
        {steps.map((s) => (
          <button
            key={s.id + (s.via ?? "")}
            onClick={() => onGoTo(s.id)}
            className="ui-btn justify-start px-2 py-1.5 text-left text-[12px]"
            style={{ border: "1px solid var(--ui-border-soft)" }}
          >
            <span className="truncate">{s.label}</span>
            {s.via && (
              <span
                className="ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide"
                style={{ background: "var(--rv-purple-soft)", color: "var(--rv-purple-deep)" }}
              >
                {s.via}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function NodeDetailPanel({
  node,
  data,
  doc,
  incoming,
  outgoing,
  onClose,
  onGoTo,
  onDrillDown,
}: Props) {
  const [tab, setTab] = useState<Tab>("human");
  const actor = node.actor ? ACTOR_STYLES[node.actor] : null;
  const facts = node.facts;
  const kids = useMemo(() => childrenOf(doc, node), [doc, node]);
  const yaml = useMemo(
    () => (tab === "claude" ? toClaudeView(node, data, doc) : ""),
    [tab, node, data, doc]
  );
  /** Every single-value fact, in reading order, with the empty ones dropped. Built here
   *  rather than inline so the section can be hidden when a step has none. */
  const factRows = useMemo(() => {
    const rows: { label: string; value: string; mono?: boolean }[] = [];
    const add = (label: string, value?: string | number, mono?: boolean) => {
      if (value === undefined || value === null || value === "") return;
      rows.push({ label, value: String(value), mono });
    };
    add("Where", facts?.where);
    add("Internal stage", node.internalStage || node.stage);
    add("External stage", node.externalStage);
    add("SLA", node.sla);
    if (facts?.volume) add(facts.volume.note ? `Volume ${facts.volume.note}` : "Volume", num(facts.volume.value));
    add("Data", facts?.dataRef, true);
    return rows;
  }, [facts, node.internalStage, node.externalStage, node.stage, node.sla]);

  /** Named destinations. Falls back to `tools`, which older documents use to say the
   *  same thing, so a step authored before `facts.links` existed still shows them. */
  const goTo = useMemo<FactLink[]>(() => {
    if (facts?.links?.length) return facts.links;
    return (node.tools ?? []).map((t) => ({ label: t, kind: "tool" as const }));
  }, [facts, node.tools]);

  return (
    <aside
      className="ui-panel flex h-full w-[400px] shrink-0 flex-col border-l"
      style={{ borderColor: "var(--ui-border)" }}
    >
      {/* Header */}
      <div className="px-5 pt-5">
        <div className="flex items-start justify-between gap-3">
          {actor && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.06em]"
              style={{ background: actor.pill, color: actor.pillText }}
            >
              <span aria-hidden>{actor.icon}</span>
              {actor.label}
            </span>
          )}
          <button onClick={onClose} className="ui-btn -mt-1 h-7 w-7 shrink-0" aria-label="Close details">
            ✕
          </button>
        </div>

        <h2 className="font-display mt-3 text-[22px] font-semibold leading-[1.25]">{node.label}</h2>
        {/* What kind of thing this is. The stage names moved down into The Facts, where
            they sit with the other single values instead of competing with the title. */}
        <p className="mt-1 text-[12px]" style={{ color: "var(--ui-text-faint)" }}>
          {TYPE_LABEL[node.type] ?? "Step"}
        </p>

        {/* Tabs */}
        <div
          className="mt-4 flex gap-1 rounded-lg p-1"
          style={{ background: "var(--ui-input)" }}
        >
          {(["human", "claude"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              data-selected={tab === t}
              className="ui-btn flex-1 py-1.5 text-[12px] font-semibold"
              style={tab === t ? { background: "var(--ui-panel)", color: "var(--ui-text)" } : undefined}
            >
              <span aria-hidden className="mr-1.5 opacity-70">
                {t === "human" ? "👤" : "</>"}
              </span>
              {t === "human" ? "Human view" : "Claude view"}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {tab === "claude" ? (
          <pre
            className="overflow-x-auto rounded-lg p-3 font-mono text-[11.5px] leading-relaxed"
            style={{ background: "var(--ui-input)", color: "var(--ui-text-dim)" }}
          >
            {yaml}
          </pre>
        ) : (
          <>
            {node.detail && (
              <Section title="What happens">
                <p className="text-[13.5px] leading-[1.55]" style={{ color: "var(--ui-text-dim)" }}>
                  {node.detail}
                </p>
              </Section>
            )}

            {factRows.length > 0 && (
              <Section title="The facts">
                <div className="rounded-xl border" style={{ borderColor: "var(--ui-border-soft)" }}>
                  {factRows.map((r) => (
                    <Fact key={r.label} label={r.label}>
                      {r.mono ? (
                        <code
                          className="rounded px-1.5 py-0.5 font-mono text-[11.5px]"
                          style={{ background: "var(--rv-purple-soft)", color: "var(--rv-purple-deep)" }}
                        >
                          {r.value}
                        </code>
                      ) : (
                        r.value
                      )}
                    </Fact>
                  ))}
                </div>
              </Section>
            )}

            {goTo.length > 0 && (
              <Section title="Go to">
                <div className="flex flex-col gap-1.5">
                  {goTo.map((l) => {
                    const glyph = LINK_ICON[l.kind ?? "link"] ?? LINK_ICON.link;
                    const inner = (
                      <>
                        <span aria-hidden className="shrink-0 opacity-80">
                          {glyph}
                        </span>
                        <span className="truncate">{l.label}</span>
                      </>
                    );
                    // A destination worth naming but with no URL must not pretend to be
                    // clickable, so it renders as a plain row rather than a dead link.
                    return l.url ? (
                      <a
                        key={l.label}
                        href={l.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="ui-btn flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-[12.5px] font-medium"
                        style={{ border: "1px solid var(--ui-border-soft)" }}
                      >
                        {inner}
                      </a>
                    ) : (
                      <div
                        key={l.label}
                        className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-[12.5px] font-medium"
                        style={{ border: "1px solid var(--ui-border-soft)", color: "var(--ui-text-dim)" }}
                      >
                        {inner}
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {facts?.movers?.length ? (
              <Section title="Who actually moves this stage">
                <MoverBar movers={facts.movers} />
              </Section>
            ) : null}

            {kids.length > 0 && (
              <Section title={`What this collapses · ${kids.length} steps`}>
                <div className="flex flex-col gap-1">
                  {kids.map((k) => (
                    <button
                      key={k.id}
                      onClick={() => onDrillDown?.(k)}
                      className="ui-btn justify-start px-2 py-1.5 text-left text-[12px]"
                      style={{ border: "1px solid var(--ui-border-soft)" }}
                    >
                      <span className="truncate">{k.label}</span>
                    </button>
                  ))}
                </div>
              </Section>
            )}

            <Section title="Where the flow goes">
              <Signpost label="Arrives from" steps={incoming} onGoTo={onGoTo} />
              <Signpost label="Leads to" steps={outgoing} onGoTo={onGoTo} />
              {!incoming.length && !outgoing.length && (
                <p className="text-[12px]" style={{ color: "var(--ui-text-faint)" }}>
                  Nothing connects to this step yet.
                </p>
              )}
            </Section>

            {facts?.preview && (
              <Section title="Where you see it">
                {facts.preview.caption && (
                  <div
                    className="mb-1.5 rounded-t-lg px-3 py-1.5 text-[11px] font-medium"
                    style={{ background: "var(--ui-input)", color: "var(--ui-text-faint)" }}
                  >
                    {facts.preview.caption}
                  </div>
                )}
                <div
                  className="overflow-x-auto rounded-xl border"
                  style={{ borderColor: "var(--ui-border-soft)" }}
                >
                  <table className="w-full text-[11.5px]">
                    <thead>
                      <tr style={{ background: "var(--ui-input)" }}>
                        {facts.preview.columns.map((c) => (
                          <th
                            key={c}
                            className="whitespace-nowrap px-2.5 py-2 text-left text-[10px] font-bold uppercase tracking-[0.05em]"
                            style={{ color: "var(--ui-text-faint)" }}
                          >
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {facts.preview.rows.map((row, i) => (
                        <tr key={i} style={{ background: i % 2 ? "var(--rv-lavender)" : "transparent" }}>
                          {row.map((cell, j) => (
                            <td key={j} className="whitespace-nowrap px-2.5 py-2">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
