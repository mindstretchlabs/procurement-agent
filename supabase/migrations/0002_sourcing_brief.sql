-- Add 'translating' status to the pipeline
alter type analysis_status add value if not exists 'translating' after 'summarizing';

create table if not exists public.sourcing_briefs (
  id               uuid primary key default gen_random_uuid(),
  analysis_id      uuid not null unique references public.analyses(id) on delete cascade,
  project_title_zh text not null,
  intro_zh         text not null,
  items_zh         jsonb not null,
  notes_zh         text,
  created_at       timestamptz not null default now()
);
