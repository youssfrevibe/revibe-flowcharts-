"use client";

import { useEffect, useState, useCallback } from "react";
import { FlowData } from "@/lib/types";
import { VersionMeta, listVersions, saveVersion, fetchVersion } from "@/lib/versions";

interface Props {
  slug: string;
  authorName?: string;
  /** Current document, snapshotted when the user clicks "Save version". */
  getCurrent: () => FlowData;
  /** Restore a version's content into the live document. */
  onRestore: (data: FlowData) => void;
  onClose: () => void;
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const s = Math.max(1, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function VersionHistory({ slug, authorName, getCurrent, onRestore, onClose }: Props) {
  const [versions, setVersions] = useState<VersionMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    listVersions(slug).then((v) => {
      setVersions(v);
      setLoading(false);
    });
  }, [slug]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSave = async () => {
    setSaving(true);
    const meta = await saveVersion(slug, getCurrent(), { author: authorName });
    setSaving(false);
    if (meta) refresh();
  };

  const handleRestore = async (v: VersionMeta) => {
    if (!window.confirm(`Restore this version from ${timeAgo(v.created_at)}? Your current diagram will be saved as a version first.`)) return;
    setRestoringId(v.id);
    // Snapshot the current state so a restore is itself undoable.
    await saveVersion(slug, getCurrent(), { author: authorName, label: "Before restore" });
    const data = await fetchVersion(slug, v.id);
    setRestoringId(null);
    if (data) {
      onRestore(data);
      refresh();
    }
  };

  return (
    <div className="fixed inset-0 z-[640] flex justify-end bg-black/30" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-sm h-full bg-white dark:bg-zinc-800 border-l border-zinc-200 dark:border-zinc-700 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-700">
          <div>
            <h2 className="text-[15px] font-semibold font-display text-zinc-900 dark:text-zinc-100">Version history</h2>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Snapshots you can restore anytime</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-400 text-lg">
            &times;
          </button>
        </div>

        <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-700/60">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full px-3 py-2 text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg shadow-sm transition-colors flex items-center justify-center gap-1.5"
          >
            {saving ? "Saving…" : "＋ Save current as version"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="text-center text-xs text-zinc-400 py-8">Loading history…</div>
          ) : versions.length === 0 ? (
            <div className="text-center text-xs text-zinc-400 py-10 px-4">
              No versions yet. Snapshots are saved automatically as you edit, or save one now.
            </div>
          ) : (
            <div className="space-y-1.5">
              {versions.map((v, i) => (
                <div
                  key={v.id}
                  className="group flex items-center gap-3 px-3 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-emerald-400 dark:hover:border-emerald-500 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-medium text-zinc-800 dark:text-zinc-200 truncate">
                      {v.label || (i === 0 ? "Latest snapshot" : "Snapshot")}
                    </div>
                    <div className="text-[11px] text-zinc-400 truncate">
                      {timeAgo(v.created_at)}
                      {v.author_name ? ` · ${v.author_name}` : ""} · {v.node_count} nodes
                    </div>
                  </div>
                  <button
                    onClick={() => handleRestore(v)}
                    disabled={restoringId === v.id}
                    className="shrink-0 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/60 rounded-md hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors disabled:opacity-50"
                  >
                    {restoringId === v.id ? "…" : "Restore"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
