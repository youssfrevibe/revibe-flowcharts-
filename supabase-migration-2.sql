-- Revibe Flowcharts — migration 2: durability, and a name that cannot be clobbered
--
-- Paste this whole file into the Supabase SQL editor and Run. It is idempotent: running
-- it twice is harmless, and every statement guards itself, so it is safe on a database
-- where migration 1 has or has not been applied.
--
-- What this adds, and why:
--   1. `updated_at` maintained by the database rather than trusted from the client.
--   2. An automatic snapshot into `flowchart_versions` before any write that changes the
--      document, throttled so ordinary editing does not create thousands of rows.
--   3. Retention, so those snapshots cannot grow without bound.
--   4. Row Level Security switched on with no public policy (the app talks to these
--      tables only through the service role, which bypasses RLS).
--   5. OPTIONAL, commented out: a hard stop on a write that would delete most of a
--      diagram in one go. Read the note before enabling it.


-- ---------------------------------------------------------------------------
-- 0) Safety: make sure the columns this migration relies on exist.
-- ---------------------------------------------------------------------------

alter table if exists public.flowcharts
  add column if not exists archived   boolean     not null default false,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists flowcharts_archived_idx on public.flowcharts (archived);
create index if not exists flowcharts_updated_idx  on public.flowcharts (updated_at desc);

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


-- ---------------------------------------------------------------------------
-- 1) `updated_at` is the database's job.
--
-- The client sends one on every write, so a machine with a wrong clock, or two saves
-- landing out of order, could move it backwards. The gallery sorts on this column.
-- ---------------------------------------------------------------------------

create or replace function public.flowcharts_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists flowcharts_touch_updated_at on public.flowcharts;
create trigger flowcharts_touch_updated_at
  before update on public.flowcharts
  for each row
  execute function public.flowcharts_touch_updated_at();


-- ---------------------------------------------------------------------------
-- 2) Snapshot before the document changes.
--
-- The app already snapshots on a timer and before anything it knows to be destructive,
-- but that is the client deciding to protect you. This does it in the database, so a
-- bug, a stale tab or a hand-written UPDATE in this very editor is still recoverable.
--
-- Throttled deliberately: the editor autosaves ~650ms after you stop typing, and a
-- snapshot per keystroke-burst would bury the useful history. A snapshot is taken when
--   * the node or connection JSON actually changed, AND
--   * either nothing has been snapshotted for this slug in 5 minutes,
--     or this single write changes the node count by 10% or more.
-- ---------------------------------------------------------------------------

create or replace function public.flowcharts_snapshot_before_change()
returns trigger
language plpgsql
as $$
declare
  last_snapshot timestamptz;
  old_count     integer := coalesce(old.node_count, 0);
  new_count     integer := coalesce(new.node_count, 0);
  big_change    boolean;
begin
  -- Metadata-only edits (rename, recolour, archive) are not worth a snapshot.
  if new.nodes is not distinct from old.nodes
     and new.connections is not distinct from old.connections then
    return new;
  end if;

  big_change := old_count > 0
                and abs(new_count - old_count)::numeric / old_count >= 0.10;

  select max(created_at) into last_snapshot
    from public.flowchart_versions
   where slug = old.slug;

  if big_change
     or last_snapshot is null
     or last_snapshot < now() - interval '5 minutes' then
    insert into public.flowchart_versions (slug, nodes, connections, node_count, label, author_name)
    values (
      old.slug,
      old.nodes,
      old.connections,
      old_count,
      case when big_change
           then format('auto: before %s → %s steps', old_count, new_count)
           else 'auto: periodic' end,
      'database'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists flowcharts_snapshot_before_change on public.flowcharts;
create trigger flowcharts_snapshot_before_change
  before update on public.flowcharts
  for each row
  execute function public.flowcharts_snapshot_before_change();


-- ---------------------------------------------------------------------------
-- 3) Retention: keep the 50 most recent snapshots per diagram.
--
-- Without this, automatic snapshots grow forever. 50 is generous — it is every large
-- change plus a five-minute cadence through a long editing session.
-- ---------------------------------------------------------------------------

create or replace function public.flowchart_versions_prune()
returns trigger
language plpgsql
as $$
begin
  delete from public.flowchart_versions v
   where v.slug = new.slug
     and v.id not in (
       select id from public.flowchart_versions
        where slug = new.slug
        order by created_at desc
        limit 50
     );
  return null;
end;
$$;

drop trigger if exists flowchart_versions_prune on public.flowchart_versions;
create trigger flowchart_versions_prune
  after insert on public.flowchart_versions
  for each row
  execute function public.flowchart_versions_prune();


-- ---------------------------------------------------------------------------
-- 4) Row Level Security.
--
-- Every read and write from the app goes through a Next.js API route using the service
-- role key, which bypasses RLS. The browser only ever uses the anon key for Realtime
-- broadcast and presence, which does not touch these tables. So enabling RLS with no
-- policy changes nothing for the app and closes the tables to anonymous callers.
--
-- If you ever add a client-side query against these tables, it will start returning
-- nothing — that is the signal to add a considered policy, not to disable this.
-- ---------------------------------------------------------------------------

alter table public.flowcharts          enable row level security;
alter table public.flowchart_versions  enable row level security;


-- ---------------------------------------------------------------------------
-- 5) OPTIONAL — refuse a write that wipes most of a diagram.
--
-- This is the shape of the incident that has actually happened here: a 115-node document
-- replaced by a 24-node starter template in one write. The application-side cause is
-- fixed, and the snapshot above makes any recurrence recoverable, so this is belt and
-- braces rather than necessary.
--
-- The reason it is commented out: "select all, delete" is a legitimate thing to do, and
-- with this enabled it fails with an error instead. Enable it only if you would rather
-- be interrupted than trust the snapshot.
--
-- To bypass it for one statement:
--     set local app.allow_shrink = 'on';
-- ---------------------------------------------------------------------------

-- create or replace function public.flowcharts_block_mass_delete()
-- returns trigger
-- language plpgsql
-- as $$
-- declare
--   old_count integer := coalesce(old.node_count, 0);
--   new_count integer := coalesce(new.node_count, 0);
-- begin
--   if current_setting('app.allow_shrink', true) = 'on' then
--     return new;
--   end if;
--   if old_count >= 25 and new_count::numeric / old_count <= 0.20 then
--     raise exception
--       'Refusing to shrink "%" from % steps to % in one write. A snapshot was taken; '
--       'if this is intended run:  set local app.allow_shrink = ''on'';',
--       old.slug, old_count, new_count;
--   end if;
--   return new;
-- end;
-- $$;
--
-- drop trigger if exists flowcharts_block_mass_delete on public.flowcharts;
-- create trigger flowcharts_block_mass_delete
--   before update on public.flowcharts
--   for each row
--   execute function public.flowcharts_block_mass_delete();


-- ---------------------------------------------------------------------------
-- Check it worked.
-- ---------------------------------------------------------------------------

select
  (select count(*) from pg_trigger
    where tgrelid = 'public.flowcharts'::regclass and not tgisinternal) as flowchart_triggers,
  (select count(*) from pg_trigger
    where tgrelid = 'public.flowchart_versions'::regclass and not tgisinternal) as version_triggers,
  (select relrowsecurity from pg_class where oid = 'public.flowcharts'::regclass) as flowcharts_rls,
  (select count(*) from public.flowchart_versions) as snapshots_stored;
