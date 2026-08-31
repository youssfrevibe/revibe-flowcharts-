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
    await saveVersion(slug, getCurrent(), { author: authorName, label: "Before restore" });
    const data = await fetchVersion(slug, v.id);
    setRestoringId(null);
    if (data) {
      onRestore(data);
      refresh();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[820] flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-sm h-full bg-white dark:bg-zinc-800 border-l border-zinc-200 dark:border-zinc-700 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-700/80 bg-zinc-50/50 dark:bg-zinc-900/40">
          <div>
            <h2 className="text-[15px] font-bold font-display text-zinc-900 dark:text-zinc-100">
              Version Snapshots
            </h2>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Timeline of revisions you can restore anytime
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors text-lg"
          >
            &times;
          </button>
        </div>

        <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-700/60">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full px-3.5 py-2 text-xs font-semibold bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5"
          >
            {saving ? "Saving Snapshot…" : "＋ Snapshot Current State"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="text-center text-xs text-zinc-400 py-8">Loading history…</div>
          ) : versions.length === 0 ? (
            <div className="text-center text-xs text-zinc-400 py-10 px-4 leading-relaxed">
              No previous versions yet. Snapshots are created automatically during active editing sessions.
            </div>
          ) : (
            <div className="space-y-2">
              {versions.map((v, i) => (
                <div
                  key={v.id}
                  className="group flex items-center gap-3 p-3 rounded-xl border border-zinc-200/90 dark:border-zinc-700/80 hover:border-sky-400 dark:hover:border-sky-500 bg-white dark:bg-zinc-850 transition-colors shadow-2xs"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                      {v.label || (i === 0 ? "Latest Snapshot" : `Snapshot #${versions.length - i}`)}
                    </div>
                    <div className="text-[11px] text-zinc-400 truncate mt-0.5">
                      {timeAgo(v.created_at)}
                      {v.author_name ? ` · ${v.author_name}` : ""} · {v.node_count} steps
                    </div>
                  </div>
                  <button
                    onClick={() => handleRestore(v)}
                    disabled={restoringId === v.id}
                    className="shrink-0 px-3 py-1.5 text-[11px] font-semibold text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-800/80 rounded-lg hover:bg-sky-50 dark:hover:bg-sky-950/50 transition-colors disabled:opacity-50"
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
