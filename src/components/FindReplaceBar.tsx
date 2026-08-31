"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { FlowNode } from "@/lib/types";

interface Props {
  nodes: FlowNode[];
  /** Which mode the bar opens in — find only, or find + replace. */
  mode: "find" | "replace";
  onClose: () => void;
  /** Called when the user cycles to a match — the canvas should pan/zoom to it and select it. */
  onFocusNode: (id: string) => void;
  /** Batch-replace text across matching nodes. Returns the count of replacements made. */
  onReplace: (opts: { search: string; replace: string; regex: boolean; ids: string[] }) => number;
}

/** Which fields on a node we search through. */
const SEARCHABLE: (keyof FlowNode)[] = ["label", "detail", "internalStage", "externalStage", "sla"];

function matchesQuery(node: FlowNode, query: string, useRegex: boolean): boolean {
  if (!query) return false;
  try {
    const re = useRegex ? new RegExp(query, "i") : null;
    for (const key of SEARCHABLE) {
      const val = node[key];
      if (typeof val !== "string" || !val) continue;
      if (re ? re.test(val) : val.toLowerCase().includes(query.toLowerCase())) return true;
    }
  } catch {
    // Invalid regex — treat as no match
  }
  return false;
}

export default function FindReplaceBar({ nodes, mode: initialMode, onClose, onFocusNode, onReplace }: Props) {
  const [query, setQuery] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [showReplace, setShowReplace] = useState(initialMode === "replace");
  const [useRegex, setUseRegex] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [replaceCount, setReplaceCount] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 60);
  }, []);

  // Matches
  const matches = useMemo(() => {
    if (!query) return [];
    return nodes.filter((n) => matchesQuery(n, query, useRegex));
  }, [nodes, query, useRegex]);

  // Clamp index
  useEffect(() => {
    if (currentIndex >= matches.length) setCurrentIndex(Math.max(0, matches.length - 1));
  }, [matches.length, currentIndex]);

  // Focus current match
  useEffect(() => {
    if (matches.length > 0 && matches[currentIndex]) {
      onFocusNode(matches[currentIndex].id);
    }
  }, [currentIndex, matches, onFocusNode]);

  const next = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentIndex((i) => (i + 1) % matches.length);
  }, [matches.length]);

  const prev = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentIndex((i) => (i - 1 + matches.length) % matches.length);
  }, [matches.length]);

  const handleReplaceOne = () => {
    if (!matches[currentIndex] || !query) return;
    const count = onReplace({ search: query, replace: replaceText, regex: useRegex, ids: [matches[currentIndex].id] });
    setReplaceCount(count);
    // Move to next match after replacing
    if (matches.length > 1) next();
  };

  const handleReplaceAll = () => {
    if (matches.length === 0 || !query) return;
    const count = onReplace({ search: query, replace: replaceText, regex: useRegex, ids: matches.map((m) => m.id) });
    setReplaceCount(count);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      next();
    } else if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      prev();
    }
  };

  return (
    <div
      className="absolute top-14 right-4 z-[700] flex flex-col gap-2 p-3 rounded-xl border shadow-2xl backdrop-blur-md"
      style={{
        background: "var(--ui-bg, #fff)",
        borderColor: "var(--ui-border, #e5e7eb)",
        minWidth: 340,
        maxWidth: 420,
      }}
    >
      {/* Search row */}
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <svg
            className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 opacity-40"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setCurrentIndex(0); setReplaceCount(null); }}
            onKeyDown={onKeyDown}
            placeholder="Find in nodes…"
            className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg border bg-transparent focus:outline-none focus:ring-2 focus:ring-sky-500"
            style={{ borderColor: "var(--ui-border-soft, #e5e7eb)", color: "var(--ui-text, #18181b)" }}
          />
        </div>

        {/* Regex toggle */}
        <button
          onClick={() => setUseRegex((r) => !r)}
          title="Toggle regex search"
          className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs font-mono font-bold transition-colors ${
            useRegex
              ? "bg-sky-500 text-white"
              : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"
          }`}
        >
          .*
        </button>

        {/* Expand replace */}
        <button
          onClick={() => setShowReplace((s) => !s)}
          title="Toggle replace mode (Ctrl+H)"
          className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs transition-colors ${
            showReplace
              ? "bg-amber-500 text-white"
              : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
          </svg>
        </button>

        {/* Nav arrows */}
        <button onClick={prev} disabled={matches.length === 0} title="Previous match (Shift+Enter)" className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 disabled:opacity-30 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
        </button>
        <button onClick={next} disabled={matches.length === 0} title="Next match (Enter)" className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 disabled:opacity-30 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
        </button>

        {/* Match count */}
        <span className="text-[10px] font-mono tabular-nums whitespace-nowrap" style={{ color: "var(--ui-text-faint, #a1a1aa)" }}>
          {query ? `${matches.length > 0 ? currentIndex + 1 : 0}/${matches.length}` : ""}
        </span>

        {/* Close */}
        <button onClick={onClose} title="Close (Esc)" className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors text-sm">
          ×
        </button>
      </div>

      {/* Replace row */}
      {showReplace && (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={replaceText}
            onChange={(e) => { setReplaceText(e.target.value); setReplaceCount(null); }}
            onKeyDown={onKeyDown}
            placeholder="Replace with…"
            className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border bg-transparent focus:outline-none focus:ring-2 focus:ring-sky-500"
            style={{ borderColor: "var(--ui-border-soft, #e5e7eb)", color: "var(--ui-text, #18181b)" }}
          />
          <button
            onClick={handleReplaceOne}
            disabled={matches.length === 0}
            title="Replace current match"
            className="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors disabled:opacity-30 hover:bg-sky-50 dark:hover:bg-sky-950/50 text-sky-600 dark:text-sky-400"
            style={{ borderColor: "var(--ui-border-soft, #e5e7eb)" }}
          >
            Replace
          </button>
          <button
            onClick={handleReplaceAll}
            disabled={matches.length === 0}
            title="Replace all matches"
            className="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors disabled:opacity-30 hover:bg-amber-50 dark:hover:bg-amber-950/50 text-amber-600 dark:text-amber-400"
            style={{ borderColor: "var(--ui-border-soft, #e5e7eb)" }}
          >
            All
          </button>
          {replaceCount !== null && (
            <span className="text-[10px] font-mono whitespace-nowrap" style={{ color: "var(--ui-text-faint)" }}>
              {replaceCount} replaced
            </span>
          )}
        </div>
      )}
    </div>
  );
}
