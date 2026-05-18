import "server-only";
import { serverEnv } from "@/lib/env.server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { extractItems } from "@/lib/analysis/extract";
import { scoreItems } from "@/lib/analysis/score";
import { summarizeAnalysis } from "@/lib/analysis/summarize";
import type { Category } from "@/lib/analysis/types";

async function downloadPdfBytes(storagePath: string): Promise<Buffer> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.storage
    .from(serverEnv.SUPABASE_STORAGE_BUCKET)
    .download(storagePath);
  if (error || !data) {
    throw new Error(`Failed to download permit set: ${error?.message ?? "no data"}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

export async function runAnalysis(analysisId: string): Promise<void> {
  const supabase = supabaseAdmin();

  const { data: analysis, error: analysisError } = await supabase
    .from("analyses")
    .select("id, permit_set_id, categories, permit_sets(file_name, storage_path)")
    .eq("id", analysisId)
    .single();

  if (analysisError || !analysis) {
    throw new Error(`Analysis ${analysisId} not found: ${analysisError?.message}`);
  }

  // Supabase typing returns related rows as either object or array depending on FK.
  const permitSet = Array.isArray(analysis.permit_sets)
    ? analysis.permit_sets[0]
    : analysis.permit_sets;
  if (!permitSet) {
    throw new Error(`Analysis ${analysisId} has no linked permit set`);
  }

  try {
    await supabase.from("analyses").update({ status: "extracting" }).eq("id", analysisId);
    const pdfBytes = await downloadPdfBytes(permitSet.storage_path);
    const extraction = await extractItems({
      pdfBytes,
      fileName: permitSet.file_name,
      categories: analysis.categories as Category[],
    });

    await supabase.from("analyses").update({ status: "scoring" }).eq("id", analysisId);
    const scoring = await scoreItems(extraction.items);

    if (scoring.items.length > 0) {
      const { error: insertError } = await supabase.from("material_items").insert(
        scoring.items.map((item) => ({
          analysis_id: analysisId,
          category: item.category,
          mark: item.mark,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          specs: item.specs,
          dimensions: item.dimensions,
          certifications: item.certifications,
          import_suitability_score: item.import_suitability_score,
          import_suitability_reasoning: item.import_suitability_reasoning,
          estimated_savings_low_pct: item.estimated_savings_low_pct,
          estimated_savings_high_pct: item.estimated_savings_high_pct,
          risk_notes: item.risk_notes,
        })),
      );
      if (insertError) {
        throw new Error(`Failed to persist material items: ${insertError.message}`);
      }
    }

    await supabase.from("analyses").update({ status: "summarizing" }).eq("id", analysisId);
    const summary = await summarizeAnalysis(scoring.items);

    const { error: summaryError } = await supabase.from("analysis_summaries").insert({
      analysis_id: analysisId,
      executive_summary: summary.executive_summary,
      total_items: scoring.items.length,
      total_estimated_savings_low_pct: summary.total_estimated_savings_low_pct,
      total_estimated_savings_high_pct: summary.total_estimated_savings_high_pct,
      key_risks: summary.key_risks,
      recommended_next_steps: summary.recommended_next_steps,
    });
    if (summaryError) {
      throw new Error(`Failed to persist summary: ${summaryError.message}`);
    }

    await supabase
      .from("analyses")
      .update({ status: "complete", completed_at: new Date().toISOString() })
      .eq("id", analysisId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("analyses")
      .update({ status: "failed", error_message: message, completed_at: new Date().toISOString() })
      .eq("id", analysisId);
    throw err;
  }
}
