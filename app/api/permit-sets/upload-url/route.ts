import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env.server";

export const runtime = "nodejs";

const bodySchema = z.object({
  fileName: z.string().min(1).max(200),
  sizeBytes: z.number().int().positive().max(100 * 1024 * 1024),
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

  const safeName = body.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${crypto.randomUUID()}/${safeName}`;

  const supabase = supabaseAdmin();
  const { data, error } = await supabase.storage
    .from(serverEnv.SUPABASE_STORAGE_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to create upload URL" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    storagePath,
    signedUrl: data.signedUrl,
    token: data.token,
  });
}
