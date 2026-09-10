# Persistence — `src/lib/diagram-store.ts`, `src/app/api/**`

Three layers: `localStorage` (instant), Supabase via API routes (authoritative),
`flowchart_versions` (history).

## Storage keys

| Key | Holds |
|---|---|
| `flowchart-<slug>` | one document's `FlowData` |
| `flowchart-<slug>-unsaved` | a document a save could not deliver — see **Unsaved recovery** |
| `revibe_flowchart_list_cache` | the gallery list |
| `flow_layout_prefs_<slug>` | per-diagram layout preferences |
| `flow_arrange_on_open` | slug awaiting a one-time arrange after import |
| `flow_node_templates` | saved node templates |
| AI settings, user identity | see `lib/ai-settings.ts`, `lib/user.ts` |

## Load sequence — the important part

```
1. getCachedData(slug)  → paint immediately from localStorage
2. readCloudDoc(slug)   → "ok" | "absent" | "error"
3. setLoaded(true); setDocSettled(true) — but NOT on "error"
```

> **Trap.** Step 1 means `loaded` can be true while the document on screen is stale.
> Anything that rewrites the document on open must wait for **`docSettled`**, which
> is only set after step 2. Auto-arrange-on-import ran at step 1 and was silently
> overwritten by step 2 — the arrange logged success and the screen never changed.

> **Trap.** There used to be **two** document-load effects fetching the same slug in
> parallel; whichever response landed last won. Removed. There must be exactly one
> loader, at the `/* --- cloud load --- */` banner in `FlowCanvas.tsx`.

> **Trap — this one destroyed a real document.** Step 2 must distinguish *"nothing is
> stored here"* from *"the read failed"*. It used to return `null` for both, and the
> seeding rule below then fired during an outage and wrote the 24-node starter over a
> 115-node flowchart. Only a definite **404** means absent; a 5xx, a network error, or
> an unparseable body is `"error"`, and on `"error"` we seed nothing and leave
> `docSettled` **false**, so geometry capture and arrange-on-open cannot write the
> stale cache back over a newer cloud copy. `GET /api/flowcharts/[slug]` answers 404
> only for PostgREST `PGRST116` (no rows) and **503** when the database itself is
> unhappy — a dead database that answers 404 recreates the whole bug server-side.

If the cloud genuinely has nothing (404) and the cache has nothing, the default
template is seeded to the cloud so a fresh slug is not empty.

## Saving

`scheduleSave()` debounces 650ms, then `saveToCloud`. `saveStatus` drives the
indicator (`saved` / `saving` / `offline`); a failed save shows `offline` and the
local cache still holds the work.

Saves are **serialised and coalesced**. The debounce only merges edits inside one
650ms window; two saves a second apart used to fly independently, and since every POST
writes the whole document, a slow first request could land after a fast second one and
restore the older document. They now run on a chain, and a save that a newer one has
already superseded is skipped rather than sent. Only the newest save writes
`saveStatus`, or a slow failure would paint "offline" over a later success.

### A document save must not touch the name

`saveToCloud` sends `title`/`description` **only when they are actually known**, and
`POST /api/flowcharts` treats a missing title as "update the document, leave the
metadata alone" (it upserts with `title: slug` only when there is no row yet).

> **Trap — this renamed real diagrams.** The editor autosaved its `projectTitle` on
> every edit. That state starts from the gallery lookup, which falls back to the
> placeholder "Process Flowchart" until the list resolves — so on a slow or failed list
> fetch, the user's first edit renamed the diagram to the placeholder. Worse, the
> debounced save closed over the title from the render that scheduled it, so a rename
> made through PATCH was reverted 650ms later by the autosave that followed it.
> `title` is now `string | undefined` all the way from the page, the placeholder is
> display-only, and the save reads current values through refs.

### Unsaved recovery

A failed save stashes the document under `flowchart-<slug>-unsaved`; a successful one
clears it. On the next load, work that differs from the cloud copy is **offered back**
in a banner with Restore / Discard.

> **Why not just keep the cache.** The ordinary cache lives under the key the cloud
> read writes to, so the next successful load overwrote the very work that had never
> been saved — an editing session that ended during an outage was simply gone, silently.
> Neither copy may be chosen automatically: restoring would clobber whatever is in the
> cloud now, and discarding is the bug.

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

### What the two stage fields actually are

They are not "a stage and a synonym" — they are two different OMS columns, and the
UI names them verbatim so a card can be mapped onto the database without guessing:

| Field | OMS column | Audience |
|---|---|---|
| `internalStage` | `claim_return_details.return_claim_stage` | ops team |
| `externalStage` | `order_product_claims_new.stage` | the customer |

The values differ too: `return_claim_stage` is unnumbered (`Under revision`), while
`stage` is numbered (`18. Under revision`).

**A card headline that names a stage must read `return_claim_stage = <value>`.** Bare
`stage = <value>` is the trap: it reads as the *customer-facing* column, so the same
diagram ends up describing two different things with one word. `DiagramStats` lints for
it ("Wrong stage header") and `ai-schema.ts` forbids it in both AI prompts. The older
`internal_stage` / `external_stage` spellings are dead — they survive only as import
aliases in `migrateNodeFields`, never in new labels or UI.

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

`supabase-migration.sql`, then `supabase-migration-2.sql`, run in the Supabase SQL
editor. Both are idempotent.

Migration 2 moves durability into the database rather than trusting the client for it:
`updated_at` is set by a trigger (the gallery sorts on it, and two saves landing out of
order could move it backwards); a snapshot is written to `flowchart_versions` before any
write that changes the document, throttled to a 5-minute cadence plus any write that
changes the node count by 10% or more; those snapshots are pruned to the most recent 50
per slug; and RLS is enabled with no policy, which closes the tables to the anon key
without affecting the app (every query goes through an API route on the service role).
It also carries a commented-out trigger that refuses a write shrinking a diagram by 80%
or more — the shape of an incident that has actually happened here, left off because
"select all, delete" is legitimate and the snapshot already makes it recoverable.

Migration 1:

- `flowcharts.archived boolean not null default false` (+ index)
- `flowchart_versions` — append-only `(id, slug, nodes, connections, node_count,
  label, author_name, created_at)`, indexed on `(slug, created_at desc)`

Until it runs, archiving and version history stay dormant rather than erroring.

## Builtins vs custom

`BUILTIN_DIAGRAMS` are seeded from `lib/initial-data.ts` / `lib/kb-data.ts` and
carry fixed slugs; custom ones get `custom-<base36 timestamp>`. `mergeList`
reconciles the cloud list with the builtins so a builtin never disappears from the
gallery. `resetToDefault(slug)` only means anything for a builtin.
