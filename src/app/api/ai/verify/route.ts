import { NextResponse } from "next/server";
import { resolveCreds, verifyKey } from "@/lib/ai-server";

/**
 * Checks a key/model pair with one trivial Gemini call, so AI Settings can say
 * "this key works" before the user tries to generate a whole diagram. The key is
 * used for this request only — never stored or logged server-side.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const creds = resolveCreds(body);
    if (!creds.ok) return NextResponse.json({ ok: false, error: creds.error }, { status: creds.status });

    const call = await verifyKey(creds.creds);
    if (!call.ok) {
      return NextResponse.json({ ok: false, error: call.error, detail: call.detail }, { status: call.status });
    }

    return NextResponse.json({
      ok: true,
      model: creds.creds.model,
      /** True when the key came from the server env rather than the request body. */
      usingServerKey: !(typeof body.apiKey === "string" && body.apiKey.trim()),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
