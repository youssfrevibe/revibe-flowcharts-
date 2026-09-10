import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-client";

export async function GET(req: Request) {
  try {
    const wantArchived = new URL(req.url).searchParams.get("archived") === "1";

    // Try the archive-aware query first; fall back if the `archived` column
    // hasn't been added yet (migration not run).
    type Row = {
      slug: string;
      title: string;
      description: string;
      node_count: number | null;
      color: string | null;
      is_custom: boolean | null;
      updated_at: string | null;
      archived?: boolean | null;
    };
    let rows: Row[] | null = null;
    let hasArchived = true;
    {
      const { data, error } = await supabaseAdmin
        .from("flowcharts")
        .select("slug, title, description, node_count, color, is_custom, updated_at, archived")
        .order("updated_at", { ascending: false });
      if (error) {
        hasArchived = false;
        const fallback = await supabaseAdmin
          .from("flowcharts")
          .select("slug, title, description, node_count, color, is_custom, updated_at")
          .order("updated_at", { ascending: false });
        if (fallback.error) {
          console.warn("Supabase GET flowcharts error:", fallback.error.message);
          return NextResponse.json({ error: fallback.error.message, flowcharts: [] }, { status: 200 });
        }
        rows = fallback.data;
      } else {
        rows = data;
      }
    }

    const filtered = (rows || []).filter((row) => {
      if (!hasArchived) return !wantArchived; // no archive support → only serve the main list
      return wantArchived ? row.archived === true : row.archived !== true;
    });

    const flowcharts = filtered.map((row) => ({
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

    if (!slug) {
      return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    }

    const nodeCount = Array.isArray(nodes) ? nodes.length : 0;

    // A document save with no title must not invent one.
    //
    // The editor autosaves on every edit and used to send its `projectTitle` every time.
    // That state starts from the gallery lookup, which falls back to the placeholder
    // "Process Flowchart" when the list has not resolved — so on a slow or failed list
    // fetch, the first edit renamed the diagram to the placeholder, and a rename made
    // through PATCH was undone by the very next autosave 650ms later. Omitting the title
    // now means "leave the metadata exactly as it is", which is what a document save
    // should always have meant. PATCH remains the only way to change a name.
    if (!title) {
      const { data: updated, error: updateErr } = await supabaseAdmin
        .from("flowcharts")
        .update({
          nodes: nodes || [],
          connections: connections || [],
          node_count: nodeCount,
          updated_at: new Date().toISOString(),
        })
        .eq("slug", slug)
        .select("slug");

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }
      if (updated && updated.length > 0) {
        return NextResponse.json({ success: true });
      }
      // No such row yet. Creating one needs *some* title, and the slug is at least
      // truthful — better than refusing the write and dropping the user's work.
    }

    const { data, error } = await supabaseAdmin
      .from("flowcharts")
      .upsert(
        {
          slug,
          title: title || slug,
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
