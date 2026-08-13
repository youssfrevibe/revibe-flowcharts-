"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { DiagramMetadata } from "@/lib/types";
import { BUILTIN_DIAGRAMS, getAllDiagrams, createCustomDiagram, deleteCustomDiagram } from "@/lib/diagram-store";

export default function Home() {
  const [diagrams, setDiagrams] = useState<DiagramMetadata[]>(BUILTIN_DIAGRAMS);
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const refreshDiagrams = () => {
    setDiagrams(getAllDiagrams());
  };

  useEffect(() => {
    refreshDiagrams();
  }, []);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const created = createCustomDiagram(title.trim(), description.trim());
    setShowModal(false);
    setTitle("");
    setDescription("");
    refreshDiagrams();
    window.location.href = `/diagram/${created.slug}`;
  };

  const handleDelete = (e: React.MouseEvent, slug: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this custom flowchart?")) {
      deleteCustomDiagram(slug);
      refreshDiagrams();
    }
  };

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-900">
      <div className="max-w-3xl mx-auto px-6 py-14">
        {/* Header */}
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
                Interactive process maps & flowchart editor for Revibe operations
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white font-medium text-xs rounded-xl shadow-sm transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New Flowchart
          </button>
        </div>

        {/* Flowchart List */}
        <div className="space-y-3">
          {diagrams.map((d) => (
            <Link
              key={d.slug}
              href={`/diagram/${d.slug}`}
              className="flex items-center gap-4 p-5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl hover:border-emerald-500 dark:hover:border-emerald-500 hover:shadow-md transition-all group relative"
            >
              <div
                className={`w-11 h-11 ${d.color || "bg-emerald-700"} rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm`}
              >
                {d.title[0]}
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
                  {d.description}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-[11px] text-zinc-400 tabular-nums shrink-0">
                  {d.nodeCount} nodes
                </div>
                {d.isCustom && (
                  <button
                    onClick={(e) => handleDelete(e, d.slug)}
                    title="Delete flowchart"
                    className="p-1.5 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
                <svg className="w-4 h-4 text-zinc-300 dark:text-zinc-600 group-hover:text-emerald-500 transition-colors shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </div>
            </Link>
          ))}
        </div>

        {/* Modal to Create Flowchart */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
            <div className="w-full max-w-md bg-white dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-2xl p-6">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
                Create New Flowchart
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-5">
                Set up a new process mapping diagram for Revibe
              </p>

              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Flowchart Title *
                  </label>
                  <input
                    type="text"
                    required
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
                    className="px-4 py-2 text-xs font-medium bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg transition-colors shadow-xs"
                  >
                    Create & Open Editor
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
