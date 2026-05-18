# Claude Code working notes

This repo is the SourceProBuild MVP: permit-set PDF → import sourcing analysis for windows, doors, and flooring.

## Stack
- Next.js 15 App Router, React 19, TypeScript strict
- Supabase (Postgres + Storage), service role server-side only
- Anthropic SDK calling `claude-opus-4-7` with structured JSON output

## Conventions

- **Model**: always `claude-opus-4-7` (defined in `lib/analysis/anthropic.ts`). Do not downgrade unless the user asks.
- **No sampling params**: Opus 4.7 rejects `temperature`, `top_p`, `top_k`, and `budget_tokens`. Use `output_config.effort` if depth control is needed.
- **Structured output**: every Claude call uses `output_config.format: {type: "json_schema", schema}`. Schemas live alongside the call site in `lib/analysis/*.ts`. Always validate the parsed JSON with the matching Zod schema from `lib/analysis/types.ts` before persisting.
- **Server-only modules** (`lib/env.server.ts`, `lib/supabase/admin.ts`, `lib/analysis/*.ts`) import `"server-only"` so they cannot accidentally end up in the client bundle. Keep it that way.
- **Env vars**: `lib/env.ts` is public-only; `lib/env.server.ts` is server-only. Never pull a service-role secret through `lib/env.ts`.
- **Path alias**: `@/` maps to repo root via `tsconfig.json`.

## Add a new pipeline stage

1. Define input + output Zod schemas in `lib/analysis/types.ts`.
2. Add a file under `lib/analysis/<stage>.ts` that exports an async function returning the validated output.
3. Wire it into `lib/analysis/run.ts` between the existing stages, updating the `analyses.status` enum if you add a new state (see `supabase/migrations/0001_init.sql`).
4. If the output should be persisted, add a table + insert step.

## Add a new category (e.g. cabinets)

1. Add to `CATEGORIES` in `lib/analysis/types.ts`.
2. Update the `material_items.category` check constraint via a new migration.
3. Update extraction + scoring system prompts in `lib/analysis/extract.ts` and `lib/analysis/score.ts` with category-specific guidance.

## Tests

No test suite yet. Smoke test by running `npm run dev`, uploading a real permit set, and checking the analysis page.

## Commands

```
npm run dev        # local dev server
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
```
