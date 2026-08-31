"use client";

import { NodeType } from "@/lib/types";

interface Props {
  tool: "select" | "pan";
  onTool: (t: "select" | "pan") => void;
  snap: boolean;
  onSnap: () => void;
  onAdd: (t: NodeType) => void;
  onOrganize: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onShortcuts: () => void;
  onFind?: () => void;
  onStats?: () => void;
}

function Btn({
  children,
  onClick,
  title,
  shortcut,
  active,
  disabled,
  fill,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  fill?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={shortcut ? `${title} (${shortcut})` : title}
      aria-label={title}
      aria-pressed={active}
      data-active={active}
      className={`group relative ui-btn w-8.5 h-8.5 rounded-lg transition-all ${
        active
          ? "bg-sky-500 text-white shadow-md shadow-sky-500/25 scale-105"
          : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className="w-[18px] h-[18px]"
        fill={fill ? "currentColor" : "none"}
        stroke={fill ? "none" : "currentColor"}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    </button>
  );
}

function Sep() {
  return <div className="w-px h-5 mx-1 bg-zinc-200 dark:bg-zinc-700/80" />;
}

export default function Toolbar(p: Props) {
  return (
    <div
      className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-1 p-1.5 rounded-2xl border border-zinc-200/90 dark:border-zinc-700/80 bg-white/90 dark:bg-zinc-900/90 shadow-2xl backdrop-blur-md z-50 transition-all hover:scale-[1.01]"
      role="toolbar"
      aria-label="Editor tools"
    >
      <Btn title="Select tool" shortcut="V" active={p.tool === "select"} onClick={() => p.onTool("select")} fill>
        <path d="M4 3l7 17 2.2-7.8L21 10 4 3z" />
      </Btn>
      <Btn title="Pan tool (or hold Space)" shortcut="H" active={p.tool === "pan"} onClick={() => p.onTool("pan")}>
        <path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8M22 10v2a10 10 0 0 1-10 10H8" />
      </Btn>

      <Sep />

      <Btn title="Add Process Step" shortcut="N" onClick={() => p.onAdd("step")}>
        <rect x="3" y="5" width="18" height="14" rx="2.5" />
      </Btn>
      <Btn title="Add Decision Branch" onClick={() => p.onAdd("decision")}>
        <path d="M12 2.5L21.5 12 12 21.5 2.5 12z" />
      </Btn>
      <Btn title="Add Sub-Process" onClick={() => p.onAdd("sub")}>
        <rect x="3" y="5" width="18" height="14" rx="2.5" />
        <path d="M6.5 5v14M17.5 5v14" />
      </Btn>
      <Btn title="Add Start Point" onClick={() => p.onAdd("start")}>
        <rect x="2.5" y="7" width="19" height="10" rx="5" />
      </Btn>
      <Btn title="Add Success Outcome" onClick={() => p.onAdd("ok")}>
        <circle cx="12" cy="12" r="9" />
        <path d="M8.5 12l2.5 2.5 4.5-5" />
      </Btn>
      <Btn title="Add Failure Outcome" onClick={() => p.onAdd("fail")}>
        <circle cx="12" cy="12" r="9" />
        <path d="M15 9l-6 6M9 9l6 6" />
      </Btn>
      <Btn title="Add Sticky Comment" shortcut="C" onClick={() => p.onAdd("note")}>
        <path d="M20 4H4a1.5 1.5 0 0 0-1.5 1.5v9A1.5 1.5 0 0 0 4 16h3v4l5-4h8a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 20 4z" />
      </Btn>

      <Sep />

      {p.onFind && (
        <Btn title="Find & Replace" shortcut="Ctrl+F" onClick={p.onFind}>
          <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </Btn>
      )}

      {p.onStats && (
        <Btn title="Diagram Insights" shortcut="I" onClick={p.onStats}>
          <path d="M3 3v18h18" />
          <path d="M18 9l-5 5-4-4-4 4" />
        </Btn>
      )}

      <Btn title="Auto-Arrange Diagram" shortcut="Ctrl+L" onClick={p.onOrganize}>
        <path d="M3 4h7v7H3zM14 4h7v4h-7zM14 12h7v8h-7zM3 15h7v5H3z" />
      </Btn>
      <Btn title="Toggle Grid Snapping" shortcut="G" active={p.snap} onClick={p.onSnap}>
        <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
      </Btn>

      <Sep />

      <Btn title="Undo" shortcut="Ctrl+Z" disabled={!p.canUndo} onClick={p.onUndo}>
        <path d="M3 10h10a5 5 0 0 1 5 5v2M3 10l5-5M3 10l5 5" />
      </Btn>
      <Btn title="Redo" shortcut="Ctrl+Shift+Z" disabled={!p.canRedo} onClick={p.onRedo}>
        <path d="M21 10H11a5 5 0 0 0-5 5v2M21 10l-5-5M21 10l-5 5" />
      </Btn>

      <Sep />

      <Btn title="Keyboard Shortcuts" shortcut="?" onClick={p.onShortcuts}>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9.5a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 17.5h.01" />
      </Btn>
    </div>
  );
}
