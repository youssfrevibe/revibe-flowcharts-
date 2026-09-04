import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-client";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { data, error } = await supabaseAdmin
      .from("flowcharts")
      .select("*")
      .eq("slug", slug)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Flowchart not found" }, { status: 404 });
    }

    return NextResponse.json({
      flowchart: {
        slug: data.slug,
        title: data.title,
        description: data.description,
        nodes: data.nodes,
        connections: data.connections,
        nodeCount: data.node_count,
        color: data.color,
        isCustom: data.is_custom,
        updatedAt: data.updated_at,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH → metadata-only update. Body: { archived?, title?, description?, color? }
//
// Deliberately cannot touch nodes/connections. Renaming used to go through the POST
// upsert, which always writes the whole document, so the browser had to supply nodes it
// might not have — a stale or defaulted local cache would silently overwrite the live
// diagram (a 115-node flow was replaced by the 24-node starter template this way).
// Metadata edits belong here; only the editor writes nodes.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await req.json();

    const patch: Record<string, unknown> = {};
    if ("archived" in body) patch.archived = Boolean(body.archived);
    if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
    if (typeof body.description === "string") patch.description = body.description;
    if (typeof body.color === "string" && body.color) patch.color = body.color;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No supported fields to update" }, { status: 400 });
    }
    patch.updated_at = new Date().toISOString();

    const { error } = await supabaseAdmin
      .from("flowcharts")
      .update(patch)
      .eq("slug", slug);

    if (error) {
      // Column likely missing — signal that the migration is needed.
      if (/archived/i.test(error.message)) {
        return NextResponse.json({ error: "Archiving not set up yet.", needsMigration: true }, { status: 503 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { error } = await supabaseAdmin
      .from("flowcharts")
      .delete()
      .eq("slug", slug);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
