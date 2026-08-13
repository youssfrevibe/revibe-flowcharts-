import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-client";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("flowcharts")
      .select("slug, title, description, node_count, color, is_custom, updated_at")
      .order("updated_at", { ascending: false });

    if (error) {
      console.warn("Supabase GET flowcharts error:", error.message);
      return NextResponse.json({ error: error.message, flowcharts: [] }, { status: 200 });
    }

    const flowcharts = (data || []).map((row) => ({
      slug: row.slug,
      title: row.title,
      description: row.description,
      nodeCount: row.node_count || 0,
      color: row.color || "bg-purple-700",
      isCustom: row.is_custom,
      updatedAt: row.updated_at,
    }));

    return NextResponse.json({ flowcharts });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, flowcharts: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { slug, title, description, nodes, connections, color, isCustom } = body;

    if (!slug || !title) {
      return NextResponse.json({ error: "Missing slug or title" }, { status: 400 });
    }

    const nodeCount = Array.isArray(nodes) ? nodes.length : 0;

    const { data, error } = await supabaseAdmin
      .from("flowcharts")
      .upsert(
        {
          slug,
          title,
          description: description || "",
          nodes: nodes || [],
          connections: connections || [],
          node_count: nodeCount,
          color: color || "bg-purple-700",
          is_custom: isCustom ?? true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "slug" }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, flowchart: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
