# SourceProBuild — AI Procurement Analyst

MVP for converting construction permit sets into import sourcing analyses for **windows, doors, and flooring**.

Built on Next.js 15 (App Router) + Supabase (Storage, Postgres) + Claude (Opus 4.7) via the official Anthropic SDK.

## What it does

1. User uploads a permit set PDF (≤ 100 MB).
2. PDF is stored in Supabase Storage and a row is created in `permit_sets` + `analyses`.
3. A background task (Next.js `after()`) runs three Claude calls:
   - **Extract** — Claude reads the PDF as a `document` content block and returns structured JSON for every window / door / flooring schedule item (quantities, dimensions, specs, certifications).
   - **Score** — each item gets a 0–100 import-suitability score, savings range, and risk notes.
   - **Summarize** — an executive memo with key risks and recommended next steps.
4. The frontend polls the analysis status and renders a decision-ready report when complete.

## Stack

- **Next.js 15** App Router, React 19, Tailwind 3
- **Supabase** Postgres + Storage (service role used server-side; anon key for the upload-via-signed-URL flow)
- **Anthropic SDK** `@anthropic-ai/sdk` calling `claude-opus-4-7` with `output_config.format` JSON schemas
- **Zod** for env + API response validation

## Setup

### 1. Install

```bash
npm install
```

### 2. Supabase

Create a project at supabase.com, then:

```bash
# Run the migration in the SQL editor or via the Supabase CLI:
supabase db push
# or paste the contents of supabase/migrations/0001_init.sql into the SQL editor
```

Create a private Storage bucket named `permit-sets`:

- Bucket name: `permit-sets`
- Public: **off**
- File size limit: 100 MB (matches the API guard)
- Allowed MIME types: `application/pdf` (optional)

### 3. Environment

```bash
cp .env.example .env.local
# Fill in:
#   ANTHROPIC_API_KEY
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY
#   SUPABASE_SERVICE_ROLE_KEY
```

### 4. Run

```bash
npm run dev
```

Open <http://localhost:3000>, upload a permit set, and follow the analysis page.

## Layout

```
app/
  api/
    analyses/route.ts            # POST: create analysis, kick off background work
    analyses/[id]/route.ts       # GET: status + completed report
    permit-sets/upload-url/route.ts  # POST: signed Supabase Storage upload URL
  analyses/[id]/page.tsx         # Client report page (polls the GET endpoint)
  page.tsx                       # Landing + upload form
lib/
  analysis/
    extract.ts                   # Claude PDF → schedule items
    score.ts                     # Claude items → scored items
    summarize.ts                 # Claude scored items → executive memo
    run.ts                       # Orchestrator (writes to Postgres between stages)
    types.ts                     # Zod schemas shared with Claude JSON schemas
    anthropic.ts                 # Singleton Anthropic client + MODEL_ID
  supabase/
    admin.ts                     # Server-only service-role client
    client.ts                    # Browser anon client (used only for the signed upload)
  env.ts / env.server.ts         # Split so server secrets never reach the bundle
supabase/
  migrations/0001_init.sql       # Schema
components/
  upload-form.tsx                # Client upload flow
  analysis-report.tsx            # Polling report viewer
```

## Out of scope for this build

This is **Module 1 + 2** of the broader SourceProBuild vision. Intentionally **not** in this MVP:

- RFQ generation (English + Chinese packets)
- WeChat supplier copilot
- Quote normalization across FOB / EXW / DDP
- Auth / multi-tenant projects
- Background queue (currently uses Next.js `after()` — fine for single-server, replace with a queue when scaling)
- PDFs > ~100 MB or > 100 pages (Claude's PDF page cap; chunking by sheet not yet implemented)

## Notes on the Claude calls

- Model: `claude-opus-4-7` (best capability for spec-heavy document understanding).
- Each stage uses `output_config.format` with a strict JSON schema, then validates the response with the matching Zod schema. The schemas are co-defined in `lib/analysis/types.ts`.
- The extraction stage uploads the PDF via the Anthropic Files API (beta) and references it by `file_id` in a `document` content block. The uploaded file is deleted after extraction. No client-side PDF parsing; Claude reads it directly.
- We do **not** use `temperature`, `top_p`, `top_k`, or `budget_tokens` (all removed on Opus 4.7).
