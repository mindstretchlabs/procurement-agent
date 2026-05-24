"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

const MAX_BYTES = 100 * 1024 * 1024;

type InputMode = "file" | "url";

export function UploadForm() {
  const router = useRouter();
  const [mode, setMode] = useState<InputMode>("file");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const hasInput = mode === "file" ? !!file : url.trim().length > 0;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (mode === "file") {
      if (!file) {
        setError("Pick a permit set PDF first.");
        return;
      }
      if (file.size > MAX_BYTES) {
        setError(`File is ${(file.size / 1024 / 1024).toFixed(1)} MB. Max 100 MB for direct upload. Use a Google Drive or Dropbox link for larger files.`);
        return;
      }
    } else {
      if (!url.trim()) {
        setError("Paste a Google Drive or Dropbox link.");
        return;
      }
    }

    setSubmitting(true);
    try {
      let storagePath: string;
      let fileName: string;
      let sizeBytes: number;

      if (mode === "url") {
        setStatus("Downloading from link…");
        const fromUrlResponse = await fetch("/api/permit-sets/from-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim() }),
        });
        if (!fromUrlResponse.ok) {
          throw new Error((await fromUrlResponse.json()).error ?? "Download from URL failed");
        }
        const result = (await fromUrlResponse.json()) as {
          storagePath: string;
          fileName: string;
          sizeBytes: number;
        };
        storagePath = result.storagePath;
        fileName = result.fileName;
        sizeBytes = result.sizeBytes;
      } else {
        setStatus("Requesting upload URL…");
        const uploadUrlResponse = await fetch("/api/permit-sets/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file!.name, sizeBytes: file!.size }),
        });
        if (!uploadUrlResponse.ok) {
          throw new Error((await uploadUrlResponse.json()).error ?? "Upload URL request failed");
        }
        const { storagePath: sp, token } = (await uploadUrlResponse.json()) as {
          storagePath: string;
          signedUrl: string;
          token: string;
        };

        setStatus("Uploading PDF…");
        const supabase = supabaseBrowser();
        const { error: uploadError } = await supabase.storage
          .from("permit-sets")
          .uploadToSignedUrl(sp, token, file!, { contentType: "application/pdf" });
        if (uploadError) throw new Error(uploadError.message);

        storagePath = sp;
        fileName = file!.name;
        sizeBytes = file!.size;
      }

      setStatus("Kicking off analysis…");
      const createResponse = await fetch("/api/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName, storagePath, sizeBytes }),
      });
      if (!createResponse.ok) {
        throw new Error((await createResponse.json()).error ?? "Analysis request failed");
      }
      const { analysisId } = (await createResponse.json()) as { analysisId: string };
      router.push(`/analyses/${analysisId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
      setStatus("");
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-ink/10 bg-white p-8 shadow-sm">
      <div className="flex gap-2 mb-5">
        <button
          type="button"
          onClick={() => setMode("file")}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
            mode === "file" ? "bg-ink text-white" : "text-ink/60 hover:bg-ink/5"
          }`}
        >
          Upload file
        </button>
        <button
          type="button"
          onClick={() => setMode("url")}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
            mode === "url" ? "bg-ink text-white" : "text-ink/60 hover:bg-ink/5"
          }`}
        >
          Google Drive / Dropbox link
        </button>
      </div>

      {mode === "file" ? (
        <>
          <label className="block text-sm font-medium text-ink/80">Permit set PDF</label>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={submitting}
            className="mt-3 block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-ink file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-ink/90"
          />
          <p className="mt-2 text-xs text-ink/50">
            Max 100 MB for direct upload. Use a link for larger files.
          </p>
        </>
      ) : (
        <>
          <label className="block text-sm font-medium text-ink/80">
            Share link to permit set PDF
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://drive.google.com/file/d/... or https://dropbox.com/s/..."
            disabled={submitting}
            className="mt-3 block w-full rounded-md border border-ink/20 px-3 py-2 text-sm placeholder:text-ink/30 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <p className="mt-2 text-xs text-ink/50">
            Google Drive: use &quot;Share → Anyone with the link&quot;. Dropbox: use a share link. No size limit.
          </p>
        </>
      )}

      <button
        type="submit"
        disabled={submitting || !hasInput}
        className="mt-6 inline-flex items-center justify-center rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-ink/20"
      >
        {submitting ? "Working…" : "Run import analysis"}
      </button>

      {status && !error && (
        <p className="mt-4 text-sm text-ink/70" role="status">
          {status}
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
