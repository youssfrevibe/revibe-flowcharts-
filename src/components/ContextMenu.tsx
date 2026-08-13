"use client";

export interface ContextMenuItem {
  label: string;
  action: () => void;
  danger?: boolean;
  separator?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: Props) {
  return (
    <>
      <div className="fixed inset-0 z-[290]" onClick={onClose} />
      <div
        className="fixed z-[300] bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl min-w-[180px] p-1"
        style={{ left: x, top: y }}
      >
        {items.map((item, i) =>
          item.separator ? (
            <div key={i} className="h-px bg-zinc-200 dark:bg-zinc-700 mx-2 my-1" />
          ) : (
            <button
              key={i}
              onClick={() => {
                item.action();
                onClose();
              }}
              className={`w-full text-left px-3 py-2 text-[12.5px] rounded-md transition-colors ${
                item.danger
                  ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
                  : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"
              }`}
            >
              {item.label}
            </button>
          )
        )}
      </div>
    </>
  );
}
