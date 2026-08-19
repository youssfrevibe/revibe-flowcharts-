import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-client";

/**
 * Version history for a flowchart. Backed by the `flowchart_versions` table
 * (see supabase-migration.sql). Degrades gracefully if the table doesn't exist yet.
 */

const MISSING_TABLE = /relation .*flowchart_versions.* does not exist|could not find the table/i;

// GET /api/flowcharts/[slug]/versions           → list snapshots (metadata only)
// GET /api/flowcharts/[slug]/versions?id=<uuid>  → full snapshot payload
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const id = new URL(req.url).searchParams.get("id");

    if (id) {
      const { data, error } = await supabaseAdmin
        .from("flowchart_versions")
        .select("id, nodes, connections, label, author_name, node_count, created_at")
        .eq("id", id)
        .eq("slug", slug)
        .single();
      if (error || !data) return NextResponse.json({ error: "Version not found" }, { status: 404 });
      return NextResponse.json({ version: data });
    }

    const { data, error } = await supabaseAdmin
      .from("flowchart_versions")
      .select("id, label, author_name, node_count, created_at")
      .eq("slug", slug)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      if (MISSING_TABLE.test(error.message)) return NextResponse.json({ versions: [], needsMigration: true });
      return NextResponse.json({ versions: [], error: error.message });
    }
    return NextResponse.json({ versions: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ versions: [], error: message }, { status: 200 });
  }
}

// POST /api/flowcharts/[slug]/versions → save a snapshot { nodes, connections, label, author }
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const body = await req.json();
    const { nodes, connections, label, author } = body;
    if (!Array.isArray(nodes)) return NextResponse.json({ error: "Missing nodes" }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("flowchart_versions")
      .insert({
        slug,
        nodes,
        connections: connections || [],
        node_count: nodes.length,
        label: label || null,
        author_name: author || null,
        created_at: new Date().toISOString(),
      })
      .select("id, label, author_name, node_count, created_at")
      .single();

    if (error) {
      if (MISSING_TABLE.test(error.message)) return NextResponse.json({ error: "Version history not set up yet.", needsMigration: true }, { status: 503 });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Keep only the most recent 50 snapshots per slug.
    void pruneOld(slug);

    return NextResponse.json({ version: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function pruneOld(slug: string) {
  try {
    const { data } = await supabaseAdmin
      .from("flowchart_versions")
      .select("id")
      .eq("slug", slug)
      .order("created_at", { ascending: false })
      .range(50, 200);
    const stale = (data || []).map((r) => r.id);
    if (stale.length) await supabaseAdmin.from("flowchart_versions").delete().in("id", stale);
  } catch {}
}
