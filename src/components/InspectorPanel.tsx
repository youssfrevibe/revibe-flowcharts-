"use client";

import { useState } from "react";
import { Actor, ConnType, FlowConnection, FlowNode, NodeType, Port, TextAlign, TextPosition, TextSize } from "@/lib/types";
import { ACTOR_ORDER, ACTOR_STYLES, NODE_COLOR_PRESETS, NOTE_COLOR_PRESETS } from "@/lib/node-colors";
import { LayoutPrefs, DEFAULT_PREFS } from "@/lib/layout-prefs";

export type AlignKind = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom" | "hdist" | "vdist";

interface Props {
  nodes: FlowNode[];
  selected: FlowNode[];
  conn: FlowConnection | null;
  readOnly?: boolean;

  prefs: LayoutPrefs;
  onPrefsChange: (p: LayoutPrefs) => void;
  onOrganize: () => void;
  onFixOverlaps: () => void;

  onPatchNodes: (patch: Partial<FlowNode>) => void;
  onAlign: (kind: AlignKind) => void;
  onOpenEditor: (node: FlowNode) => void;
  onDuplicate: () => void;
  onDeleteNodes: () => void;

  onPatchConn: (patch: Partial<FlowConnection>) => void;
  onResetRoute: () => void;
  onDeleteConn: () => void;
  onChainSelected?: () => void;
  onAutoConnectAll?: () => void;
}

/**
 * The right rail: properties for whatever is selected.
 *
 * Everything here used to live behind a right-click menu or a modal dialog, which meant the
 * common edits — nudge a node's position, change a fill, retype a label, restyle a pathway —
 * all cost a dialog round-trip. A persistent inspector makes them direct, and shows the
 * current values, which the menus never did.
 */
export default function InspectorPanel(props: Props) {
  const { selected, conn, readOnly } = props;

  return (
    <aside
      className="ui-panel w-[248px] shrink-0 flex flex-col border-l overflow-y-auto"
      style={{ borderColor: "var(--ui-border)" }}
      aria-label="Properties"
    >
      {conn ? (
        <ConnectionProps {...props} conn={conn} />
      ) : selected.length > 0 ? (
        <NodeProps {...props} />
      ) : (
        <CanvasProps {...props} />
      )}
      {readOnly && (
        <div className="mt-auto px-3 py-2.5 text-[10.5px]" style={{ color: "var(--ui-text-faint)" }}>
          View-only link — editing is disabled.
        </div>
      )}
    </aside>
  );
}

