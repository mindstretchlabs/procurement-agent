"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

const MAX_BYTES = 100 * 1024 * 1024;

export function UploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!file) {
      setError("Pick a permit set PDF first.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`File is ${(file.size / 1024 / 1024).toFixed(1)} MB. Max for the MVP is 100 MB.`);
      return;
    }

    setSubmitting(true);
    try {
      setStatus("Requesting upload URL…");
      const uploadUrlResponse = await fetch("/api/permit-sets/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, sizeBytes: file.size }),
      });
      if (!uploadUrlResponse.ok) {
        throw new Error((await uploadUrlResponse.json()).error ?? "Upload URL request failed");
      }
      const { storagePath, token } = (await uploadUrlResponse.json()) as {
        storagePath: string;
        signedUrl: string;
        token: string;
      };

      setStatus("Uploading PDF…");
      const supabase = supabaseBrowser();
      const { error: uploadError } = await supabase.storage
        .from("permit-sets")
        .uploadToSignedUrl(storagePath, token, file, { contentType: "application/pdf" });
      if (uploadError) throw new Error(uploadError.message);

      setStatus("Kicking off analysis…");
      const createResponse = await fetch("/api/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          storagePath,
          sizeBytes: file.size,
        }),
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
      <label className="block text-sm font-medium text-ink/80">Permit set PDF</label>
      <input
        type="file"
        accept="application/pdf"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        disabled={submitting}
        className="mt-3 block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-ink file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-ink/90"
      />
      <p className="mt-2 text-xs text-ink/50">
        Drawings + schedules in one PDF. Max 100 MB.
      </p>

      <button
        type="submit"
        disabled={submitting || !file}
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
