"use client";

import { useState, useEffect, useMemo } from "react";
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
  saveToCloud,
  BUILTIN_DIAGRAMS,
} from "@/lib/diagram-store";
import ThemeToggle from "@/components/ThemeToggle";
import { ARRANGE_ON_OPEN_KEY } from "@/components/FlowCanvas";

const THEME_COLORS = [
  { id: "emerald", name: "Emerald", fill: "#065f46" },
  { id: "teal", name: "Teal", fill: "#115e59" },
  { id: "cyan", name: "Cyan", fill: "#155e75" },
  { id: "blue", name: "Blue", fill: "#1e40af" },
  { id: "indigo", name: "Indigo", fill: "#3730a3" },
  { id: "purple", name: "Purple", fill: "#6b21a8" },
  { id: "rose", name: "Rose", fill: "#9f1239" },
  { id: "amber", name: "Amber", fill: "#92400e" },
  { id: "slate", name: "Slate", fill: "#1e293b" },
];

export default function Home() {
  const [diagrams, setDiagrams] = useState<DiagramMetadata[]>(BUILTIN_DIAGRAMS);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "custom" | "builtin">("all");
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useState<HTMLInputElement | null>(null);

  // Paste-JSON deploy
  const [showPaste, setShowPaste] = useState(false);
  const [pasteJSON, setPasteJSON] = useState("");
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);

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

  /**
   * Turn raw flowchart JSON into a live diagram. Shared by the file picker, the
   * drag-and-drop target and the paste box, so all three behave identically.
   *
   * Coordinates in the source are left as-is here and arranged once on the canvas
   * instead — auto-layout needs the measured card sizes, which only exist there.
   */
  const deployFlowchartJSON = async (raw: string, fallbackTitle: string) => {
    let parsed: { nodes?: unknown; connections?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("That is not valid JSON.");
    }
    if (!parsed || !Array.isArray(parsed.nodes) || parsed.nodes.length === 0) {
      throw new Error('JSON needs a non-empty "nodes" array.');
    }
    const nodes = parsed.nodes as any[];
    const ids = new Set<string>();
    for (const n of nodes) {
      if (!n || typeof n.id !== "string" || !n.id) throw new Error("Every node needs a string \"id\".");
      if (ids.has(n.id)) throw new Error(`Duplicate node id: ${n.id}`);
      ids.add(n.id);
    }
    let connections = (Array.isArray(parsed.connections) ? parsed.connections : []) as any[];
    // Drop pathways that point at nodes which are not in the file — they would render as
    // stray lines into empty space.
    connections = connections.filter((c) => c && ids.has(c.from) && ids.has(c.to));
    if (connections.length === 0 && nodes.length > 1) {
      const sorted = [...nodes].sort((a: any, b: any) => (a.y || 0) - (b.y || 0) || (a.x || 0) - (b.x || 0));
      connections = sorted.slice(0, -1).map((src: any, i: number) => ({
        id: `c_${i}_${Date.now()}`,
        from: src.id,
        to: sorted[i + 1].id,
        label: src.type === "decision" ? "Yes" : "",
        type: src.type === "decision" ? "cyes" : "",
      }));
    }
    const diagramTitle = fallbackTitle.trim() || "Imported Flowchart";
    const created = await createCustomDiagram(diagramTitle, "Imported from JSON");
    await saveToCloud(
      created.slug,
      { nodes, connections },
      { title: diagramTitle, description: "Imported from JSON", color: "emerald", isCustom: true }
    );
    try {
      localStorage.setItem(ARRANGE_ON_OPEN_KEY, created.slug);
    } catch {}
    window.location.href = `/diagram/${created.slug}`;
  };

  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const name = file.name.replace(/\.json$/i, "").replace(/[-_]/g, " ");
      try {
        await deployFlowchartJSON(e.target?.result as string, name);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to import flowchart JSON.");
      }
    };
    reader.readAsText(file);
  };

  const handleDeployPaste = async () => {
    if (deploying) return;
    setDeploying(true);
    setPasteError(null);
    try {
      await deployFlowchartJSON(pasteJSON, pasteTitle);
    } catch (err) {
      setPasteError(err instanceof Error ? err.message : "Failed to deploy flowchart.");
      setDeploying(false);
    }
  };

  const handleOpenEdit = (e: React.MouseEvent, d: DiagramMetadata) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingDiagram(d);
    setEditTitle(d.title);
    setEditDesc(d.description || "");
    setEditColor(d.color || "emerald");
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDiagram || !editTitle.trim() || savingEdit) return;
    setSavingEdit(true);

    const updatedTitle = editTitle.trim();
    const updatedDesc = editDesc.trim();
    const updatedColor = editColor || editingDiagram.color;

    // Optimistic update
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

  // Filter & Search
  const filteredDiagrams = useMemo(() => {
    return diagrams.filter((d) => {
      if (filter === "custom" && !d.isCustom) return false;
      if (filter === "builtin" && d.isCustom) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return d.title.toLowerCase().includes(q) || (d.description && d.description.toLowerCase().includes(q));
    });
  }, [diagrams, filter, searchQuery]);

  const totalSteps = useMemo(() => {
    return diagrams.reduce((sum, d) => sum + (d.nodeCount || 0), 0);
  }, [diagrams]);

  return (
    <div className="min-h-screen bg-[#f8f9fa] dark:bg-[#0c0d0e] text-slate-900 dark:text-slate-100 selection:bg-sky-500 selection:text-white transition-colors duration-150">
      {/* Top Navigation Header */}
      <header className="border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-9 h-9 bg-gradient-to-br from-sky-600 to-indigo-600 rounded-xl flex items-center justify-center text-white font-extrabold text-lg shadow-md shadow-sky-500/20">
              R
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-[16px] tracking-tight text-zinc-900 dark:text-zinc-50">
                  Revibe Operations
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-800">
                  Process Maps
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <ThemeToggle className="!w-8.5 !h-8.5" />
            <label className="flex items-center gap-1.5 px-3 py-2 border border-zinc-200 dark:border-zinc-700/80 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-semibold text-xs rounded-xl cursor-pointer transition-colors shadow-2xs">
              <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <span>Import JSON</span>
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImportFile(file);
                  e.target.value = "";
                }}
              />
            </label>
            <button
              onClick={() => {
                setPasteError(null);
                setShowPaste(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 border border-zinc-200 dark:border-zinc-700/80 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-semibold text-xs rounded-xl transition-colors shadow-2xs"
            >
              <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m-7-8h8a2 2 0 012 2v9a2 2 0 01-2 2H8a2 2 0 01-2-2v-9a2 2 0 012-2zm1-4h6v4H9V4z" />
              </svg>
              <span>Paste JSON</span>
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-semibold text-xs rounded-xl shadow-md shadow-sky-600/20 transition-all active:scale-95"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span>New Flowchart</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Body */}
      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Hero Section */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8 pb-6 border-b border-zinc-200/80 dark:border-zinc-800/80">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight font-display text-zinc-900 dark:text-zinc-50">
              Process Workflows
            </h1>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1 max-w-xl leading-relaxed">
              Standard operating procedures, warranty funnels, and live collaborative workflows synced across the team.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto text-xs text-zinc-500 dark:text-zinc-400">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/60 font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse-live" />
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">{diagrams.length}</span> charts ·{" "}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">{totalSteps}</span> steps
            </div>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-6">
          <div className="relative w-full sm:w-80">
            <svg
              className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search flowcharts by name or keyword…"
              className="w-full pl-9 pr-3.5 py-2 text-xs bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/80 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-2xs"
            />
          </div>

          <div className="flex items-center gap-1.5 self-start sm:self-auto bg-zinc-100 dark:bg-zinc-800/80 p-1 rounded-xl border border-zinc-200 dark:border-zinc-700/60">
            {(["all", "custom", "builtin"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg capitalize transition-colors ${
                  filter === t
                    ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 shadow-xs"
                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Diagram Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredDiagrams.map((d) => (
            <Link
              key={d.slug}
              href={`/diagram/${d.slug}`}
              className="group relative flex flex-col p-5 bg-white dark:bg-zinc-800/80 border border-zinc-200/90 dark:border-zinc-700/80 rounded-2xl hover:border-sky-400 dark:hover:border-sky-500 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-150 overflow-hidden"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-base shadow-sm shrink-0"
                    style={{
                      background: d.color?.startsWith("#")
                        ? d.color
                        : "linear-gradient(135deg, #0284c7, #4f46e5)",
                    }}
                  >
                    {d.title[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors line-clamp-1">
                        {d.title}
                      </h2>
                      {d.isCustom && (
                        <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800 shrink-0">
                          Custom
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-zinc-400 font-mono">
                      {d.nodeCount || 0} process steps
                    </span>
                  </div>
                </div>

                {/* Edit & Archive Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => handleOpenEdit(e, d)}
                    title="Edit name & color"
                    className="p-1.5 text-zinc-400 hover:text-sky-600 dark:hover:text-sky-400 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
                    </svg>
                  </button>

                  {d.isCustom && (
                    <button
                      type="button"
                      onClick={(e) => handleArchive(e, d)}
                      title="Archive flowchart"
                      className="p-1.5 text-zinc-400 hover:text-amber-600 dark:hover:text-amber-400 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              <p className="text-[12.5px] text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed flex-1">
                {d.description || "Interactive collaborative flowchart mapping the operational lifecycle."}
              </p>

              <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-700/60 flex items-center justify-between text-[11px] text-zinc-400">
                <span className="flex items-center gap-1 text-sky-600 dark:text-sky-400 font-semibold group-hover:translate-x-0.5 transition-transform">
                  <span>Open Flowchart</span>
                  <span>→</span>
                </span>
                <span>Click to launch editor</span>
              </div>
            </Link>
          ))}
        </div>

        {filteredDiagrams.length === 0 && !loading && (
          <div className="py-16 text-center">
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">No flowcharts found</p>
            <p className="text-xs text-zinc-400 mt-1">Try clearing your search query or creating a new chart.</p>
          </div>
        )}

        {/* Archived Section */}
        {archived.length > 0 && (
          <div className="mt-12 pt-8 border-t border-zinc-200 dark:border-zinc-800">
            <button
              onClick={() => setShowArchived((s) => !s)}
              className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
            >
              <svg
                className={`w-3.5 h-3.5 transition-transform ${showArchived ? "rotate-90" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
              <span>Archived Flowcharts ({archived.length})</span>
            </button>

            {showArchived && (
              <div className="space-y-2 mt-4">
                {archived.map((d) => (
                  <div
                    key={d.slug}
                    className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-900/50 border border-dashed border-zinc-300 dark:border-zinc-700/80 rounded-xl"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 truncate">{d.title}</div>
                      <div className="text-xs text-zinc-400 truncate">{d.description || "Archived process map"}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => handleRestore(e, d.slug)}
                        className="px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
                      >
                        Restore
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteForever(e, d.slug)}
                        title="Delete permanently"
                        className="p-1.5 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Paste JSON → deploy a flowchart straight from source */}
        {showPaste && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
            <div className="w-full max-w-2xl bg-white dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-2xl p-6">
              <h2 className="text-lg font-bold font-display text-zinc-900 dark:text-zinc-100 mb-1">
                Deploy from JSON
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-5">
                Paste a flowchart export and it goes live as a new chart, auto-arranged on first open.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">
                    Title
                  </label>
                  <input
                    value={pasteTitle}
                    onChange={(e) => setPasteTitle(e.target.value)}
                    placeholder="Returns &amp; Refunds"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-transparent text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">
                    Flowchart JSON
                  </label>
                  <textarea
                    value={pasteJSON}
                    onChange={(e) => {
                      setPasteJSON(e.target.value);
                      if (pasteError) setPasteError(null);
                    }}
                    spellCheck={false}
                    rows={12}
                    placeholder={`{"nodes": [ ... ], "connections": [ ... ]}`}
                    className="w-full px-3 py-2 text-[11px] font-mono leading-relaxed rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/60 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500 resize-y"
                  />
                  <div className="mt-1.5 text-[11px] h-4">
                    {pasteError ? (
                      <span className="text-rose-600 dark:text-rose-400 font-semibold">{pasteError}</span>
                    ) : (
                      <span className="text-zinc-400 dark:text-zinc-500 tabular-nums">
                        {pasteJSON.length > 0 ? `${pasteJSON.length.toLocaleString()} characters` : ""}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-5">
                <button
                  onClick={() => setShowPaste(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeployPaste}
                  disabled={deploying || pasteJSON.trim().length === 0}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white shadow-md shadow-sky-600/20 transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
                >
                  {deploying ? "Deploying…" : "Deploy Flowchart"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create Flowchart Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
            <div className="w-full max-w-md bg-white dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-2xl p-6">
              <h2 className="text-lg font-bold font-display text-zinc-900 dark:text-zinc-100 mb-1">
                Create New Flowchart
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-5">
                Instantly collaborative — teammates with the URL can view and edit in real time.
              </p>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Flowchart Title *
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Returns & Warranty Claims Flow"
                    className="w-full px-3.5 py-2 text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief overview of what this process workflow encompasses..."
                    className="w-full px-3.5 py-2 text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="px-4 py-2 text-xs font-semibold bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-xl transition-all shadow-md shadow-sky-500/20"
                  >
                    {creating ? "Creating…" : "Create & Launch Editor"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Flowchart Details Modal */}
        {editingDiagram && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
            <div className="w-full max-w-md bg-white dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-2xl p-6">
              <h2 className="text-lg font-bold font-display text-zinc-900 dark:text-zinc-100 mb-1">
                Edit Flowchart Details
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-5">
                Update project title, description, and theme accent.
              </p>
              <form onSubmit={handleSaveEdit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Project Title *
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Theme Color
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {THEME_COLORS.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setEditColor(c.fill)}
                        title={c.name}
                        className={`w-7 h-7 rounded-lg transition-transform ${
                          editColor === c.fill
                            ? "ring-2 ring-offset-2 ring-sky-500 scale-110 shadow-sm"
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
                    className="px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdit}
                    className="px-4 py-2 text-xs font-semibold bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-xl transition-all shadow-md shadow-sky-500/20"
                  >
                    {savingEdit ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
