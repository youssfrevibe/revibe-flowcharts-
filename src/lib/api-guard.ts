import { NextResponse } from "next/server";
import { supabaseAdmin } from "./supabase-client";

/**
 * Guards for the write side of the flowchart API.
 *
 * These routes were reachable by anyone who knew the URL: nothing checked a header, and
 * POST replaces a whole document. That was survivable while the browser app was the only
 * caller, and is not once an MCP server — or anything else holding the base URL — can
 * write to them.
 *
 * Reads stay open. The gallery and the editor fetch them on every page load with no
 * credential to offer, so requiring one on GET would break the app for the sake of data
 * that is already public to anyone with a share link.
 */

/**
 * Rejects a write that carries no key, once a key is configured.
 *
 * Deliberately opt-in: with `REVIBE_API_KEY` unset the guard does nothing, so a local
 * checkout and an existing deployment keep working until the variable is set on both
 * sides. Set it in production and the routes close in the same deploy.
 */
export function requireWriteKey(req: Request): NextResponse | null {
  const expected = process.env.REVIBE_API_KEY;
  if (!expected) return null;

  const got = req.headers.get("x-revibe-key");
  if (got && timingSafeEqual(got, expected)) return null;

  // The editor itself writes on every autosave and has no key to offer: this app has no
  // sign-in, so anything the browser could hold would be in the bundle and therefore
  // public. A request the browser made from the app's own page carries an Origin matching
  // the host; a server-side caller — an MCP, a script, curl — sends none, so it must
  // present the key.
  //
  // Be clear about what this is: it stops accidental and drive-by writes from outside the
  // app and gives the MCP a credential to revoke. It is not authentication. Origin is
  // trivially forged outside a browser, and until there is a real sign-in, anyone who can
  // load the page can still write.
  if (isSameOrigin(req)) return null;

  return NextResponse.json(
    { error: "Missing or invalid x-revibe-key" },
    { status: 401 }
  );
}

function isSameOrigin(req: Request): boolean {
  const host = req.headers.get("host");
  if (!host) return false;
  const source = req.headers.get("origin") || req.headers.get("referer");
  if (!source) return false; // no Origin at all means not a browser on our page
  try {
    return new URL(source).host === host;
  } catch {
    return false;
  }
}

/** Compares without leaking length or position through timing. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Below this share of the stored node count, a document write is refused. */
export const SHRINK_FLOOR = 0.7;

/**
 * Refuses a write that would drop most of a diagram.
 *
 * This is the incident that has actually happened here: a 115-node document replaced by
 * the 24-node starter template in a single write. `supabase-migration-2.sql` carries the
 * same rule as a database trigger, commented out because it is awkward to bypass from the
 * SQL editor. Enforcing it in the route instead gives the caller a way through — `force`
 * — while still making the destructive case a deliberate act rather than an accident.
 *
 * Growth is never blocked, and neither is a write to a slug with no row yet.
 */
export async function refuseMassDelete(
  slug: string,
  nextCount: number,
  force: boolean
): Promise<NextResponse | null> {
  if (force) return null;

  const { data, error } = await supabaseAdmin
    .from("flowcharts")
    .select("node_count")
    .eq("slug", slug)
    .maybeSingle();

  // A failed lookup must not block the write: the caller would lose their work over a
  // transient database error, which is a worse outcome than the shrink this guards.
  if (error || !data) return null;

  const stored = data.node_count ?? 0;
  if (stored < 25) return null; // too small for the ratio to mean anything
  if (nextCount >= stored * SHRINK_FLOOR) return null;

  return NextResponse.json(
    {
      error:
        `Refusing to shrink "${slug}" from ${stored} steps to ${nextCount} in one write. ` +
        `Send force: true if this is intended.`,
      stored,
      incoming: nextCount,
      needsForce: true,
    },
    { status: 409 }
  );
}
