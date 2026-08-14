"use client";

interface Props {
  onClose: () => void;
}

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: "Tools",
    items: [
      ["V", "Select tool"],
      ["H / Space", "Pan tool (hold Space to pan)"],
      ["Double-click canvas", "Add a step here"],
      ["Double-click node", "Edit node"],
      ["Drag node port", "Draw a connection"],
    ],
  },
  {
    title: "Editing",
    items: [
      ["Ctrl/⌘ + Z", "Undo"],
      ["Ctrl/⌘ + Shift + Z / Ctrl+Y", "Redo"],
      ["Ctrl/⌘ + C / X / V", "Copy / Cut / Paste"],
      ["Ctrl/⌘ + D", "Duplicate"],
      ["Ctrl/⌘ + A", "Select all"],
      ["Delete / Backspace", "Delete selection"],
      ["Enter", "Edit selected node"],
      ["Arrows", "Nudge 1px (Shift = 10px)"],
    ],
  },
  {
    title: "View",
    items: [
      ["Ctrl/⌘ + = / -", "Zoom in / out"],
      ["Ctrl/⌘ + 0", "Reset zoom to 100%"],
      ["Shift + 1", "Fit all to screen"],
      ["Shift + 2", "Zoom to selection"],
      ["Scroll", "Zoom at cursor"],
      ["G", "Toggle snap-to-grid"],
    ],
  },
  {
    title: "Document",
    items: [
      ["Ctrl/⌘ + S", "Save now"],
      ["Ctrl/⌘ + L", "Auto-layout"],
      ["? or /", "Toggle this help"],
      ["Esc", "Clear selection / close"],
    ],
  },
];

export default function ShortcutsHelp({ onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-[650] flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-2xl bg-white dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-700">
          <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
            Keyboard shortcuts
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-400 text-lg"
          >
            &times;
          </button>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5 max-h-[70vh] overflow-y-auto">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-2">
                {g.title}
              </div>
              <div className="space-y-1.5">
                {g.items.map(([k, d]) => (
                  <div key={k} className="flex items-center justify-between gap-3">
                    <span className="text-[12px] text-zinc-600 dark:text-zinc-300">{d}</span>
                    <kbd className="shrink-0 text-[10px] font-mono font-medium px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400">
                      {k}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
