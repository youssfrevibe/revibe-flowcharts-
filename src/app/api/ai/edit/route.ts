import { NextResponse } from "next/server";
import { callGemini, extractJson, resolveCreds } from "@/lib/ai-server";
import { EDIT_SYSTEM_PROMPT, describeFlow, normalizeEditPlan } from "@/lib/ai-schema";
import { FlowConnection, FlowData, FlowNode } from "@/lib/types";

/**
 * Edits an existing flowchart. The client posts the live document plus a
 * natural-language instruction; the model reads the flow as it stands and returns
 * a list of surgical operations, which the client applies through [[applyAIEdits]]
 * so the change replays to collaborators like any hand edit.
 *
 * The API key comes from the caller's AI Settings, falling back to
 * `GEMINI_API_KEY` in the server environment.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const creds = resolveCreds(body);
    if (!creds.ok) return NextResponse.json({ error: creds.error }, { status: creds.status });

    const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
    if (!instruction) {
      return NextResponse.json({ error: "Describe the change you want the AI to make." }, { status: 400 });
    }

    const data = readFlow(body.flow);
    if (!data) {
      return NextResponse.json({ error: "The current diagram could not be read." }, { status: 400 });
    }
    if (!data.nodes.length) {
      return NextResponse.json(
        { error: "This diagram is empty — use Generate to draft one first." },
        { status: 400 }
      );
    }

    const title = typeof body.title === "string" ? body.title.slice(0, 200) : undefined;
    const userPrompt = [
      "CURRENT FLOWCHART",
      describeFlow(data, title),
      "",
      "INSTRUCTION",
      instruction.slice(0, 20000),
    ].join("\n");

    const call = await callGemini(creds.creds, EDIT_SYSTEM_PROMPT, userPrompt, 0.3);
    if (!call.ok || !call.text) {
      return NextResponse.json({ error: call.error, detail: call.detail }, { status: call.status });
    }

    const parsed = extractJson(call.text);
    if (!parsed) {
      return NextResponse.json({ error: "Could not parse the AI response." }, { status: 502 });
    }

    const plan = normalizeEditPlan(parsed, new Set(data.nodes.map((n) => n.id)));
    return NextResponse.json(plan);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Reads the posted document defensively. Only the fields the prompt serializes are
 * kept, and the size is capped so a huge or malformed body cannot blow up the
 * prompt we send to Gemini.
 */
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
