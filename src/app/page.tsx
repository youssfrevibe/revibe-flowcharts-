"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { DiagramMetadata } from "@/lib/types";
import {
  getCachedDiagrams,
  fetchCloudDiagrams,
  createCustomDiagram,
  deleteCustomDiagram,
  updateDiagramMetadata,
  archiveDiagram,
  unarchiveDiagram,
  fetchArchivedDiagrams,
  BUILTIN_DIAGRAMS,
} from "@/lib/diagram-store";
import ThemeToggle from "@/components/ThemeToggle";

const THEME_COLORS = [
  { id: "bg-emerald-700", name: "Emerald", fill: "#047857" },
  { id: "bg-teal-700", name: "Teal", fill: "#0f766e" },
  { id: "bg-cyan-700", name: "Cyan", fill: "#0e7490" },
  { id: "bg-blue-700", name: "Blue", fill: "#1d4ed8" },
  { id: "bg-indigo-700", name: "Indigo", fill: "#4338ca" },
  { id: "bg-purple-700", name: "Purple", fill: "#7e22ce" },
  { id: "bg-rose-600", name: "Rose", fill: "#e11d48" },
  { id: "bg-amber-700", name: "Amber", fill: "#b45309" },
  { id: "bg-slate-700", name: "Slate", fill: "#334155" },
];

