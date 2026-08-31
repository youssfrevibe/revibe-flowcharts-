"use client";

import { useMemo, useState } from "react";
import { FlowConnection, FlowData, FlowNode } from "@/lib/types";
import { AIEditOp } from "@/lib/ai-schema";
import { aiCredentials, getAISettings } from "@/lib/ai-settings";
import AISettingsModal from "./AISettingsModal";

interface Props {
  onClose: () => void;
  /** Called with a generated draft. Replacing vs merging is decided by the parent. */
  onGenerated: (nodes: FlowNode[], connections: FlowConnection[], title?: string) => void;
  /** The live document, read at request time so the AI sees the flow as it stands. */
  getCurrent: () => FlowData;
  /** Current diagram title, given to the AI as context. */
  currentTitle?: string;
  /**
   * Applies a validated edit plan and returns a one-line summary of what changed.
   * Absent in read-only mode, which hides the Edit tab.
   */
  onApplyEdits?: (operations: AIEditOp[], summary: string) => string;
}

const GENERATE_PRESETS = [
  { label: "📦 Order Fulfillment & AWB", text: "Order fulfilment from checkout to delivery, including seller notification, auto-AWB creation, carrier pickup, and delivery confirmation." },
  { label: "🛡 Warranty & Lab Repair", text: "Customer claims warranty on faulty item: initial triage, courier pickup, LAB diagnostic inspection, parts replacement or refund, and customer survey." },
  { label: "💳 COD Verification & Fraud", text: "Cash on Delivery (COD) phone verification flow: customer call attempt 1/2/3, KYC address confirmation, SMS reminder, and auto-cancellation on no response." },
  { label: "🔄 Return to Origin (RTO)", text: "Failed delivery & RTO flow: carrier failed delivery attempts, seller notification, warehouse restock, and buyer refund processing." },
];

const EDIT_PRESETS = [
  { label: "🛡 Add Fraud Check Branch", text: "Add a fraud risk assessment gate right after the payment step, branching to a manual review sub-process." },
  { label: "👤 Set Actor Roles", text: "Assign actor roles across all steps: Revibe internal team for review/refunds, Seller for dispatch, Carrier for delivery, System for auto-AWB." },
  { label: "⏱ Fill Missing SLAs & Stages", text: "Populate realistic SLAs (e.g. 24h, 2 business days) and internal/external stage names on any steps missing them." },
  { label: "🔍 Audit Process Gaps", text: "Review this flowchart for missing exception paths or unhandled failure states, and add the necessary decision branches." },
];

type Mode = "generate" | "edit";

