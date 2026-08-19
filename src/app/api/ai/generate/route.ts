import { NextResponse } from "next/server";

/**
 * Generates a flowchart draft from a natural-language description using Gemini.
 * Requires GEMINI_API_KEY in the environment. Positions are left to the client's
 * auto-layout; the model only produces the process structure.
 */

const NODE_TYPES = ["start", "step", "decision", "sub", "ok", "fail", "note"];
const CONN_TYPES = ["", "cyes", "cno", "camber"];

const SYSTEM_PROMPT = `You are a process-mapping assistant. Turn the user's description of a business or operational process into a flowchart as STRICT JSON.

Output ONLY a JSON object of this exact shape (no markdown, no commentary):
{
  "title": string,                // short title for the process
  "nodes": [
    { "id": string, "type": string, "label": string, "detail": string }
  ],
  "connections": [
    { "from": string, "to": string, "label": string, "type": string }
  ]
}

Rules:
- "id" must be short and unique (e.g. "n1", "n2", ...). Connections reference these ids in "from"/"to".
- "type" for a node is one of: ${NODE_TYPES.map((t) => `"${t}"`).join(", ")}.
  - "start" = the entry point (exactly one).
  - "step" = a normal action/process step.
  - "decision" = a yes/no or branching question (label should read as a question).
  - "sub" = a sub-process that could be expanded elsewhere.
  - "ok" = a successful end state. "fail" = a failed/cancelled end state.
  - "note" = an optional annotation/comment (use sparingly).
- "type" for a connection is one of: ${CONN_TYPES.map((t) => `"${t}"`).join(", ")}.
  - "" = normal flow. "cyes" = the "Yes" branch (green). "cno" = the "No" branch (red). "camber" = a conditional branch (amber).
- Every decision node should have at least two outgoing connections (typically one "cyes" and one "cno"), each with a short "label".
- Keep "label" concise (a few words). Put extra explanation in "detail".
- Aim for 6–20 nodes for a typical process. Ensure the graph is connected and flows from the start to at least one end state.`;

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI is not configured. Add GEMINI_API_KEY to the server environment." },
        { status: 503 }
      );
    }

    const { prompt } = await req.json();
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json({ error: "Please describe the process to generate." }, { status: 400 });
    }

    const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: prompt.trim() }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Gemini request failed (${res.status}).`, detail: errText.slice(0, 500) },
        { status: 502 }
      );
    }

    const json = await res.json();
    const text: string | undefined = json?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text || "")
      .join("");

    if (!text) {
      return NextResponse.json({ error: "The model returned no content." }, { status: 502 });
    }

    const parsed = extractJson(text);
    if (!parsed || !Array.isArray(parsed.nodes)) {
      return NextResponse.json({ error: "Could not parse a flowchart from the AI response." }, { status: 502 });
    }

    const { nodes, connections } = normalize(parsed);
    if (!nodes.length) {
      return NextResponse.json({ error: "The AI did not produce any steps. Try a more detailed description." }, { status: 502 });
    }

    return NextResponse.json({ title: typeof parsed.title === "string" ? parsed.title : "", nodes, connections });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Best-effort JSON extraction: handles raw JSON or JSON wrapped in code fences/prose. */
function extractJson(text: string): { title?: unknown; nodes?: unknown[]; connections?: unknown[] } | null {
  try {
    return JSON.parse(text);
  } catch {}
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {}
  }
  return null;
}

/** Validates + coerces the model output into safe FlowNode/FlowConnection shapes. */
function normalize(parsed: { nodes?: unknown[]; connections?: unknown[] }) {
  const validNodeType = new Set(NODE_TYPES);
  const validConnType = new Set(CONN_TYPES);

  const rawNodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
  const idMap = new Map<string, string>();
  const nodes = rawNodes
    .map((raw, i) => {
      const r = raw as Record<string, unknown>;
      const oldId = String(r.id ?? `n${i + 1}`);
      const newId = `n_${i + 1}`;
      idMap.set(oldId, newId);
      const type = typeof r.type === "string" && validNodeType.has(r.type) ? r.type : "step";
      // Rough column position; the client re-runs auto-layout after import.
      return {
        id: newId,
        type: type as "start" | "step" | "decision" | "sub" | "ok" | "fail" | "note",
        x: 240 + (i % 4) * 320,
        y: 200 + Math.floor(i / 4) * 200,
        label: String(r.label ?? "Step").slice(0, 200),
        detail: typeof r.detail === "string" ? r.detail.slice(0, 2000) : "",
      };
    })
    .slice(0, 60);

  const validIds = new Set(nodes.map((n) => n.id));
  const rawConns = Array.isArray(parsed.connections) ? parsed.connections : [];
  const connections = rawConns
    .map((raw, i) => {
      const r = raw as Record<string, unknown>;
      const from = idMap.get(String(r.from));
      const to = idMap.get(String(r.to));
      if (!from || !to || !validIds.has(from) || !validIds.has(to) || from === to) return null;
      const type = typeof r.type === "string" && validConnType.has(r.type) ? r.type : "";
      return {
        id: `c_ai_${i + 1}`,
        from,
        to,
        label: typeof r.label === "string" ? r.label.slice(0, 80) : "",
        type: type as "" | "cyes" | "cno" | "camber",
      };
    })
    .filter(Boolean);

  return { nodes, connections: connections as NonNullable<(typeof connections)[number]>[] };
}
