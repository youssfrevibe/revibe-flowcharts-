"use client";

import { useState } from "react";
import { FlowNode, FlowConnection } from "@/lib/types";

interface Props {
  onClose: () => void;
  /** Called with a generated draft. Replacing vs merging is decided by the parent. */
  onGenerated: (nodes: FlowNode[], connections: FlowConnection[], title?: string) => void;
}

const EXAMPLES = [
  "Customer returns a faulty item: request, inspection, approve or reject, refund or replace.",
  "New employee onboarding from offer acceptance to first-day setup.",
  "Order fulfilment from checkout to delivery, including out-of-stock handling.",
];

export default function AIGenerateModal({ onClose, onGenerated }: Props) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Generation failed. Please try again.");
        return;
      }
      onGenerated(json.nodes || [], json.connections || [], json.title);
      onClose();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[650] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg bg-white dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-zinc-200 dark:border-zinc-700">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-sm">
            <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l1.9 5.1L19 9l-5.1 1.9L12 16l-1.9-5.1L5 9l5.1-1.9L12 2zM19 15l.95 2.55L22.5 18.5l-2.55.95L19 22l-.95-2.55L15.5 18.5l2.55-.95L19 15z" />
            </svg>
          </div>
          <div>
            <h2 className="text-[15px] font-semibold font-display text-zinc-900 dark:text-zinc-100">Generate with AI</h2>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Describe a process — Gemini drafts the flowchart.</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto w-8 h-8 flex items-center justify-center rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-400 text-lg"
          >
            &times;
          </button>
        </div>

        <div className="p-5 space-y-4">
          <textarea
            autoFocus
            rows={5}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") generate();
            }}
            placeholder="e.g. Warranty claim process: customer submits claim, support reviews, if valid we ship a replacement, otherwise we notify the customer with a reason…"
            className="w-full px-3.5 py-2.5 text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
          />

          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setPrompt(ex)}
                className="text-[11px] px-2.5 py-1 rounded-full border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
              >
                {ex.split(":")[0]}
              </button>
            ))}
          </div>

          {error && (
            <div className="text-[12px] text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-amber-700 dark:text-amber-400">
              ⚠ This replaces the current diagram (a version is saved first).
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={generate}
                disabled={loading || !prompt.trim()}
                className="px-4 py-2 text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
              >
                {loading ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Generating…
                  </>
                ) : (
                  "Generate flowchart"
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