export default function AIGenerateModal({ onClose, onGenerated, getCurrent, currentTitle, onApplyEdits }: Props) {
  const canEdit = Boolean(onApplyEdits);
  const nodeCount = useMemo(() => getCurrent().nodes.length, [getCurrent]);

  const [mode, setMode] = useState<Mode>(canEdit && nodeCount > 0 ? "edit" : "generate");
  const [prompt, setPrompt] = useState("");
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState(getAISettings);
  const { apiKey, model } = settings;

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setResult(null);
  };

  const generate = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), ...aiCredentials() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Generation failed. Please try again.");
        return;
      }
      onGenerated(json.nodes || [], json.connections || [], json.title);
      onClose();
    } catch {
      setError("Network error connecting to Gemini. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const runEdit = async () => {
    if (!instruction.trim() || loading || !onApplyEdits) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const flow = getCurrent();
      const res = await fetch("/api/ai/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: instruction.trim(),
          flow: { nodes: flow.nodes, connections: flow.connections },
          title: currentTitle,
          ...aiCredentials(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "The AI could not complete that edit.");
        return;
      }

      const operations: AIEditOp[] = Array.isArray(json.operations) ? json.operations : [];
      const summary: string = typeof json.summary === "string" ? json.summary : "";

      if (!operations.length) {
        setResult(summary || "The AI did not find any changes to make.");
        return;
      }

      const applied = onApplyEdits(operations, summary);
      setResult(summary ? `${summary} (${applied})` : applied);
      setInstruction("");
    } catch {
      setError("Network error connecting to Gemini. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const submit = mode === "generate" ? generate : runEdit;
  const text = mode === "generate" ? prompt : instruction;

  return (
    <>
      <div
        className="fixed inset-0 z-[800] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div className="w-full max-w-xl bg-white dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-200 dark:border-zinc-700/80 bg-zinc-50/50 dark:bg-zinc-900/40">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-sky-500/20 text-base">
              ✨
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[15px] font-bold font-display text-zinc-900 dark:text-zinc-100">
                  AI Process Assistant
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-sky-100 dark:bg-sky-950/80 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60">
                  {model}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {mode === "generate"
                  ? "Describe any business process — the AI will structure, label, and wire the entire flowchart."
                  : `Instruct edits across the active ${nodeCount}-step flowchart.`}
              </p>
            </div>
            <button
              onClick={() => setShowSettings(true)}
              title="Configure AI model and API key"
              className="ml-auto w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
            >
              ⚙
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors text-lg"
            >
              &times;
            </button>
          </div>

          {/* Mode Switcher */}
          {canEdit && (
            <div className="flex gap-1.5 px-5 pt-4">
              {(
                [
                  ["edit", "Edit Active Flowchart"],
                  ["generate", "Draft New Flowchart"],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  onClick={() => switchMode(m)}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all ${
                    mode === m
                      ? "bg-sky-600 text-white shadow-xs"
                      : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Body */}
          <div className="p-5 space-y-4">
            <textarea
              autoFocus
              rows={4}
              value={text}
              onChange={(e) => (mode === "generate" ? setPrompt(e.target.value) : setInstruction(e.target.value))}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
              }}
              placeholder={
                mode === "generate"
                  ? "e.g. Warranty claim process: customer submits claim, support reviews, if valid we ship a replacement, otherwise we notify the customer with a reason…"
                  : "e.g. After 'Inspection', add a decision for whether the item is repairable — if yes route to the LAB sub-process, if no go to the refund path."
              }
              className="w-full px-3.5 py-2.5 text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none leading-relaxed"
            />

            {/* Quick Preset Prompts */}
            <div className="space-y-1.5">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-zinc-400">
                Quick Prompts &amp; Presets
              </span>
              <div className="flex flex-wrap gap-1.5">
                {(mode === "generate" ? GENERATE_PRESETS : EDIT_PRESETS).map((p) => (
                  <button
                    key={p.label}
                    onClick={() => (mode === "generate" ? setPrompt(p.text) : setInstruction(p.text))}
                    title={p.text}
                    className="text-[11px] px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700/80 bg-zinc-50/50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:border-sky-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors flex items-center gap-1"
                  >
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {!apiKey && (
              <div className="text-[11.5px] text-zinc-600 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 flex items-center justify-between">
                <span>Using default server key. Provide your own key for higher rate limits.</span>
                <button
                  onClick={() => setShowSettings(true)}
                  className="font-semibold text-sky-600 dark:text-sky-400 hover:underline shrink-0 ml-2"
                >
                  Configure API Key
                </button>
              </div>
            )}

            {error && (
              <div className="text-[12px] text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl px-3.5 py-2">
                {error}
              </div>
            )}

            {result && (
              <div className="text-[12px] text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 rounded-xl px-3.5 py-2">
                {result}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="text-[11px] text-zinc-400">
                {mode === "generate" ? "Replaces canvas (auto-version snapshot saved)" : "Surgical edits (undoable with ⌘Z)"}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-xl transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={submit}
                  disabled={loading || !text.trim()}
                  className="px-4 py-2 text-xs font-semibold bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-xl shadow-md shadow-sky-500/20 transition-all flex items-center gap-1.5 active:scale-95"
                >
                  {loading ? (
                    <>
                      <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      <span>{mode === "generate" ? "Generating Flowchart…" : "Applying Changes…"}</span>
                    </>
                  ) : mode === "generate" ? (
                    "Generate Flowchart"
                  ) : (
                    "Apply Changes"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showSettings && (
        <AISettingsModal
          onClose={() => setShowSettings(false)}
          onSaved={() => setSettings(getAISettings())}
        />
      )}
    </>
  );
}
