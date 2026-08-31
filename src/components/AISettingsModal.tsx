"use client";

import { useEffect, useState } from "react";
import {
  AI_MODELS,
  DEFAULT_AI_MODEL,
  clearAISettings,
  getAISettings,
  maskKey,
  saveAISettings,
} from "@/lib/ai-settings";

interface Props {
  onClose: () => void;
  /** Fired after a save so the AI dialog can re-read the stored settings. */
  onSaved?: () => void;
}

type TestState =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "ok"; model: string; usingServerKey: boolean }
  | { kind: "error"; message: string };

export default function AISettingsModal({ onClose, onSaved }: Props) {
  const initial = useState(getAISettings)[0];
  const [apiKey, setApiKey] = useState(initial.apiKey);
  const [selectedModel, setSelectedModel] = useState(
    AI_MODELS.some((m) => m.id === initial.model) ? initial.model : "custom"
  );
  const [customModel, setCustomModel] = useState(
    AI_MODELS.some((m) => m.id === initial.model) ? "" : initial.model || ""
  );
  const [reveal, setReveal] = useState(false);
  const [storedKey, setStoredKey] = useState(initial.apiKey);
  const [storedModel, setStoredModel] = useState(initial.model || DEFAULT_AI_MODEL);
  const [test, setTest] = useState<TestState>({ kind: "idle" });
  const [saved, setSaved] = useState(false);

  const effectiveModel = selectedModel === "custom" ? (customModel.trim() || DEFAULT_AI_MODEL) : selectedModel;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const dirty = apiKey.trim() !== storedKey || effectiveModel !== storedModel;

  const runTest = async () => {
    setTest({ kind: "testing" });
    try {
      const res = await fetch("/api/ai/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          model: effectiveModel,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setTest({ kind: "error", message: json.error || `Test failed (${res.status}).` });
        return;
      }
      setTest({ kind: "ok", model: json.model, usingServerKey: Boolean(json.usingServerKey) });
    } catch {
      setTest({ kind: "error", message: "Network error while testing the Gemini key." });
    }
  };

  const save = () => {
    saveAISettings({ apiKey, model: effectiveModel });
    setStoredKey(apiKey.trim());
    setStoredModel(effectiveModel);
    setSaved(true);
    onSaved?.();
    setTimeout(() => setSaved(false), 2000);
  };

  const removeKey = () => {
    clearAISettings();
    setApiKey("");
    setStoredKey("");
    setSelectedModel(DEFAULT_AI_MODEL);
    setCustomModel("");
    setStoredModel(DEFAULT_AI_MODEL);
    setTest({ kind: "idle" });
    onSaved?.();
  };

  return (
    <div
      className="fixed inset-0 z-[850] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg bg-white dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-200 dark:border-zinc-700/80 bg-zinc-50/50 dark:bg-zinc-900/40">
          <div className="w-9 h-9 rounded-xl bg-sky-100 dark:bg-sky-950 flex items-center justify-center text-sky-600 dark:text-sky-400 text-base shadow-xs">
            ✨
          </div>
          <div>
            <h2 className="text-[15px] font-bold font-display text-zinc-900 dark:text-zinc-100">Google Gemini AI Engine</h2>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Configure model tiers, custom endpoints, and API credentials.
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors text-lg"
          >
            &times;
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Google AI Studio API Key
            </label>
            <div className="flex gap-1.5">
              <input
                autoFocus
                type={reveal ? "text" : "password"}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setTest({ kind: "idle" });
                }}
                placeholder="AIzaSy…"
                spellCheck={false}
                autoComplete="off"
                className="flex-1 px-3.5 py-2.5 text-sm font-mono bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <button
                type="button"
                onClick={() => setReveal((r) => !r)}
                className="px-3.5 text-xs font-semibold rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
              >
                {reveal ? "Hide" : "Show"}
              </button>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Get a free API key at{" "}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-600 dark:text-sky-400 font-semibold hover:underline"
              >
                aistudio.google.com/apikey
              </a>
              . {storedKey ? `Saved: ${maskKey(storedKey)}.` : "Leave blank to use server environment key."}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Gemini Model Tier
            </label>
            <select
              value={selectedModel}
              onChange={(e) => {
                setSelectedModel(e.target.value);
                setTest({ kind: "idle" });
              }}
              className="w-full px-3.5 py-2.5 text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              {AI_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
              <option value="custom">Custom Model ID (e.g. fine-tuned or preview model)…</option>
            </select>

            {selectedModel === "custom" && (
              <div className="mt-2 animate-in fade-in duration-100">
                <input
                  type="text"
                  value={customModel}
                  onChange={(e) => {
                    setCustomModel(e.target.value);
                    setTest({ kind: "idle" });
                  }}
                  placeholder="e.g. gemini-2.5-pro or tunedModels/my-model-123"
                  className="w-full px-3.5 py-2 text-xs font-mono bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            )}
          </div>

          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3.5 py-2.5 leading-relaxed">
            API keys are saved locally in your browser and used exclusively to process your requested workflow generations and edits.
          </div>

          {test.kind === "ok" && (
            <div className="text-[12px] text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 rounded-xl px-3.5 py-2 flex items-center gap-2">
              <span>✓</span>
              <span>
                Connected successfully — <strong>{test.model}</strong> {test.usingServerKey ? "(server key fallback)" : ""}
              </span>
            </div>
          )}
          {test.kind === "error" && (
            <div className="text-[12px] text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl px-3.5 py-2 flex items-center gap-2">
              <span>✕</span>
              <span>{test.message}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <button
              onClick={removeKey}
              disabled={!storedKey}
              className="text-[11.5px] font-medium text-red-600 dark:text-red-400 hover:underline disabled:opacity-40 disabled:no-underline"
            >
              Clear saved key
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={runTest}
                disabled={test.kind === "testing"}
                className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
              >
                {test.kind === "testing" ? "Testing…" : "Test Key"}
              </button>
              <button
                type="button"
                onClick={save}
                disabled={!dirty && !saved}
                className="px-4 py-2 text-xs font-semibold bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-xl shadow-sm transition-all active:scale-95"
              >
                {saved ? "Saved ✓" : "Save Settings"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
