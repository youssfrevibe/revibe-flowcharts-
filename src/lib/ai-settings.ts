/**
 * Client-side AI configuration for Google Gemini integration.
 *
 * The Gemini API key lives in this browser's localStorage, not in the server
 * environment — so each person supplies their own key from the Settings dialog
 * and no key is hardcoded or shipped in the bundle. The key travels with each
 * request body to our own `/api/ai/*` routes, which forward it to Google and
 * never persist it.
 *
 * `GEMINI_API_KEY` in the server environment still works as a fallback when no
 * local key is set.
 */

const KEY_STORAGE = "pm_ai_api_key";
const MODEL_STORAGE = "pm_ai_model";

/** Models known to work with structured JSON mode and Gemini generateContent endpoints. */
export const AI_MODELS = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash — ultra fast & high intelligence (Recommended)", tier: "flagship" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro — state-of-the-art reasoning for complex flows", tier: "flagship" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite — high throughput & minimal latency", tier: "lightweight" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash — next-gen multimodal speed", tier: "fast" },
  { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite — lightweight task automation", tier: "lightweight" },
  { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro — deep document context & reasoning", tier: "reasoning" },
  { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash — stable general purpose", tier: "fast" },
] as const;

export const DEFAULT_AI_MODEL = "gemini-2.5-flash";

export interface AISettings {
  apiKey: string;
  model: string;
}

export function getAISettings(): AISettings {
  if (typeof window === "undefined") return { apiKey: "", model: DEFAULT_AI_MODEL };
  try {
    return {
      apiKey: localStorage.getItem(KEY_STORAGE) || "",
      model: localStorage.getItem(MODEL_STORAGE) || DEFAULT_AI_MODEL,
    };
  } catch {
    return { apiKey: "", model: DEFAULT_AI_MODEL };
  }
}

export function saveAISettings(s: AISettings): void {
  try {
    if (s.apiKey.trim()) localStorage.setItem(KEY_STORAGE, s.apiKey.trim());
    else localStorage.removeItem(KEY_STORAGE);
    localStorage.setItem(MODEL_STORAGE, s.model || DEFAULT_AI_MODEL);
  } catch {}
}

export function clearAISettings(): void {
  try {
    localStorage.removeItem(KEY_STORAGE);
    localStorage.removeItem(MODEL_STORAGE);
  } catch {}
}

/** Shows only the tail of a key, for confirming which key is stored without revealing it. */
export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "•".repeat(key.length);
  return `${"•".repeat(12)}${key.slice(-4)}`;
}

/** Credentials block merged into every `/api/ai/*` request body. */
export function aiCredentials(): { apiKey?: string; model?: string } {
  const { apiKey, model } = getAISettings();
  return { ...(apiKey ? { apiKey } : {}), ...(model ? { model } : {}) };
}