export default function Home() {
  const [diagrams, setDiagrams] = useState<DiagramMetadata[]>(BUILTIN_DIAGRAMS);
  const [, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);

  // Create Modal
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  // Edit/Rename Modal
  const [editingDiagram, setEditingDiagram] = useState<DiagramMetadata | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editColor, setEditColor] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Archived (soft-deleted) diagrams
  const [archived, setArchived] = useState<DiagramMetadata[]>([]);
  const [showArchived, setShowArchived] = useState(false);

  const refresh = () => {
    fetchCloudDiagrams().then((list) => {
      setDiagrams(list);
      setLoading(false);
    });
    fetchArchivedDiagrams().then(setArchived);
  };

  useEffect(() => {
    setMounted(true);
    setDiagrams(getCachedDiagrams());
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || creating) return;
    setCreating(true);
    const created = await createCustomDiagram(title.trim(), description.trim());
    window.location.href = `/diagram/${created.slug}`;
  };

  const handleOpenEdit = (e: React.MouseEvent, d: DiagramMetadata) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingDiagram(d);
    setEditTitle(d.title);
    setEditDesc(d.description || "");
    setEditColor(d.color || "bg-purple-700");
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDiagram || !editTitle.trim() || savingEdit) return;
    setSavingEdit(true);

    const updatedTitle = editTitle.trim();
    const updatedDesc = editDesc.trim();
    const updatedColor = editColor || editingDiagram.color;

    // Optimistically update list
    setDiagrams((prev) =>
      prev.map((d) =>
        d.slug === editingDiagram.slug
          ? { ...d, title: updatedTitle, description: updatedDesc, color: updatedColor }
          : d
      )
    );

    await updateDiagramMetadata(editingDiagram.slug, {
      title: updatedTitle,
      description: updatedDesc,
      color: updatedColor,
    });

    setSavingEdit(false);
    setEditingDiagram(null);
    refresh();
  };

  const handleArchive = async (e: React.MouseEvent, d: DiagramMetadata) => {
    e.preventDefault();
    e.stopPropagation();
    // Optimistic: remove from the main list immediately.
    setDiagrams((prev) => prev.filter((x) => x.slug !== d.slug));
    setArchived((prev) => [d, ...prev.filter((x) => x.slug !== d.slug)]);
    await archiveDiagram(d.slug);
    refresh();
  };

  const handleRestore = async (e: React.MouseEvent, slug: string) => {
    e.preventDefault();
    e.stopPropagation();
    setArchived((prev) => prev.filter((x) => x.slug !== slug));
    await unarchiveDiagram(slug);
    refresh();
  };

  const handleDeleteForever = async (e: React.MouseEvent, slug: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("Permanently delete this flowchart for everyone? This cannot be undone.")) {
      setArchived((prev) => prev.filter((x) => x.slug !== slug));
      await deleteCustomDiagram(slug);
      refresh();
    }
  };

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-900">
      <div className="max-w-3xl mx-auto px-6 py-14">
        {/* Top Header */}
        <div className="flex items-center justify-between mb-10 pb-6 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 bg-emerald-700 dark:bg-emerald-600 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-md">
              R
            </div>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                Revibe&apos;s Flowcharts
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Live collaborative process maps — changes sync to everyone in real time
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white font-medium text-xs rounded-xl shadow-sm transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New Flowchart
            </button>
          </div>
        </div>

        {/* List of Flowcharts */}
        <div className="space-y-3">
          {diagrams.map((d) => (
            <Link
              key={d.slug}
              href={`/diagram/${d.slug}`}
              className="flex items-center gap-4 p-5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl hover:border-emerald-500 hover:shadow-md transition-all group relative"
            >
              <div
                className={`w-11 h-11 ${d.color || "bg-emerald-700"} rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm`}
              >
                {d.title[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                    {d.title}
                  </span>
                  {d.isCustom && (
                    <span className="text-[9px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300">
                      Custom
                    </span>
                  )}
                </div>
                <div className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-1">
                  {d.description || "Process workflow"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-[11px] text-zinc-400 tabular-nums shrink-0 mr-1">{d.nodeCount} nodes</div>

                {/* Edit / Rename Flowchart Button */}
                <button
                  type="button"
                  onClick={(e) => handleOpenEdit(e, d)}
                  title="Edit flowchart name & details"
                  className="p-1.5 text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>

                {d.isCustom && (
                  <button
                    type="button"
                    onClick={(e) => handleArchive(e, d)}
                    title="Archive flowchart (recoverable)"
                    className="p-1.5 text-zinc-400 hover:text-amber-600 dark:hover:text-amber-400 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4" />
                    </svg>
                  </button>
                )}
                <svg className="w-4 h-4 text-zinc-300 dark:text-zinc-600 group-hover:text-emerald-500 transition-colors shrink-0 ml-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </div>
            </Link>
          ))}
          {loading && (
            <div className="text-center text-xs text-zinc-400 py-4">Syncing from cloud…</div>
          )}
        </div>

        {/* Archived (soft-deleted) flowcharts */}
        {archived.length > 0 && (
          <div className="mt-8">
            <button
              onClick={() => setShowArchived((s) => !s)}
              className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
            >
              <svg
                className={`w-3 h-3 transition-transform ${showArchived ? "rotate-90" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                viewBox="0 0 24 24"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
              Archived ({archived.length})
            </button>

            {showArchived && (
              <div className="space-y-2 mt-3">
                {archived.map((d) => (
                  <div
                    key={d.slug}
                    className="flex items-center gap-4 p-4 bg-zinc-50 dark:bg-zinc-800/50 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl"
                  >
                    <div className={`w-9 h-9 ${d.color || "bg-zinc-500"} rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0 opacity-60`}>
                      {d.title[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-medium text-zinc-600 dark:text-zinc-300 truncate">{d.title}</div>
                      <div className="text-[11px] text-zinc-400 truncate">{d.description || "Archived process"}</div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleRestore(e, d.slug)}
                      className="px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/60 rounded-md hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
                    >
                      Restore
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteForever(e, d.slug)}
                      title="Delete permanently"
                      className="p-1.5 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Create Flowchart Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
            <div className="w-full max-w-md bg-white dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-2xl p-6">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Create New Flowchart</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-5">
                It&apos;s instantly shared — teammates with the link edit it live.
              </p>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Flowchart Title *
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Returns & Warranty Claims Flow"
                    className="w-full px-3.5 py-2 text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief description of what this process covers..."
                    className="w-full px-3.5 py-2 text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="px-4 py-2 text-xs font-medium bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg transition-colors shadow-xs"
                  >
                    {creating ? "Creating…" : "Create & Open Editor"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Flowchart Details Modal */}
        {editingDiagram && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
            <div className="w-full max-w-md bg-white dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-2xl p-6">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
                Edit Flowchart Details
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-5">
                Rename this project or change its description and theme color.
              </p>
              <form onSubmit={handleSaveEdit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Project Title *
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Flowchart Title"
                    className="w-full px-3.5 py-2 text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    placeholder="Brief description of what this process covers..."
                    className="w-full px-3.5 py-2 text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Theme Color
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {THEME_COLORS.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setEditColor(c.id)}
                        title={c.name}
                        className={`w-7 h-7 rounded-lg transition-transform ${
                          editColor === c.id
                            ? "ring-2 ring-offset-2 ring-emerald-500 ring-offset-white dark:ring-offset-zinc-800 scale-110 shadow-sm"
                            : "hover:scale-105 opacity-85 hover:opacity-100"
                        }`}
                        style={{ backgroundColor: c.fill }}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setEditingDiagram(null)}
                    className="px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdit}
                    className="px-4 py-2 text-xs font-medium bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg transition-colors shadow-xs"
                  >
                    {savingEdit ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
