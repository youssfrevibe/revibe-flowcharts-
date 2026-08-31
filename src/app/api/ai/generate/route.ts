import { NextResponse } from "next/server";
import { callGemini, extractJson, resolveCreds } from "@/lib/ai-server";
import { GENERATE_SYSTEM_PROMPT, normalizeGenerated } from "@/lib/ai-schema";

/**
 * Generates a flowchart draft from a natural-language description using Gemini.
 *
 * The API key comes from the caller's AI Settings (stored in their browser) and
 * falls back to `GEMINI_API_KEY` in the server environment. Positions are left to
 * the client's auto-layout; the model only produces the process structure.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const creds = resolveCreds(body);
    if (!creds.ok) return NextResponse.json({ error: creds.error }, { status: creds.status });

    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      return NextResponse.json({ error: "Please describe the process to generate." }, { status: 400 });
    }

    const call = await callGemini(creds.creds, GENERATE_SYSTEM_PROMPT, prompt.slice(0, 20000));
    if (!call.ok || !call.text) {
      return NextResponse.json({ error: call.error, detail: call.detail }, { status: call.status });
    }

    const parsed = extractJson<{ title?: unknown; nodes?: unknown[]; connections?: unknown[] }>(call.text);
    if (!parsed || !Array.isArray(parsed.nodes)) {
      return NextResponse.json({ error: "Could not parse a flowchart from the AI response." }, { status: 502 });
    }

    const { nodes, connections } = normalizeGenerated(parsed);
    if (!nodes.length) {
      return NextResponse.json(
        { error: "The AI did not produce any steps. Try a more detailed description." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      title: typeof parsed.title === "string" ? parsed.title : "",
      nodes,
      connections,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
