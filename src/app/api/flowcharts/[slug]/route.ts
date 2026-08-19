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

// PATCH → archive / unarchive (soft delete). Body: { archived: boolean }
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await req.json();
    const archived = Boolean(body.archived);

    const { error } = await supabaseAdmin
      .from("flowcharts")
      .update({ archived })
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
