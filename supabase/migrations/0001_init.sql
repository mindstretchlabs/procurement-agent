-- SourceProBuild MVP schema: permit set ingestion + import analysis

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'analysis_status') then
    create type analysis_status as enum (
      'pending',
      'extracting',
      'scoring',
      'summarizing',
      'complete',
      'failed'
    );
  end if;
end$$;

create table if not exists public.permit_sets (
  id           uuid primary key default gen_random_uuid(),
  file_name    text not null,
  storage_path text not null unique,
  size_bytes   bigint not null,
  uploaded_at  timestamptz not null default now()
);

create table if not exists public.analyses (
  id            uuid primary key default gen_random_uuid(),
  permit_set_id uuid not null references public.permit_sets(id) on delete cascade,
  status        analysis_status not null default 'pending',
  categories    text[] not null default array['windows', 'doors', 'flooring'],
  error_message text,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create index if not exists analyses_permit_set_id_idx on public.analyses(permit_set_id);
create index if not exists analyses_status_idx on public.analyses(status);

create table if not exists public.material_items (
  id                          uuid primary key default gen_random_uuid(),
  analysis_id                 uuid not null references public.analyses(id) on delete cascade,
  category                    text not null check (category in ('windows', 'doors', 'flooring')),
  mark                        text,
  description                 text not null,
  quantity                    numeric,
  unit                        text,
  specs                       jsonb,
  dimensions                  jsonb,
  certifications              text[],
  import_suitability_score    numeric check (import_suitability_score between 0 and 100),
  import_suitability_reasoning text,
  estimated_savings_low_pct   numeric,
  estimated_savings_high_pct  numeric,
  risk_notes                  text,
  created_at                  timestamptz not null default now()
);

create index if not exists material_items_analysis_id_idx on public.material_items(analysis_id);
create index if not exists material_items_category_idx on public.material_items(category);

create table if not exists public.analysis_summaries (
  id                              uuid primary key default gen_random_uuid(),
  analysis_id                     uuid not null unique references public.analyses(id) on delete cascade,
  executive_summary               text not null,
  total_items                     integer not null,
  total_estimated_savings_low_pct numeric,
  total_estimated_savings_high_pct numeric,
  key_risks                       text[],
  recommended_next_steps          text[],
  created_at                      timestamptz not null default now()
);

-- This MVP uses the service role on the server only. No client-side reads happen
-- against these tables. Leaving RLS off until an auth model is introduced.
