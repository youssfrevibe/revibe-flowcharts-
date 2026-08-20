"use client";

import { LayoutPrefs, DEFAULT_PREFS } from "@/lib/layout-prefs";

interface Props {
  prefs: LayoutPrefs;
  onChange: (next: LayoutPrefs) => void;
  onOrganize: () => void;
  onFixOverlaps: () => void;
  onClose: () => void;
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "px",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">{label}</label>
        <span className="text-[11px] tabular-nums text-zinc-400">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-emerald-600 cursor-pointer"
      />
    </div>
  );
}

export default function LayoutPanel({ prefs, onChange, onOrganize, onFixOverlaps, onClose }: Props) {
  const set = (patch: Partial<LayoutPrefs>) => onChange({ ...prefs, ...patch });

  return (
    <div className="w-72 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-semibold font-display text-zinc-900 dark:text-zinc-100">Layout &amp; spacing</h3>
        <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-400">
          &times;
        </button>
      </div>

      {/* Direction */}
      <div className="mb-3.5">
        <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-300 mb-1.5">Flow direction</label>
        <div className="flex items-center bg-zinc-100 dark:bg-zinc-900 p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-700">
          {(["LR", "TB"] as const).map((d) => (
            <button
              key={d}
              onClick={() => set({ direction: d })}
              className={`flex-1 px-2 py-1.5 text-[11px] font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 ${
                prefs.direction === d
                  ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              {d === "LR" ? "→ Left to right" : "↓ Top to bottom"}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3.5">
        <Slider
          label={prefs.direction === "LR" ? "Column spacing (horizontal)" : "Row spacing (vertical)"}
          value={prefs.primaryGap}
          min={60}
          max={600}
          step={10}
          onChange={(v) => set({ primaryGap: v })}
        />
        <Slider
          label={prefs.direction === "LR" ? "Row spacing (vertical)" : "Column spacing (horizontal)"}
          value={prefs.secondaryGap}
          min={30}
          max={500}
          step={10}
          onChange={(v) => set({ secondaryGap: v })}
        />
        <Slider
          label="Breathing room around nodes"
          value={prefs.margin}
          min={0}
          max={120}
          step={4}
          onChange={(v) => set({ margin: v })}
        />
      </div>

      <div className="flex items-center gap-2 mt-4">
        <button
          onClick={onOrganize}
          className="flex-1 px-3 py-2 text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg shadow-sm transition-colors"
        >
          Organize
        </button>
        <button
          onClick={onFixOverlaps}
          title="Only nudge overlapping nodes apart, keeping the current arrangement"
          className="px-3 py-2 text-xs font-medium border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 rounded-lg transition-colors"
        >
          Fix overlaps
        </button>
      </div>

      <button
        onClick={() => onChange({ ...DEFAULT_PREFS })}
        className="w-full mt-2 text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
      >
        Reset to defaults
      </button>
    </div>
  );
}
