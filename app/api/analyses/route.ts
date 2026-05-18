import { NextResponse, after } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runAnalysis } from "@/lib/analysis/run";
import { CATEGORIES } from "@/lib/analysis/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z.object({
  fileName: z.string().min(1),
  storagePath: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  categories: z.array(z.enum(CATEGORIES)).min(1).default([...CATEGORIES]),
});

export async function POST(request: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request body" },
      { status: 400 },
    );
  }

  const supabase = supabaseAdmin();

  const { data: permitSet, error: permitSetError } = await supabase
    .from("permit_sets")
    .insert({
      file_name: body.fileName,
      storage_path: body.storagePath,
      size_bytes: body.sizeBytes,
    })
    .select("id")
    .single();

  if (permitSetError || !permitSet) {
    return NextResponse.json(
      { error: permitSetError?.message ?? "Failed to create permit set" },
      { status: 500 },
    );
  }

  const { data: analysis, error: analysisError } = await supabase
    .from("analyses")
    .insert({
      permit_set_id: permitSet.id,
      categories: body.categories,
      status: "pending",
    })
    .select("id")
    .single();

  if (analysisError || !analysis) {
    return NextResponse.json(
      { error: analysisError?.message ?? "Failed to create analysis" },
      { status: 500 },
    );
  }

  // Run after the response is sent. `after()` keeps the function alive on
  // serverless runtimes; failures are written to analyses.error_message
  // inside runAnalysis itself, so the client surfaces them via the polling
  // endpoint.
  after(async () => {
    try {
      await runAnalysis(analysis.id);
    } catch (err) {
      console.error(`runAnalysis(${analysis.id}) failed:`, err);
    }
  });

  return NextResponse.json({ analysisId: analysis.id }, { status: 202 });
}
