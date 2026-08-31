/**
 * Server-side Gemini plumbing shared by the AI routes.
 *
 * The key is resolved per-request: a key supplied by the caller (from the
 * browser's AI Settings — see [[ai-settings]]) wins, and `GEMINI_API_KEY` in the
 * environment is the fallback. Keys are never logged or persisted.
 */

export const NODE_TYPES = ["start", "step", "decision", "sub", "ok", "fail", "note"] as const;
export const CONN_TYPES = ["", "cyes", "cno", "camber"] as const;
export const ACTORS = ["revibe", "seller", "system", "carrier"] as const;
export const TEXT_POSITIONS = ["inside", "top", "bottom", "left", "right"] as const;
export const TEXT_ALIGNS = ["left", "center", "right"] as const;
export const TEXT_SIZES = ["sm", "base", "lg"] as const;
export const NODE_WIDTHS = ["compact", "normal", "wide", "xwide"] as const;

export const DEFAULT_MODEL = "gemini-2.5-flash";

/** A model id is only ever interpolated into a URL path, so keep it to safe characters. */
const MODEL_RE = /^[a-zA-Z0-9._/-]{1,80}$/;

export interface AICreds {
  apiKey: string;
  model: string;
}

export type CredsResult = { ok: true; creds: AICreds } | { ok: false; error: string; status: number };

export function resolveCreds(body: { apiKey?: unknown; model?: unknown }): CredsResult {
  const supplied = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const apiKey = supplied || process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      error: "No Gemini API key configured. Open AI Settings (gear icon in the AI dialog) and paste your Google AI Studio API key.",
    };
  }

  const requested = typeof body.model === "string" ? body.model.trim() : "";
  let model = requested || process.env.GEMINI_MODEL || DEFAULT_MODEL;
  model = model.replace(/^models\//, ""); // Normalize if prefix provided

  if (!MODEL_RE.test(model)) {
    return { ok: false, status: 400, error: `Invalid model name "${model}".` };
  }

  return { ok: true, creds: { apiKey, model } };
}

export interface GeminiCallResult {
  ok: boolean;
  status: number;
  text?: string;
  error?: string;
  detail?: string;
}

/** Single JSON-mode Gemini call. Returns the text of the first candidate. */
export async function callGemini(
  creds: AICreds,
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.3
): Promise<GeminiCallResult> {
  const modelName = creds.model.replace(/^models\//, "");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": creds.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature,
        },
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    return { ok: false, status: 502, error: `Could not connect to Google Gemini: ${message}` };
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return {
      ok: false,
      status: res.status === 429 ? 429 : 502,
      error: geminiError(res.status, modelName),
      detail: detail.slice(0, 500),
    };
  }

  const json = await res.json().catch(() => null);
  const text: string | undefined = json?.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text || "")
    .join("");

  if (!text) {
    const blocked = json?.promptFeedback?.blockReason;
    return {
      ok: false,
      status: 502,
      error: blocked ? `The model declined to generate (${blocked}).` : "The Gemini model returned an empty response.",
    };
  }

  return { ok: true, status: 200, text };
}

/** Maps Gemini HTTP failures onto friendly, actionable messages. */
function geminiError(status: number, model: string): string {
  switch (status) {
    case 400:
      return "Gemini rejected the request format. The API key may be malformed or prompt too long.";
    case 401:
    case 403:
      return "Gemini rejected the API key. Please check your API key in AI Settings or verify permissions in Google AI Studio.";
    case 404:
      return `Model "${model}" was not found or is unavailable for your API key tier. Please select another model in AI Settings.`;
    case 429:
      return "Gemini quota or rate limit reached. Please wait a few moments or upgrade your quota tier in Google AI Studio.";
    default:
      return `Gemini API request returned status ${status}.`;
  }
}

/** Robust JSON extraction: handles clean JSON, markdown code blocks, and minor trailing comma typos. */
export function extractJson<T = Record<string, unknown>>(rawText: string): T | null {
  if (!rawText) return null;
  let text = rawText.trim();

  // Strip ```json ... ``` or ``` ... ```
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }

  // Attempt direct parse
  try {
    return JSON.parse(text) as T;
  } catch {}

  // Find outermost JSON object
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    let slice = text.slice(start, end + 1);
    try {
      return JSON.parse(slice) as T;
    } catch {
      // Fix common LLM trailing commas before closing braces/brackets
      try {
        slice = slice.replace(/,\s*([}\]])/g, "$1");
        return JSON.parse(slice) as T;
      } catch {}
    }
  }

  return null;
}

/** Verifies a key/model pair with a fast verification call. */
export async function verifyKey(creds: AICreds): Promise<GeminiCallResult> {
  return callGemini(
    creds,
    'Reply with the JSON object {"ok":true} and nothing else.',
    "ping",
    0
  );
}
