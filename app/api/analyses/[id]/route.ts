import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = supabaseAdmin();

  const { data: analysis, error: analysisError } = await supabase
    .from("analyses")
    .select("id, status, categories, error_message, created_at, completed_at, permit_sets(file_name)")
    .eq("id", id)
    .single();

  if (analysisError || !analysis) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }

  const permitSet = Array.isArray(analysis.permit_sets)
    ? analysis.permit_sets[0]
    : analysis.permit_sets;

  if (analysis.status !== "complete" && analysis.status !== "failed") {
    return NextResponse.json({
      id: analysis.id,
      status: analysis.status,
      fileName: permitSet?.file_name ?? null,
      categories: analysis.categories,
      createdAt: analysis.created_at,
    });
  }

  const [{ data: items }, { data: summary }] = await Promise.all([
    supabase
      .from("material_items")
      .select("*")
      .eq("analysis_id", id)
      .order("category", { ascending: true })
      .order("import_suitability_score", { ascending: false }),
    supabase.from("analysis_summaries").select("*").eq("analysis_id", id).maybeSingle(),
  ]);

  return NextResponse.json({
    id: analysis.id,
    status: analysis.status,
    fileName: permitSet?.file_name ?? null,
    categories: analysis.categories,
    createdAt: analysis.created_at,
    completedAt: analysis.completed_at,
    errorMessage: analysis.error_message,
    items: items ?? [],
    summary: summary ?? null,
  });
}
