import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env.server";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  url: z.string().url(),
  fileName: z.string().min(1).max(200).optional(),
});

function toDirectDownloadUrl(url: string): { downloadUrl: string; inferredName: string | null } {
  const parsed = new URL(url);

  // Google Drive: /file/d/{ID}/view → /uc?export=download&id={ID}
  const gdriveMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/);
  if (parsed.hostname.includes("drive.google.com") && gdriveMatch) {
    return {
      downloadUrl: `https://drive.usercontent.google.com/download?id=${gdriveMatch[1]}&export=download&confirm=t`,
      inferredName: null,
    };
  }

  // Google Drive: open?id={ID}
  if (parsed.hostname.includes("drive.google.com") && parsed.searchParams.has("id")) {
    const id = parsed.searchParams.get("id")!;
    return {
      downloadUrl: `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`,
      inferredName: null,
    };
  }

  // Dropbox: change dl=0 to dl=1
  if (parsed.hostname.includes("dropbox.com")) {
    parsed.searchParams.set("dl", "1");
    const pathParts = parsed.pathname.split("/");
    const name = pathParts[pathParts.length - 1] || null;
    return { downloadUrl: parsed.toString(), inferredName: name };
  }

  // Direct URL — use as-is
  const pathParts = parsed.pathname.split("/");
  const name = pathParts[pathParts.length - 1] || null;
  return { downloadUrl: url, inferredName: name };
}

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

  const { downloadUrl, inferredName } = toDirectDownloadUrl(body.url);
  const fileName = body.fileName ?? inferredName ?? "permit-set.pdf";

  try {
    const response = await fetch(downloadUrl, {
      redirect: "follow",
      headers: { "User-Agent": "SourceProBuild/1.0" },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to download file: HTTP ${response.status}` },
        { status: 502 },
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("pdf") && !contentType.includes("octet-stream")) {
      return NextResponse.json(
        {
          error: `Expected a PDF but got ${contentType}. Make sure the link is a direct file share (not a folder or preview page).`,
        },
        { status: 400 },
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const sizeBytes = arrayBuffer.byteLength;

    if (sizeBytes > 500 * 1024 * 1024) {
      return NextResponse.json({ error: "File exceeds 500 MB limit" }, { status: 400 });
    }

    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${crypto.randomUUID()}/${safeName}`;

    const supabase = supabaseAdmin();
    const { error: uploadError } = await supabase.storage
      .from(serverEnv.SUPABASE_STORAGE_BUCKET)
      .upload(storagePath, Buffer.from(arrayBuffer), {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: `Storage upload failed: ${uploadError.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ storagePath, fileName: safeName, sizeBytes });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Download failed" },
      { status: 502 },
    );
  }
}
