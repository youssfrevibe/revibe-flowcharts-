-- Revibe Flowcharts — schema migration
-- Run this once in the Supabase SQL editor for the project used by this app.
-- The app degrades gracefully until this is applied (version history & archiving
-- simply stay dormant), and lights the features up immediately after.

-- 1) Soft-delete support for flowcharts (safer than a hard delete for everyone).
alter table if exists public.flowcharts
  add column if not exists archived boolean not null default false;

create index if not exists flowcharts_archived_idx
  on public.flowcharts (archived);

-- 2) Version history: append-only snapshots of a flowchart's contents.
create table if not exists public.flowchart_versions (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null,
  nodes       jsonb not null default '[]'::jsonb,
  connections jsonb not null default '[]'::jsonb,
  node_count  integer not null default 0,
  label       text,
  author_name text,
  created_at  timestamptz not null default now()
);

create index if not exists flowchart_versions_slug_created_idx
  on public.flowchart_versions (slug, created_at desc);
