import { NextResponse } from "next/server";
import { callGemini, extractJson, resolveCreds } from "@/lib/ai-server";
import { LEVELS_SYSTEM_PROMPT, describeFlow, normalizeLevelPlan } from "@/lib/ai-schema";
import { atLevel } from "@/lib/levels";
import { FlowConnection, FlowData, FlowNode } from "@/lib/types";

/**
 * Summarises an existing map into the two coarser detail levels.
 *
 * Unlike generate and edit, the user gives no instruction — the detailed map *is* the
 * instruction. The model only ever sees level 3, so it cannot be confused by a previous
 * summary it or someone else wrote, and re-running always summarises the real process
 * rather than a summary of a summary.
 *
 * The key comes from the caller's AI Settings, falling back to `GEMINI_API_KEY`.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const creds = resolveCreds(body);
    if (!creds.ok) return NextResponse.json({ error: creds.error }, { status: creds.status });

    const posted = readFlow(body.flow);
    if (!posted) {
      return NextResponse.json({ error: "The current diagram could not be read." }, { status: 400 });
    }

    // Level 3 only. Summaries are derived from the real process, never from each other.
    const detail = atLevel(posted, 3);
    if (detail.nodes.length < 4) {
      return NextResponse.json(
        { error: "There is not enough detail to summarise yet — map the full process first." },
        { status: 400 }
      );
    }

    const title = typeof body.title === "string" ? body.title.slice(0, 200) : undefined;
    const userPrompt = ["LEVEL 3 — THE FULL PROCESS", describeFlow(detail, title)].join("\n");

    const call = await callGemini(creds.creds, LEVELS_SYSTEM_PROMPT, userPrompt, 0.2);
    if (!call.ok || !call.text) {
      return NextResponse.json({ error: call.error, detail: call.detail }, { status: call.status });
    }

    const parsed = extractJson(call.text);
    if (!parsed) {
      return NextResponse.json({ error: "Could not parse the AI response." }, { status: 502 });
    }

    const plan = normalizeLevelPlan(parsed, new Set(detail.nodes.map((n) => n.id)));
    if (!plan.tiers.length) {
      return NextResponse.json({ error: "The AI returned no usable summary levels." }, { status: 502 });
    }
    return NextResponse.json(plan);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Same defensive read as the edit route: only what the prompt serialises, size-capped. */
function readFlow(raw: unknown): FlowData | null {
  const r = raw as { nodes?: unknown; connections?: unknown } | null;
  if (!r || !Array.isArray(r.nodes)) return null;

  const nodes = (r.nodes as unknown[]).slice(0, 400).flatMap((n) => {
    const x = n as Partial<FlowNode>;
    if (typeof x?.id !== "string" || !x.id) return [];
    return [x as FlowNode];
  });

  const ids = new Set(nodes.map((n) => n.id));
  const connections = (Array.isArray(r.connections) ? (r.connections as unknown[]) : [])
    .slice(0, 800)
    .flatMap((c) => {
      const x = c as Partial<FlowConnection>;
      if (typeof x?.from !== "string" || typeof x?.to !== "string") return [];
      if (!ids.has(x.from) || !ids.has(x.to)) return [];
      return [x as FlowConnection];
    });

  return { nodes, connections };
}
