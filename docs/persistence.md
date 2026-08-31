# Persistence — `src/lib/diagram-store.ts`, `src/app/api/**`

Three layers: `localStorage` (instant), Supabase via API routes (authoritative),
`flowchart_versions` (history).

## Storage keys

| Key | Holds |
|---|---|
| `flowchart-<slug>` | one document's `FlowData` |
| `revibe_flowchart_list_cache` | the gallery list |
| `flow_layout_prefs_<slug>` | per-diagram layout preferences |
| `flow_arrange_on_open` | slug awaiting a one-time arrange after import |
| `flow_node_templates` | saved node templates |
| AI settings, user identity | see `lib/ai-settings.ts`, `lib/user.ts` |

## Load sequence — the important part

```
1. getCachedData(slug)   → paint immediately from localStorage
2. fetchCloudData(slug)  → replace with the authoritative copy
3. setLoaded(true); setDocSettled(true)
```

> **Trap.** Step 1 means `loaded` can be true while the document on screen is stale.
> Anything that rewrites the document on open must wait for **`docSettled`**, which
> is only set after step 2. Auto-arrange-on-import ran at step 1 and was silently
> overwritten by step 2 — the arrange logged success and the screen never changed.

> **Trap.** There used to be **two** document-load effects fetching the same slug in
> parallel; whichever response landed last won. Removed. There must be exactly one
> loader, at the `/* --- cloud load --- */` banner in `FlowCanvas.tsx`.

If the cloud has nothing and the cache has nothing, the default template is seeded
to the cloud so a fresh slug is not empty.

## Saving

`scheduleSave()` debounces 650ms, then `saveToCloud`. `saveStatus` drives the
indicator (`saved` / `saving` / `offline`); a failed save shows `offline` and the
local cache still holds the work.

A version snapshot is taken at most once per 3 minutes of active editing, plus
explicitly via `snapshotNow(label)` before anything destructive — import, AI edit,
reset. When adding a destructive operation, call `snapshotNow` first.

## Normalisation on load

`normalize()` runs on every load and import:

- `backfillConnIds` — legacy connections without ids get `from__to`. Realtime needs
  stable ids; `connId(c)` is the tolerant accessor, use it rather than `c.id`.
- `migrateNodeFields` — folds `newOmsStage`, `return_internal_stage` /
  `return_external_stage` snake_case aliases, and the deprecated `stage` +
  `stageKind` pair into `internalStage` / `externalStage`.

> Unknown properties are **deliberately preserved**. Imported Revibe JSON carries
> app-specific extras (`newOmsFlow`, `oldAppStatus`, …) and nothing is dropped on
> save. Do not add a whitelist-style sanitiser.

## API routes

| Route | Does |
|---|---|
| `GET/POST /api/flowcharts` | list (`?archived=1`) / create |
| `GET/PATCH/DELETE /api/flowcharts/[slug]` | read / archive-unarchive / hard delete |
| `GET/POST /api/flowcharts/[slug]/versions` | list or fetch one / snapshot |

Server-side only, using `SUPABASE_SERVICE_ROLE_KEY`. `PATCH` is the soft delete
(`archived` boolean); `DELETE` is permanent and only reachable from the archived
view.

The list route tries the archive-aware query first and **falls back when the
`archived` column does not exist**, so the app works before the migration is run.
Keep that fallback if you touch the query.

Version snapshots are pruned on write: the 50 most recent per slug are kept.

## Database

`supabase-migration.sql`, run once in the Supabase SQL editor:

- `flowcharts.archived boolean not null default false` (+ index)
- `flowchart_versions` — append-only `(id, slug, nodes, connections, node_count,
  label, author_name, created_at)`, indexed on `(slug, created_at desc)`

Until it runs, archiving and version history stay dormant rather than erroring.

## Builtins vs custom

`BUILTIN_DIAGRAMS` are seeded from `lib/initial-data.ts` / `lib/kb-data.ts` and
carry fixed slugs; custom ones get `custom-<base36 timestamp>`. `mergeList`
reconciles the cloud list with the builtins so a builtin never disappears from the
gallery. `resetToDefault(slug)` only means anything for a builtin.