/* ------------------------------------------------------------------ layout primitives */

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="px-3 py-3 border-b" style={{ borderColor: "var(--ui-border-soft)" }}>
      <div className="flex items-center justify-between mb-2">
        <span className="ui-section uppercase">{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-1.5">{children}</div>;
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="w-4 shrink-0 text-[10px]" style={{ color: "var(--ui-text-faint)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

/** Number field that only commits on blur/Enter, so typing "-" or a partial number is fine. */
function NumField({
  value,
  onCommit,
  disabled,
  placeholder,
  label,
}: {
  value: number | null;
  onCommit: (v: number) => void;
  disabled?: boolean;
  placeholder?: string;
  label: string;
}) {
  const show = value === null ? "" : String(Math.round(value));
  const [draft, setDraft] = useState(show);
  // Adjust the draft during render when the underlying value changes (a node was dragged,
  // or the selection changed). Doing this in an effect would paint the stale number first.
  const [lastShown, setLastShown] = useState(show);
  if (show !== lastShown) {
    setLastShown(show);
    setDraft(show);
  }
  const commit = () => {
    const n = Number(draft);
    if (draft.trim() !== "" && Number.isFinite(n)) onCommit(n);
    else setDraft(show);
  };
  return (
    <input
      type="number"
      aria-label={label}
      className="ui-field"
      disabled={disabled}
      value={draft}
      placeholder={placeholder ?? "Mixed"}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setDraft(show);
      }}
    />
  );
}

function Segmented<T extends string>({
  options,
  value,
  onPick,
  disabled,
  ariaLabel,
}: {
  options: { v: T; label: string; title?: string }[];
  value: T | undefined;
  onPick: (v: T) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <div
      className="flex items-center p-0.5 rounded-md gap-0.5"
      style={{ background: "var(--ui-input)" }}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((o) => (
        <button
          key={o.v}
          disabled={disabled}
          onClick={() => onPick(o.v)}
          title={o.title ?? o.label}
          aria-pressed={value === o.v}
          data-active={value === o.v}
          className="ui-btn flex-1 h-6 text-[11px] font-medium min-w-0"
        >
          <span className="truncate px-0.5">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mb-2.5 last:mb-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10.5px]" style={{ color: "var(--ui-text-dim)" }}>
          {label}
        </span>
        <span className="text-[10.5px] tabular-nums" style={{ color: "var(--ui-text-faint)" }}>
          {value}
        </span>
      </div>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full cursor-pointer"
        style={{ accentColor: "var(--ui-accent)" }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ nothing selected */

function CanvasProps({ prefs, onPrefsChange, onOrganize, onFixOverlaps, onAutoConnectAll, nodes, readOnly }: Props) {
  const set = (patch: Partial<LayoutPrefs>) => onPrefsChange({ ...prefs, ...patch });
  return (
    <>
      <Section title="Diagram">
        <div className="flex items-center justify-between text-[11px]" style={{ color: "var(--ui-text-dim)" }}>
          <span>Shapes</span>
          <span className="tabular-nums" style={{ color: "var(--ui-text)" }}>
            {nodes.length}
          </span>
        </div>
        <p className="mt-2 text-[10.5px] leading-relaxed" style={{ color: "var(--ui-text-faint)" }}>
          Select a shape or a pathway to edit it. Click a pathway to reveal its bend handles.
        </p>
      </Section>

      <Section title="Auto layout">
        <Segmented
          ariaLabel="Flow direction"
          options={[
            { v: "LR", label: "→ Across" },
            { v: "TB", label: "↓ Down" },
          ]}
          value={prefs.direction}
          onPick={(v) => set({ direction: v })}
          disabled={readOnly}
        />
        <div className="mt-3">
          <Slider
            label={prefs.direction === "LR" ? "Column gap" : "Row gap"}
            value={prefs.primaryGap}
            min={60}
            max={600}
            step={10}
            onChange={(v) => set({ primaryGap: v })}
          />
          <Slider
            label={prefs.direction === "LR" ? "Row gap" : "Column gap"}
            value={prefs.secondaryGap}
            min={30}
            max={500}
            step={10}
            onChange={(v) => set({ secondaryGap: v })}
          />
          <Slider
            label="Breathing room"
            value={prefs.margin}
            min={0}
            max={120}
            step={4}
            onChange={(v) => set({ margin: v })}
          />
        </div>
        <div className="flex items-center gap-1.5 mt-3">
          <button
            onClick={onOrganize}
            disabled={readOnly}
            className="ui-btn flex-1 h-7 text-[11px] font-semibold"
            style={{ background: "var(--ui-accent)", color: "var(--ui-accent-text)" }}
          >
            Organise
          </button>
          <button
            onClick={onFixOverlaps}
            disabled={readOnly}
            title="Nudge only the overlapping shapes apart, keeping the current arrangement"
            className="ui-btn h-7 px-2 text-[11px]"
            style={{ background: "var(--ui-input)" }}
          >
            Declutter
          </button>
        </div>
        <button
          onClick={() => onPrefsChange({ ...DEFAULT_PREFS })}
          className="ui-btn w-full h-6 mt-1.5 text-[10.5px]"
        >
          Reset spacing
        </button>
        {onAutoConnectAll && (
          <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700/60">
            <button
              onClick={onAutoConnectAll}
              disabled={readOnly || nodes.length < 2}
              className="ui-btn w-full h-7 text-[11px] font-medium justify-center gap-1.5"
              style={{ background: "var(--ui-input)" }}
              title="Automatically connects sequential nodes and organizes the diagram"
            >
              <span>🔗</span> Auto-Connect All Steps
            </button>
          </div>
        )}
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ node(s) selected */

const TYPES: { v: NodeType; label: string }[] = [
  { v: "start", label: "Start" },
  { v: "step", label: "Step" },
  { v: "decision", label: "Decision" },
  { v: "sub", label: "Sub-process" },
  { v: "ok", label: "Success" },
  { v: "fail", label: "Failure" },
  { v: "note", label: "Comment" },
];

const ALIGN_BUTTONS: { kind: AlignKind; title: string; path: React.ReactNode }[] = [
  { kind: "left", title: "Align left", path: <><path d="M2 2v12" /><rect x="4" y="4" width="8" height="3" /><rect x="4" y="9" width="5" height="3" /></> },
  { kind: "hcenter", title: "Align horizontal centres", path: <><path d="M8 2v12" /><rect x="4" y="4" width="8" height="3" /><rect x="5.5" y="9" width="5" height="3" /></> },
  { kind: "right", title: "Align right", path: <><path d="M14 2v12" /><rect x="4" y="4" width="8" height="3" /><rect x="7" y="9" width="5" height="3" /></> },
  { kind: "top", title: "Align top", path: <><path d="M2 2h12" /><rect x="4" y="4" width="3" height="8" /><rect x="9" y="4" width="3" height="5" /></> },
  { kind: "vcenter", title: "Align vertical centres", path: <><path d="M2 8h12" /><rect x="4" y="4" width="3" height="8" /><rect x="9" y="5.5" width="3" height="5" /></> },
  { kind: "bottom", title: "Align bottom", path: <><path d="M2 14h12" /><rect x="4" y="4" width="3" height="8" /><rect x="9" y="7" width="3" height="5" /></> },
  { kind: "hdist", title: "Space evenly across", path: <><rect x="1" y="4" width="3" height="8" /><rect x="6.5" y="4" width="3" height="8" /><rect x="12" y="4" width="3" height="8" /></> },
  { kind: "vdist", title: "Space evenly down", path: <><rect x="4" y="1" width="8" height="3" /><rect x="4" y="6.5" width="8" height="3" /><rect x="4" y="12" width="8" height="3" /></> },
];

function NodeProps({
  selected,
  readOnly,
  onPatchNodes,
  onAlign,
  onOpenEditor,
  onDuplicate,
  onDeleteNodes,
  onChainSelected,
}: Props) {
  const one = selected.length === 1 ? selected[0] : null;
  const multi = selected.length > 1;
  /** Shared value across the selection, or null when they disagree ("Mixed"). */
  const shared = <T,>(get: (n: FlowNode) => T): T | null => {
    const first = get(selected[0]);
    return selected.every((n) => get(n) === first) ? first : null;
  };

  const isNote = shared((n) => n.type) === "note";
  const presets = isNote ? NOTE_COLOR_PRESETS : NODE_COLOR_PRESETS;
  const currentColor = shared((n) => n.color ?? "");
  const width = shared((n) => (typeof n.customWidth === "number" ? n.customWidth : null));

  return (
    <>
      <Section
        title={multi ? `${selected.length} shapes` : "Shape"}
        action={
          !readOnly && (
            <div className="flex items-center gap-0.5">
              <button onClick={onDuplicate} title="Duplicate (Ctrl+D)" aria-label="Duplicate" className="ui-btn w-6 h-6">
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="5" y="5" width="9" height="9" rx="1.5" />
                  <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2H3.5A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" />
                </svg>
              </button>
              <button
                onClick={onDeleteNodes}
                title="Delete"
                aria-label="Delete"
                className="ui-btn w-6 h-6 hover:!text-[color:var(--ui-danger)]"
              >
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 4h10M6.5 4V2.5h3V4M12 4l-.7 9.5H4.7L4 4" />
                </svg>
              </button>
            </div>
          )
        }
      >
        <Row>
          <Labeled label="X">
            <NumField
              label="X position"
              value={shared((n) => n.x)}
              disabled={readOnly}
              onCommit={(v) => onPatchNodes({ x: v })}
            />
          </Labeled>
          <Labeled label="Y">
            <NumField
              label="Y position"
              value={shared((n) => n.y)}
              disabled={readOnly}
              onCommit={(v) => onPatchNodes({ y: v })}
            />
          </Labeled>
        </Row>
        <div className="mt-1.5">
          <Labeled label="W">
            <NumField
              label="Width"
              value={width}
              placeholder="Auto"
              disabled={readOnly}
              onCommit={(v) => onPatchNodes({ customWidth: Math.max(120, Math.min(600, v)) })}
            />
          </Labeled>
        </div>
        {width !== null && !readOnly && (
          <button
            onClick={() => onPatchNodes({ customWidth: undefined })}
            className="ui-btn w-full h-6 mt-1.5 text-[10.5px]"
          >
            Back to automatic width
          </button>
        )}
      </Section>

      {!readOnly && (
        <Section title="Align">
          <div className="grid grid-cols-8 gap-0.5">
            {ALIGN_BUTTONS.map((b) => (
              <button
                key={b.kind}
                onClick={() => onAlign(b.kind)}
                disabled={selected.length < (b.kind.endsWith("dist") ? 3 : 2)}
                title={b.title}
                aria-label={b.title}
                className="ui-btn w-full h-6"
              >
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.3">
                  {b.path}
                </svg>
              </button>
            ))}
          </div>
          {selected.length < 2 && (
            <p className="mt-1.5 text-[10px]" style={{ color: "var(--ui-text-faint)" }}>
              Select two or more shapes to align them.
            </p>
          )}
          {multi && onChainSelected && (
            <div className="mt-2">
              <button
                onClick={onChainSelected}
                className="ui-btn w-full h-7 text-[11px] font-medium justify-center gap-1.5"
                style={{ background: "var(--ui-input)" }}
                title="Draw connections sequentially between selected steps in order"
              >
                <span>⛓</span> Chain Selected Steps
              </button>
            </div>
          )}
        </Section>
      )}

      <Section title="Type">
        <select
          className="ui-field"
          aria-label="Shape type"
          disabled={readOnly}
          value={shared((n) => n.type) ?? ""}
          onChange={(e) => onPatchNodes({ type: e.target.value as NodeType })}
        >
          {shared((n) => n.type) === null && <option value="">Mixed</option>}
          {TYPES.map((t) => (
            <option key={t.v} value={t.v}>
              {t.label}
            </option>
          ))}
        </select>
      </Section>

      {multi && !readOnly && (
        <Section title="Batch Operations">
          <div className="space-y-2">
            <div>
              <span className="text-[10px] block mb-1" style={{ color: "var(--ui-text-faint)" }}>Set SLA for all</span>
              <input
                className="ui-field text-xs"
                placeholder={shared((n) => n.sla) ?? "e.g. 24h, 30 mins..."}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onPatchNodes({ sla: (e.target as HTMLInputElement).value || undefined });
                  }
                }}
              />
            </div>
            <div>
              <span className="text-[10px] block mb-1" style={{ color: "var(--ui-text-faint)" }}>Set Internal Stage for all</span>
              <input
                className="ui-field text-xs"
                placeholder={shared((n) => n.internalStage) ?? "e.g. LAB_PROCESSING"}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onPatchNodes({ internalStage: (e.target as HTMLInputElement).value || undefined });
                  }
                }}
              />
            </div>
            <div>
              <span className="text-[10px] block mb-1" style={{ color: "var(--ui-text-faint)" }}>Set External Stage for all</span>
              <input
                className="ui-field text-xs"
                placeholder={shared((n) => n.externalStage) ?? "e.g. Under Revision"}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onPatchNodes({ externalStage: (e.target as HTMLInputElement).value || undefined });
                  }
                }}
              />
            </div>
          </div>
        </Section>
      )}

      <Section title="Fill">
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => onPatchNodes({ color: undefined })}
            disabled={readOnly}
            title="Default for this type"
            aria-label="Default fill"
            className="w-5 h-5 rounded-full border-2 grid place-items-center"
            style={{
              borderColor: !currentColor ? "var(--ui-accent)" : "var(--ui-border)",
              background: "var(--ui-input)",
            }}
          >
            <span className="text-[9px]" style={{ color: "var(--ui-text-faint)" }}>
              A
            </span>
          </button>
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => onPatchNodes({ color: p.id })}
              disabled={readOnly}
              title={p.name}
              aria-label={`Fill ${p.name}`}
              className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
              style={{
                background: p.fill,
                borderColor: currentColor === p.id ? "var(--ui-accent)" : "transparent",
              }}
            />
          ))}
        </div>
        <div className="flex items-center gap-1.5 mt-2">
          <input
            type="color"
            aria-label="Custom fill colour"
            disabled={readOnly}
            value={currentColor?.startsWith("#") ? currentColor : "#3f3f46"}
            onChange={(e) => onPatchNodes({ color: e.target.value })}
            className="w-7 h-7 rounded cursor-pointer bg-transparent border-0 p-0"
          />
          <input
            className="ui-field font-mono"
            aria-label="Fill hex"
            disabled={readOnly}
            placeholder="#RRGGBB"
            value={currentColor?.startsWith("#") ? currentColor : ""}
            onChange={(e) => {
              const v = e.target.value.trim();
              if (/^#[0-9a-fA-F]{6}$/.test(v)) onPatchNodes({ color: v });
            }}
          />
        </div>
      </Section>

      {!isNote && (
        <Section title="Who does this">
          <div className="space-y-1">
            <button
              onClick={() => onPatchNodes({ actor: undefined })}
              disabled={readOnly}
              className="ui-btn w-full h-6 justify-start px-2 text-[11px]"
              data-selected={!shared((n) => n.actor)}
            >
              Unassigned
            </button>
            {ACTOR_ORDER.map((a: Actor) => {
              const st = ACTOR_STYLES[a];
              return (
                <button
                  key={a}
                  onClick={() => onPatchNodes({ actor: a })}
                  disabled={readOnly}
                  title={st.desc}
                  className="ui-btn w-full h-6 justify-start px-2 text-[11px]"
                  data-selected={shared((n) => n.actor) === a}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: st.ring }} />
                  {st.label}
                </button>
              );
            })}
          </div>
        </Section>
      )}

      <Section title="Text">
        <Segmented
          ariaLabel="Text size"
          options={[
            { v: "sm", label: "S" },
            { v: "base", label: "M" },
            { v: "lg", label: "L" },
          ]}
          value={(shared((n) => n.textSize) ?? "base") as TextSize}
          onPick={(v) => onPatchNodes({ textSize: v })}
          disabled={readOnly}
        />
        <div className="mt-1.5">
          <Segmented
            ariaLabel="Text alignment"
            options={[
              { v: "left", label: "◧" as string, title: "Left" },
              { v: "center", label: "▣", title: "Centre" },
              { v: "right", label: "◨", title: "Right" },
            ]}
            value={shared((n) => n.textAlign) as TextAlign}
            onPick={(v) => onPatchNodes({ textAlign: v })}
            disabled={readOnly}
          />
        </div>
        <div className="mt-1.5">
          <select
            className="ui-field"
            aria-label="Text position"
            disabled={readOnly}
            value={shared((n) => n.textPosition) ?? "inside"}
            onChange={(e) => onPatchNodes({ textPosition: e.target.value as TextPosition })}
          >
            <option value="inside">Text inside the shape</option>
            <option value="top">Text above</option>
            <option value="bottom">Text below</option>
            <option value="left">Text to the left</option>
            <option value="right">Text to the right</option>
          </select>
        </div>
      </Section>

      {one && (
        <Section title="Content">
          <input
            className="ui-field"
            aria-label="Label"
            disabled={readOnly}
            value={one.label}
            placeholder="Label"
            onChange={(e) => onPatchNodes({ label: e.target.value })}
          />
          <textarea
            className="ui-field mt-1.5 resize-y min-h-[52px] leading-relaxed"
            aria-label="Description"
            disabled={readOnly}
            value={one.detail}
            placeholder="Description"
            onChange={(e) => onPatchNodes({ detail: e.target.value })}
          />
          <input
            className="ui-field mt-1.5"
            aria-label="SLA"
            disabled={readOnly}
            value={one.sla ?? ""}
            placeholder="SLA (e.g. 2 days)"
            onChange={(e) => onPatchNodes({ sla: e.target.value || undefined })}
          />
          <input
            className="ui-field mt-1.5"
            aria-label="Internal stage"
            disabled={readOnly}
            value={one.internalStage ?? ""}
            placeholder="internal_stage"
            onChange={(e) => onPatchNodes({ internalStage: e.target.value || undefined })}
          />
          <input
            className="ui-field mt-1.5"
            aria-label="External stage"
            disabled={readOnly}
            value={one.externalStage ?? ""}
            placeholder="external_stage"
            onChange={(e) => onPatchNodes({ externalStage: e.target.value || undefined })}
          />
          {!readOnly && (
            <button onClick={() => onOpenEditor(one)} className="ui-btn w-full h-7 mt-2 text-[11px]" style={{ background: "var(--ui-input)" }}>
              Tools &amp; procedure…
            </button>
          )}
        </Section>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ connection selected */

const CONN_STYLES: { v: ConnType; label: string; dot: string }[] = [
  { v: "", label: "Neutral", dot: "#a1a1aa" },
  { v: "cyes", label: "Yes", dot: "#10b981" },
  { v: "cno", label: "No", dot: "#ef4444" },
  { v: "camber", label: "Maybe", dot: "#f59e0b" },
];

const PORTS: { v: Port | "auto"; label: string }[] = [
  { v: "auto", label: "Auto" },
  { v: "top", label: "Top" },
  { v: "right", label: "Right" },
  { v: "bottom", label: "Bottom" },
  { v: "left", label: "Left" },
];

function ConnectionProps({
  conn,
  nodes,
  readOnly,
  onPatchConn,
  onResetRoute,
  onDeleteConn,
}: Props & { conn: FlowConnection }) {
  const from = nodes.find((n) => n.id === conn.from);
  const to = nodes.find((n) => n.id === conn.to);
  const bends = conn.waypoints?.length ?? 0;

  return (
    <>
      <Section
        title="Pathway"
        action={
          !readOnly && (
            <button
              onClick={onDeleteConn}
              title="Delete pathway"
              aria-label="Delete pathway"
              className="ui-btn w-6 h-6 hover:!text-[color:var(--ui-danger)]"
            >
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 4h10M6.5 4V2.5h3V4M12 4l-.7 9.5H4.7L4 4" />
              </svg>
            </button>
          )
        }
      >
        <div className="text-[11px] leading-relaxed" style={{ color: "var(--ui-text-dim)" }}>
          <div className="truncate">{from?.label ?? "?"}</div>
          <div style={{ color: "var(--ui-text-faint)" }}>↓</div>
          <div className="truncate">{to?.label ?? "?"}</div>
        </div>
      </Section>

      <Section title="Label">
        <input
          className="ui-field"
          aria-label="Pathway label"
          disabled={readOnly}
          value={conn.label ?? ""}
          placeholder="e.g. Yes, Rejected…"
          onChange={(e) => onPatchConn({ label: e.target.value })}
        />
      </Section>

      <Section title="Style">
        <div className="space-y-1">
          {CONN_STYLES.map((s) => (
            <button
              key={s.v || "default"}
              onClick={() => onPatchConn({ type: s.v })}
              disabled={readOnly}
              className="ui-btn w-full h-6 justify-start px-2 text-[11px]"
              data-selected={(conn.type ?? "") === s.v}
            >
              <span className="w-3.5 h-0.5 rounded-full shrink-0" style={{ background: s.dot }} />
              {s.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => onPatchConn({ bold: !conn.bold })}
          disabled={readOnly}
          className="ui-btn w-full h-7 mt-2 text-[11px] font-medium"
          data-active={Boolean(conn.bold)}
          style={conn.bold ? undefined : { background: "var(--ui-input)" }}
        >
          Highlight as primary
        </button>
      </Section>

      <Section title="Attachment">
        <div className="space-y-1.5">
          <label className="flex items-center gap-2">
            <span className="w-10 shrink-0 text-[10px]" style={{ color: "var(--ui-text-faint)" }}>
              Leaves
            </span>
            <select
              className="ui-field"
              aria-label="Exit side"
              disabled={readOnly}
              value={conn.fromPort ?? "auto"}
              onChange={(e) => onPatchConn({ fromPort: e.target.value === "auto" ? undefined : (e.target.value as Port) })}
            >
              {PORTS.map((p) => (
                <option key={p.v} value={p.v}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="w-10 shrink-0 text-[10px]" style={{ color: "var(--ui-text-faint)" }}>
              Enters
            </span>
            <select
              className="ui-field"
              aria-label="Entry side"
              disabled={readOnly}
              value={conn.toPort ?? "auto"}
              onChange={(e) => onPatchConn({ toPort: e.target.value === "auto" ? undefined : (e.target.value as Port) })}
            >
              {PORTS.map((p) => (
                <option key={p.v} value={p.v}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Section>

      <Section title="Route">
        <div className="text-[11px] mb-2" style={{ color: "var(--ui-text-dim)" }}>
          {bends === 0 ? (
            "Routed automatically."
          ) : (
            <>
              <span style={{ color: "var(--ui-accent)" }}>{bends}</span> hand-placed{" "}
              {bends === 1 ? "bend" : "bends"}.
            </>
          )}
        </div>
        <p className="text-[10px] leading-relaxed mb-2" style={{ color: "var(--ui-text-faint)" }}>
          Drag the hollow dots on the pathway to bend it, the solid dots to move a bend, or a
          straight run to slide the whole segment. Double-click a solid dot to remove it.
        </p>
        <button
          onClick={onResetRoute}
          disabled={readOnly || bends === 0}
          className="ui-btn w-full h-7 text-[11px]"
          style={{ background: "var(--ui-input)" }}
        >
          Reset to automatic route
        </button>
      </Section>
    </>
  );
}
