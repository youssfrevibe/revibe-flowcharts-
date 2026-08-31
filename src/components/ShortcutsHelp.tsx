"use client";

interface Props {
  onClose: () => void;
}

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: "Command & Search",
    items: [
      ["Ctrl/⌘ + K", "Command palette & search"],
      ["? or /", "Show keyboard shortcuts"],
      ["Esc", "Clear selection / close modal"],
    ],
  },
  {
    title: "Tools & Creation",
    items: [
      ["V", "Select tool"],
      ["H / Space", "Pan canvas (hold Space)"],
      ["N", "Add process step"],
      ["C", "Add sticky comment"],
      ["Click '+' on port", "Quick-add connected step"],
      ["Double-click canvas", "Add step at pointer"],
      ["Double-click node", "Open node properties"],
      ["Drag node port", "Draw connection pathway"],
    ],
  },
  {
    title: "Navigation & Graph",
    items: [
      ["[", "Select upstream step"],
      ["]", "Select downstream step"],
      ["Scroll / 2-fingers", "Pan canvas"],
      ["Shift + scroll", "Pan horizontally"],
      ["Ctrl/⌘ + scroll", "Continuous zoom"],
      ["Shift + 1", "Fit diagram to screen"],
      ["Ctrl/⌘ + 0", "Reset zoom to 100%"],
    ],
  },
  {
    title: "Pathways & Routing",
    items: [
      ["Click pathway", "Select & reveal handles"],
      ["Drag hollow dot", "Create pathway bend"],
      ["Drag solid dot", "Move existing bend"],
      ["Double-click bend", "Remove bend point"],
      ["Drag segment", "Slide straight run"],
      ["Drag end point", "Re-attach to other shape"],
      ["Double-click path", "Inline edit label"],
    ],
  },
  {
    title: "Editing & Clipboard",
    items: [
      ["Ctrl/⌘ + Z", "Undo action"],
      ["Ctrl/⌘ + Shift + Z", "Redo action"],
      ["Ctrl/⌘ + C / X / V", "Copy / Cut / Paste"],
      ["Ctrl/⌘ + D", "Duplicate selected"],
      ["Ctrl/⌘ + A", "Select all steps"],
      ["Delete / Backspace", "Delete selection"],
      ["Arrows", "Nudge 1px (Shift: 10px)"],
    ],
  },
  {
    title: "Automation & Organization",
    items: [
      ["Ctrl/⌘ + L", "Auto-arrange layout"],
      ["G", "Toggle grid snapping"],
      ["Ctrl/⌘ + S", "Save diagram now"],
    ],
  },
];

export default function ShortcutsHelp({ onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-[850] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-3xl bg-white dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-700/80 bg-zinc-50/60 dark:bg-zinc-900/40">
          <div className="flex items-center gap-2">
            <span className="text-base">⌨️</span>
            <h2 className="text-[15px] font-bold font-display text-zinc-900 dark:text-zinc-100">
              Keyboard Shortcuts & Controls
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors text-lg"
          >
            &times;
          </button>
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6 max-h-[70vh] overflow-y-auto">
          {GROUPS.map((g) => (
            <div key={g.title} className="space-y-2">
              <div
                className="text-[10.5px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400"
              >
                {g.title}
              </div>
              <div className="space-y-1.5">
                {g.items.map(([k, d]) => (
                  <div key={k} className="flex items-center justify-between gap-3 text-[12px]">
                    <span className="text-zinc-600 dark:text-zinc-300 leading-tight">{d}</span>
                    <kbd className="shrink-0 text-[10px] font-mono font-medium px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 shadow-2xs">
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
